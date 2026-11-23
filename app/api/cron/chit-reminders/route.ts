// The daily chit reminder run.
//
// Called by Vercel cron. One schedule covers the whole chit business (v138),
// so for every user it reads their steps once, then walks each active group:
// which steps fall on today, who they are for, which message each one sends,
// and sends it — or records why it could not.
//
// Nothing here decides WHEN anything goes out: that is
// lib/chit/reminderSchedule.ts. Nothing here works out a figure: that is
// lib/chit/messageFacts.ts. Both are pure and tested. This file is the
// plumbing around them.
//
// ── SAFE TO RUN TWICE ───────────────────────────────────────────────────────
//
// Every send is keyed auction + member + step, and chit_message_log has a
// unique index on those three. A duplicate insert fails at the database rather
// than relying on this code being right, so a re-run, an overlapping cron and
// a manual trigger on the same day cannot message anybody twice.
//
// ── IT WORKS BEFORE WHATSAPP IS LIVE ────────────────────────────────────────
//
// Until a business phone number is registered, sendTemplate reports 'not
// configured'. The run then records each due message as 'pending' instead of
// failing: the app can show them as a list, and the same rows become real
// sends the day the number is live. Nothing is lost in between.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  plan, sendKey, isSettledSend, DEFAULT_STEPS, type Step, type MemberLike,
} from '@/lib/chit/reminderSchedule'
import {
  fromRow, matchStepsToLibrary, templateById, renderVariables, fieldsUsed,
  type MessageTemplate,
} from '@/lib/chit/messageTemplates'
import { missingWords, usesResultFields, type MissingPolicy } from '@/lib/chit/messageFields'
import { factsFor, auctionSettled } from '@/lib/chit/messageFacts'
import { cloudConfig, sendTemplate } from '@/lib/whatsapp/cloud'
import { normalizeWhatsAppNumber } from '@/lib/whatsapp'
import { scheduledAuctionDate } from '@/lib/chit/messages'

// Service role: one run covers every user, so RLS is bypassed deliberately.
function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

const steps = (v: unknown): readonly Step[] =>
  Array.isArray(v) && v.length > 0 ? (v as Step[]) : DEFAULT_STEPS

