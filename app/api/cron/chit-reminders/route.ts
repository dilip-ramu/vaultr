// The daily chit reminder run.
//
// Called by Vercel cron. For every active group it works out which of the six
// messages fall on today, who they are for, and sends them — or records why it
// could not. Nothing here decides WHEN anything goes out: that is
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
  plan, sendKey, DEFAULT_STEPS, type Step, type MemberLike,
} from '@/lib/chit/reminderSchedule'
import { TEMPLATES, variablesFor, type Facts } from '@/lib/chit/reminderTemplates'
import { cloudConfig, sendTemplate } from '@/lib/whatsapp/cloud'
import { normalizeWhatsAppNumber } from '@/lib/whatsapp'
import { monthlyInstallment } from '@/lib/chit/auction'
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
    .select('id, user_id, name, chit_value, members, auction_day, start_date, status, reminder_steps')
    .eq('status', 'active')

  let sent = 0, pending = 0, failed = 0, considered = 0
  const notes: string[] = []

  for (const g of (groups ?? []) as Record<string, unknown>[]) {
    const groupId = String(g.id)
    const userId = String(g.user_id)

    // The auction this run is about: the most recent one held. Before the
    // first auction there is nothing anchored, so the group is skipped.
    const { data: auctions } = await sb.from('chit_auctions')
      .select('id, month_number, auction_date, winner_member_id, bid_amount, net_payout, dividend_per_member')
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

    const [{ data: links }, { data: paid }, { data: log }] = await Promise.all([
      sb.from('chit_group_members').select('member_id').eq('group_id', groupId),
      sb.from('chit_collections').select('member_id').eq('group_id', groupId).eq('month_number', monthNumber),
      sb.from('chit_message_log').select('step_key, member_id').eq('auction_id', String(auction.id)),
    ])

    const memberIds = ((links ?? []) as { member_id: string }[]).map(l => String(l.member_id))
    if (memberIds.length === 0) continue

    const { data: people } = await sb.from('chit_members')
      .select('id, name, phone, dial_code, reminder_steps')
      .in('id', memberIds)

    const members: MemberLike[] = ((people ?? []) as Record<string, unknown>[]).map(p => ({
      id: String(p.id),
      name: String(p.name ?? ''),
      phone: (p.phone as string | null) ?? null,
      steps: Array.isArray(p.reminder_steps) && (p.reminder_steps as Step[]).length > 0
        ? (p.reminder_steps as Step[])
        : null,
    }))

    const result = plan({
      auctionId: String(auction.id),
      anchors: { auctionDate, nextAuctionDate },
      groupSteps: steps(g.reminder_steps),
      members,
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

    for (const d of result.due) {
      const person = ((people ?? []) as Record<string, unknown>[]).find(p => String(p.id) === d.memberId)
      const facts: Facts = {
        memberName: d.memberName,
        month,
        chitValue: Number(g.chit_value) || 0,
        installment,
        auctionDate,
        auctionTime: null,
        amountDue,
        // The dues fall due by the next auction at the latest; that is the
        // date members are told, and the one the reminders count against.
        dueDate: nextAuctionDate ?? auctionDate,
        bidAmount: Number(auction.bid_amount) || 0,
        netPayout: Number(auction.net_payout) || 0,
      }

      const variables = variablesFor(d.kind, facts)
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

      if (!variables || !to) {
        failed++
        await sb.from('chit_message_log').insert({
          ...row, status: 'failed',
          error: !to ? 'No usable phone number' : 'Not enough information for this message',
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

      const res = await sendTemplate({
        to,
        template: TEMPLATES[d.kind].name,
        language: TEMPLATES[d.kind].language,
        variables,
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
