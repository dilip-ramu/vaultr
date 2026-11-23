// The daily chit reminder run.
//
// Called by Vercel cron. For every active group it works out which of its
// scheduled steps fall on today, who they are for, which message each one
// sends, and sends it — or records why it could not. Nothing here decides WHEN anything goes out: that is
// lib/chit/reminderSchedule.ts, which is pure and tested. This file is the
// plumbing around it.
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
// failing: the app can show them as a list to send by hand, and the same rows
// become real sends the day the number is live. Nothing is lost in between.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  plan, sendKey, dueDateFor, DEFAULT_STEPS, type Step, type MemberLike,
} from '@/lib/chit/reminderSchedule'
import {
  fromRow, matchStepsToLibrary, templateById, renderVariables, type MessageTemplate,
} from '@/lib/chit/messageTemplates'
import { fieldWords, type Facts } from '@/lib/chit/messageFields'
import { cloudConfig, sendTemplate } from '@/lib/whatsapp/cloud'
import { normalizeWhatsAppNumber } from '@/lib/whatsapp'
import {
  monthlyInstallment, numberOfMonths, monthlyCommission, bidCeiling,
} from '@/lib/chit/auction'
import { BID_STEP } from '@/lib/chit/bidding'
import { scheduledAuctionDate } from '@/lib/chit/messages'

// Service role: one run covers every user, so RLS is bypassed deliberately.
function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

/** 'November 2026' from an ISO date, for the month variable. */
function monthLabel(iso: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(iso)
  if (!m) return iso
  return `${MONTHS[Number(m[2]) - 1] ?? m[2]} ${m[1]}`
}

/** The name on the first entry of a nominee or guarantor list, if there is one. */
function firstName(v: unknown): string | null {
  if (!Array.isArray(v) || v.length === 0) return null
  const first = v[0] as { name?: unknown }
  const name = String(first?.name ?? '').trim()
  return name === '' ? null : name
}