/** A timestamp as the date it was in Tiruppur. */
function istDate(ts: unknown): string | null {
  const t = String(ts ?? '')
  if (!t) return null
  const d = new Date(t)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

export async function GET(req: NextRequest) {
  // Fail closed, exactly like the other crons: an unset secret must not leave
  // an endpoint that messages sixty people publicly callable.
  const auth = req.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = adminClient()
  const config = cloudConfig()
  // IST, because a chit auction's day is a local day. A run at 03:00 UTC is
  // 08:30 in Tiruppur, and the date must be the one the members are living in.
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

  const { data: groups } = await sb.from('chit_groups')
    .select('id, user_id, name, chit_value, members, auction_day, auction_time, start_date, status, commission_pct, bid_ceiling_pct, commission_model')
    .eq('status', 'active')

  // The library and the schedule are both one per user, shared by every group,
  // so they are fetched once per user rather than once per group.
  const libraries = new Map<string, MessageTemplate[]>()
  const settings = new Map<string, {
    steps: readonly Step[]
    duesDueDays: number | null
    missingPolicy: MissingPolicy
  }>()

  async function libraryFor(userId: string): Promise<MessageTemplate[]> {
    const had = libraries.get(userId)
    if (had) return had
    const { data } = await sb.from('chit_message_templates').select('*').eq('user_id', userId)
    const lib = ((data ?? []) as Record<string, unknown>[]).map(fromRow).filter(t => !t.archived)
    libraries.set(userId, lib)
    return lib
  }

  async function settingsFor(userId: string) {
    const had = settings.get(userId)
    if (had) return had
    const { data } = await sb.from('chit_settings')
      .select('reminder_steps, dues_due_days, missing_policy').eq('user_id', userId).maybeSingle()
    const value = {
      steps: steps(data?.reminder_steps),
      duesDueDays: (data?.dues_due_days as number | null) ?? null,
      missingPolicy: (data?.missing_policy ?? {}) as MissingPolicy,
    }
    settings.set(userId, value)
    return value
  }

  let sent = 0, pending = 0, failed = 0, considered = 0
  const notes: string[] = []

  for (const g of (groups ?? []) as Record<string, unknown>[]) {
    const groupId = String(g.id)
    const userId = String(g.user_id)

    // The auction this run is about: the most recent one held. Before the
    // first auction there is nothing anchored, so the group is skipped.
    const { data: auctions } = await sb.from('chit_auctions')
      .select('id, month_number, auction_date, winner_member_id, bid_amount, commission, net_payout, dividend_per_member, created_at')
      .eq('group_id', groupId)
      .lte('auction_date', today)
      .order('auction_date', { ascending: false })
      .limit(1)
    const auction = (auctions ?? [])[0] as Record<string, unknown> | undefined
    if (!auction) continue

    const monthNumber = Number(auction.month_number) || 0
    const auctionDate = String(auction.auction_date).slice(0, 10)

    // The next auction, for the step anchored to it. A row already in the
    // table beats the calendar; otherwise it is worked out from the group's
    // start date and auction day.
    const { data: future } = await sb.from('chit_auctions')
      .select('auction_date')
      .eq('group_id', groupId)
      .gt('auction_date', auctionDate)
      .order('auction_date', { ascending: true })
      .limit(1)
    const nextAuctionDate = (future ?? [])[0]
      ? String((future as Record<string, unknown>[])[0].auction_date).slice(0, 10)
      : scheduledAuctionDate(String(g.start_date ?? ''), Number(g.auction_day) || null, monthNumber + 1)

    const [{ data: links }, { data: paid }, { data: log }, { data: windows }, { data: allAuctions }] = await Promise.all([
      sb.from('chit_group_members').select('member_id, slot_number').eq('group_id', groupId),
      // Every payment, not only this month's: what a member still owes in all
      // is what gets deducted from a payout.
      sb.from('chit_collections').select('member_id, month_number').eq('group_id', groupId),
      // The status matters. HELD (waiting for a detail) and PENDING (waiting
      // for a registered number, or for Meta to approve the wording) are not
      // sends: they keep their row — the unique index allows only one per
      // auction, member and step — and that row is updated in place on the day
      // the thing they were waiting for arrives. Without this, every message
      // recorded before WhatsApp went live would be counted as done and never
      // actually sent.
      sb.from('chit_message_log').select('id, step_key, member_id, status').eq('auction_id', String(auction.id)),
      // The bidding rules as they were frozen when the window opened, which is
      // what members were actually told — not today's settings.
      sb.from('chit_bid_windows').select('ceiling_amount, min_increment, month_number')
        .eq('group_id', groupId).order('month_number', { ascending: false }).limit(1),
      sb.from('chit_auctions').select('month_number, dividend_per_member').eq('group_id', groupId),
    ])
    const payments = (paid ?? []) as { member_id: string; month_number: number }[]
    const months = (allAuctions ?? []) as { month_number: number; dividend_per_member: number }[]

    const logRows = (log ?? []) as { id: string; step_key: string; member_id: string; status: string }[]
    const memberLinks = (links ?? []) as { member_id: string; slot_number: number | null }[]
    const memberIds = memberLinks.map(l => String(l.member_id))
    if (memberIds.length === 0) continue

    const { data: people } = await sb.from('chit_members')
      .select('id, name, phone, dial_code, reminder_steps, member_code, address, aadhaar, pan, nominees, guarantors, bank_name, bank_account_number, bank_account_name, bank_branch, bank_ifsc')
      .in('id', memberIds)

    const rows = (people ?? []) as Record<string, unknown>[]
    const library = await libraryFor(userId)
    const { steps: orgSteps, duesDueDays, missingPolicy } = await settingsFor(userId)

    const members: MemberLike[] = rows.map(p => ({
      id: String(p.id),
      name: String(p.name ?? ''),
      phone: (p.phone as string | null) ?? null,
      steps: Array.isArray(p.reminder_steps) && (p.reminder_steps as Step[]).length > 0
        ? matchStepsToLibrary(p.reminder_steps as Step[], library)
        : null,
    }))

    // The result messages are anchored to the day the auction was RECORDED,
    // not the day it was held — see Anchor in reminderSchedule.ts. Until it
    // carries a result, there is no such day.
    const settled = auctionSettled(auction as Record<string, unknown>)
    const settledDate = settled ? istDate(auction.created_at) : null

    const result = plan({
      auctionId: String(auction.id),
      anchors: { auctionDate, nextAuctionDate, settledDate },
      // A schedule saved before the library existed names no message, so each
      // step is pointed at the one written for its job — the same matching the
      // screen shows, so what runs is what was displayed.
      groupSteps: matchStepsToLibrary(orgSteps, library),
      members,
      paidMemberIds: payments
        .filter(p => Number(p.month_number) === monthNumber)
        .map(p => String(p.member_id)),
      winnerMemberId: (auction.winner_member_id as string | null) ?? null,
      sentKeys: logRows
        .filter(r => isSettledSend(String(r.status)))
        .map(r => sendKey(String(auction.id), String(r.member_id), String(r.step_key))),
      today,
    })

    considered += result.due.length
    if (result.due.length === 0) continue

    const winnerRow = rows.find(p => String(p.id) === String(auction.winner_member_id ?? ''))
    const window = ((windows ?? []) as Record<string, unknown>[])[0] ?? null

    /**
     * Write what happened. A message already waiting on a missing detail has a
     * row, and that row is updated rather than a second one inserted — the
     * unique index would refuse it anyway.
     */
    async function record(memberId: string, stepKey: string, fields: Record<string, unknown>) {
      const existing = logRows.find(r =>
        String(r.member_id) === memberId && String(r.step_key) === stepKey)
      if (existing) {
        await sb.from('chit_message_log')
          .update({ ...fields, sent_at: new Date().toISOString() }).eq('id', existing.id)
        return
      }
      await sb.from('chit_message_log').insert(fields)
    }

    for (const d of result.due) {
      const person = rows.find(p => String(p.id) === d.memberId)
      if (!person) continue

      // A row is written whatever happens, so the app can always say what was
      // tried. 'pending' is the honest state before WhatsApp is live.
      const row = {
        user_id: userId,
        group_id: groupId,
        member_id: d.memberId,
        auction_id: String(auction.id),
        step_key: d.stepKey,
        kind: d.kind,
        channel: config ? 'whatsapp' : 'link',
      }

      const template = templateById(library, d.templateId)
      if (!template) {
        failed++
        await record(d.memberId, d.stepKey, {
          ...row, status: 'failed', error: 'No message is chosen for this step',
        })
        continue
      }

      // Belt and braces for a step somebody anchored to the auction date by
      // hand: a message that needs the result is NOT logged when there is no
      // result, so nothing is burnt and nothing wrong goes out.
      if (!settled && usesResultFields(fieldsUsed(template.body))) {
        notes.push(`${d.memberName}: "${template.label}" is waiting for the auction to be recorded`)
        continue
      }

      const facts = factsFor({
        group: g as Record<string, unknown>,
        auction: auction as Record<string, unknown>,
        member: person,
        slotNumber: memberLinks.find(l => String(l.member_id) === d.memberId)?.slot_number ?? null,
        winner: winnerRow ?? null,
        window,
        nextAuctionDate,
        duesDueDays,
        allAuctions: months,
        paidMonths: payments
          .filter(p => String(p.member_id) === d.memberId)
          .map(p => Number(p.month_number)),
        today,
      })

      const { values, missing, filled, held, sendable } = renderVariables(template, facts, missingPolicy)
      const to = normalizeWhatsAppNumber(
        `${String(person.dial_code ?? '91')}${String(person.phone ?? '')}`.replace(/\D/g, ''),
      )

      if (!to) {
        failed++
        await record(d.memberId, d.stepKey, { ...row, status: 'failed', error: 'No usable phone number' })
        continue
      }

      // WAITING, not failed. The row is kept so the screen can say what it is
      // waiting for, and tomorrow's run tries again — so filling the detail in
      // is all it takes for the message to go out.
      if (!sendable) {
        pending++
        await record(d.memberId, d.stepKey, {
          ...row, status: 'held', error: `Waiting for ${missingWords(held)}`,
        })
        continue
      }

      // Sent with a gap in it, deliberately — the log says which, so it can be
      // chased.
      const note = filled.length > 0 ? `sent with ${missingWords(filled)}` : null

      if (!config) {
        pending++
        await record(d.memberId, d.stepKey, {
          ...row, status: 'pending',
          error: ['Waiting for a registered WhatsApp number', note].filter(Boolean).join(' · '),
        })
        continue
      }

      // Meta refuses a send against a template it has not approved, so this is
      // recorded as waiting rather than burnt as a failure.
      if (template.status !== 'APPROVED') {
        pending++
        await record(d.memberId, d.stepKey, {
          ...row, status: 'pending', error: `Waiting for Meta to approve "${template.label}"`,
        })
        continue
      }

      const res = await sendTemplate({
        to, template: template.name, language: template.language, variables: values,
      }, config)

      if (res.ok) {
        sent++
        await record(d.memberId, d.stepKey, {
          ...row, status: 'sent', provider_message_id: res.messageId, error: note,
        })
      } else {
        failed++
        // A retryable failure is NOT logged as a completed send, so tomorrow's
        // run picks it up again. A rejection is logged, so it is not retried
        // for ever against a member who will never receive it.
        if (res.retryable) {
          notes.push(`${d.memberName}: ${res.error} (will try again tomorrow)`)
        } else {
          await record(d.memberId, d.stepKey, { ...row, status: 'failed', error: res.error })
        }
      }
    }
  }

  return NextResponse.json({
    ok: true,
    today,
    whatsapp: config ? 'configured' : 'not configured',
    considered, sent, pending, failed,
    notes: notes.slice(0, 20),
  })
}