const steps = (v: unknown): readonly Step[] =>
  Array.isArray(v) && v.length > 0 ? (v as Step[]) : DEFAULT_STEPS

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
    .select('id, user_id, name, chit_value, members, auction_day, start_date, status, reminder_steps, dues_due_days, auction_time, commission_pct, bid_ceiling_pct, commission_model')
    .eq('status', 'active')

  // The message library is one set per user, shared by every group, so it is
  // fetched once per user rather than once per group.
  const libraries = new Map<string, MessageTemplate[]>()
  async function libraryFor(userId: string): Promise<MessageTemplate[]> {
    const had = libraries.get(userId)
    if (had) return had
    const { data } = await sb.from('chit_message_templates').select('*').eq('user_id', userId)
    const lib = ((data ?? []) as Record<string, unknown>[]).map(fromRow).filter(t => !t.archived)
    libraries.set(userId, lib)
    return lib
  }

  let sent = 0, pending = 0, failed = 0, considered = 0
  const notes: string[] = []

  for (const g of (groups ?? []) as Record<string, unknown>[]) {
    const groupId = String(g.id)
    const userId = String(g.user_id)

    // The auction this run is about: the most recent one held. Before the
    // first auction there is nothing anchored, so the group is skipped.
    const { data: auctions } = await sb.from('chit_auctions')
      .select('id, month_number, auction_date, winner_member_id, bid_amount, net_payout, dividend_per_member, commission')
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

    const [{ data: links }, { data: paid }, { data: log }, { data: windows }] = await Promise.all([
      sb.from('chit_group_members').select('member_id, slot_number').eq('group_id', groupId),
      sb.from('chit_collections').select('member_id').eq('group_id', groupId).eq('month_number', monthNumber),
      sb.from('chit_message_log').select('step_key, member_id').eq('auction_id', String(auction.id)),
      // The bidding rules as they were frozen when the window opened, which is
      // what members were actually told — not today's settings.
      sb.from('chit_bid_windows').select('ceiling_amount, min_increment, month_number')
        .eq('group_id', groupId).order('month_number', { ascending: false }).limit(1),
    ])
    const window = ((windows ?? []) as Record<string, unknown>[])[0]

    const memberLinks = (links ?? []) as { member_id: string; slot_number: number | null }[]
    const memberIds = memberLinks.map(l => String(l.member_id))
    if (memberIds.length === 0) continue

    const { data: people } = await sb.from('chit_members')
      .select('id, name, phone, dial_code, reminder_steps, member_code, address, aadhaar, pan, nominees, guarantors, bank_name, bank_account_number, bank_account_name, bank_branch, bank_ifsc')
      .in('id', memberIds)

    const members: MemberLike[] = ((people ?? []) as Record<string, unknown>[]).map(p => ({
      id: String(p.id),
      name: String(p.name ?? ''),
      phone: (p.phone as string | null) ?? null,
      steps: Array.isArray(p.reminder_steps) && (p.reminder_steps as Step[]).length > 0
        ? (p.reminder_steps as Step[])
        : null,
    }))

    const library = await libraryFor(userId)
    // A schedule saved before the library existed names no message, so each
    // step is pointed at the one written for its job — the same matching the
    // screen shows, so what runs is what was displayed.
    const result = plan({
      auctionId: String(auction.id),
      anchors: { auctionDate, nextAuctionDate },
      groupSteps: matchStepsToLibrary(steps(g.reminder_steps), library),
      members: members.map(m => ({
        ...m,
        steps: m.steps ? matchStepsToLibrary(m.steps, library) : null,
      })),
      paidMemberIds: ((paid ?? []) as { member_id: string }[]).map(p => String(p.member_id)),
      winnerMemberId: (auction.winner_member_id as string | null) ?? null,
      sentKeys: ((log ?? []) as { step_key: string; member_id: string }[])
        .map(r => sendKey(String(auction.id), String(r.member_id), String(r.step_key))),
      today,
    })

    considered += result.due.length
    if (result.due.length === 0) continue

    const installment = monthlyInstallment({ chitValue: Number(g.chit_value) || 0, members: Number(g.members) || 0 })
    const dividend = Number(auction.dividend_per_member) || 0
    const amountDue = Math.max(0, Math.round((installment - dividend) * 100) / 100)
    const month = monthLabel(auctionDate)
    // What members are told, and what 'overdue by 12 days' counts from. Unset,
    // it is the next auction, and nothing is ever counted as overdue.
    const dueDate = dueDateFor(auctionDate, nextAuctionDate, g.dues_due_days as number | null)
    // Who took the chit, for a message that announces the result to the group.
    // Nobody, in an upfront month 1.
    const winnerRow = ((people ?? []) as Record<string, unknown>[])
      .find(p => String(p.id) === String(auction.winner_member_id ?? ''))

    // The chit's own terms, the same figures the group screen shows.
    const terms = {
      chitValue: Number(g.chit_value) || 0,
      members: Number(g.members) || 0,
      commissionPct: Number(g.commission_pct) || 0,
      bidCeilingPct: Number(g.bid_ceiling_pct) || 0,
      model: (String(g.commission_model ?? 'MONTHLY') as 'MONTHLY' | 'UPFRONT'),
    }
    const totalMonths = numberOfMonths(terms)
    const auctionDay = Number(g.auction_day) || null
    const startDate = (g.start_date as string | null) ?? null
    const endDate = startDate ? scheduledAuctionDate(startDate, auctionDay, totalMonths) : null

    for (const d of result.due) {
      const person = ((people ?? []) as Record<string, unknown>[]).find(p => String(p.id) === d.memberId)
      const facts: Facts = {
        memberName: d.memberName,
        memberCode: (person?.member_code as string | null) ?? null,
        slotNumber: memberLinks.find(l => String(l.member_id) === d.memberId)?.slot_number ?? null,
        memberPhone: (person?.phone as string | null) ?? null,
        memberAddress: (person?.address as string | null) ?? null,
        aadhaar: (person?.aadhaar as string | null) ?? null,
        pan: (person?.pan as string | null) ?? null,
        // The lists hold {name, phone, relation, ...}; the first entry is the
        // one a member would recognise as 'my nominee'.
        nomineeName: firstName(person?.nominees),
        guarantorName: firstName(person?.guarantors),
        // The recipient's own bank, for them to confirm before a transfer. The
        // full account number is deliberately not among the facts at all.
        bankName: (person?.bank_name as string | null) ?? null,
        bankAccountName: (person?.bank_account_name as string | null) ?? null,
        bankBranch: (person?.bank_branch as string | null) ?? null,
        bankIfsc: (person?.bank_ifsc as string | null) ?? null,
        accountEnding: (person?.bank_account_number as string | null) ?? null,
        groupName: String(g.name ?? ''),
        month,
        monthNumber,
        membersCount: Number(g.members) || null,
        totalMonths,
        startDate,
        endDate,
        auctionDay,
        chitValue: Number(g.chit_value) || 0,
        installment,
        commissionPct: Number(g.commission_pct),
        commissionAmount: monthlyCommission(terms),
        // What was frozen when bidding opened, if it has; otherwise the rules
        // as they stand.
        minBid: window ? Number(window.min_increment) || BID_STEP : BID_STEP,
        maxDiscount: window ? Number(window.ceiling_amount) || bidCeiling(terms) : bidCeiling(terms),
        maxDiscountPct: Number(g.bid_ceiling_pct),
        auctionDate,
        auctionTime: (g.auction_time as string | null) ?? null,
        winnerName: (winnerRow?.name as string | null) ?? null,
        winnerCode: (winnerRow?.member_code as string | null) ?? null,
        nextAuctionDate,
        amountDue,
        dividend,
        dueDate,
        bidAmount: Number(auction.bid_amount) || 0,
        // The part of the discount that reaches members, after the foreman's
        // cut. The same figure as dividend x members, taken from what was
        // stored on the night rather than recomputed.
        discountShared: Math.max(0,
          Math.round(((Number(auction.bid_amount) || 0) - (Number(auction.commission) || 0)) * 100) / 100),
        netPayout: Number(auction.net_payout) || 0,
        today,
      }

      const to = normalizeWhatsAppNumber(
        `${String(person?.dial_code ?? '91')}${String(person?.phone ?? '')}`.replace(/\D/g, ''),
      )

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
        await sb.from('chit_message_log').insert({
          ...row, status: 'failed',
          error: 'No message is chosen for this step',
        })
        continue
      }

      const { values, missing } = renderVariables(template, facts)
      if (missing.length > 0 || !to) {
        failed++
        await sb.from('chit_message_log').insert({
          ...row, status: 'failed',
          error: !to ? 'No usable phone number' : `Nothing to put in: ${fieldWords(missing)}`,
        })
        continue
      }

      if (!config) {
        pending++
        await sb.from('chit_message_log').insert({
          ...row, status: 'pending',
          error: 'Waiting for a registered WhatsApp number',
        })
        continue
      }

      // Meta refuses a send against a template it has not approved, so this is
      // recorded as waiting rather than burnt as a failure.
      if (template.status !== 'APPROVED') {
        pending++
        await sb.from('chit_message_log').insert({
          ...row, status: 'pending',
          error: `Waiting for Meta to approve "${template.label}"`,
        })
        continue
      }

      const res = await sendTemplate({
        to,
        template: template.name,
        language: template.language,
        variables: values,
      }, config)

      if (res.ok) {
        sent++
        await sb.from('chit_message_log').insert({ ...row, status: 'sent', provider_message_id: res.messageId })
      } else {
        failed++
        // A retryable failure is NOT logged as a completed send, so tomorrow's
        // run picks it up again. A rejection is logged, so it is not retried
        // for ever against a member who will never receive it.
        if (res.retryable) {
          notes.push(`${d.memberName}: ${res.error} (will try again tomorrow)`)
        } else {
          await sb.from('chit_message_log').insert({ ...row, status: 'failed', error: res.error })
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
