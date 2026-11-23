// Sending one message to the people it is for.
//
// WHY IT IS HERE AND NOT IN A ROUTE
//
// Three callers need exactly this: the 'send one now' button, the queue that
// drains scheduled sends, and anything else that later wants to tell a group
// something. When it lived inside the button's route, the queue would have
// been a copy of it — which is how two paths start disagreeing about who
// counts as 'unpaid'.
//
// The figures come from lib/chit/messageFacts.ts and the wording from
// lib/chit/messageTemplates.ts, both pure and tested. What is left here is the
// reading of rows and the writing of the log.

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  templateById, renderVariables, fieldsUsed, driftFromApproved, type MessageTemplate,
} from './messageTemplates'
import { missingWords, usesResultFields, type MissingPolicy } from './messageFields'
import { factsFor, auctionSettled } from './messageFacts'
import { scheduledAuctionDate } from './messages'
import { cloudConfig, sendTemplate, type CloudConfig } from '@/lib/whatsapp/cloud'
import { normalizeWhatsAppNumber } from '@/lib/whatsapp'
import type { SendScope } from './outbox'

export interface BroadcastInput {
  sb: SupabaseClient
  /** Whose chit business this is. */
  uid: string
  template: MessageTemplate
  scope: SendScope
  groupId?: string | null
  memberId?: string | null
  /** Keyed into the log, so the same send cannot be repeated by accident. */
  stepKey: string
  /** The day in Tiruppur. */
  today: string
  duesDueDays: number | null
  missingPolicy: MissingPolicy
  /** Null when no WhatsApp number is registered; everything is then recorded
   *  as pending rather than lost. */
  config?: CloudConfig | null
}

export interface BroadcastResult {
  sent: number
  pending: number
  skipped: number
  notes: string[]
}

/** Send it, and say what happened to each person it could not reach. */
export async function broadcast(i: BroadcastInput): Promise<BroadcastResult> {
  const { sb, uid, template } = i
  const config = i.config ?? cloudConfig()

  // The same guard as the route, for the daily run and the queue, which have
  // no screen to warn anybody.
  const drift = config ? driftFromApproved(template) : null
  if (drift) return { sent: 0, pending: 0, skipped: 0, notes: [drift] }

  const needsResult = usesResultFields(fieldsUsed(template.body))

  let sent = 0, pending = 0, skipped = 0
  const notes: string[] = []

  let groupQuery = sb.from('chit_groups')
    .select('id, name, chit_value, members, auction_day, auction_time, start_date, commission_pct, bid_ceiling_pct, commission_model')
    .eq('user_id', uid).eq('status', 'active')

  if (i.scope === 'group' && i.groupId) {
    groupQuery = groupQuery.eq('id', i.groupId)
  } else if (i.scope === 'member' && i.memberId) {
    // A message to one person is about ONE chit — their figures differ from
    // one to the next. Without this, every group was walked and the ones the
    // member is not in were reported as skipped, which reads as a failure
    // when nothing was wrong.
    const { data: mine } = await sb.from('chit_group_members')
      .select('group_id').eq('member_id', i.memberId)
    const ids = ((mine ?? []) as { group_id: string }[]).map(r => String(r.group_id))
    if (ids.length === 0) {
      return { sent: 0, pending: 0, skipped: 1, notes: ['That member is not in any chit group.'] }
    }
    // One of theirs when told which, otherwise the only one they are in.
    groupQuery = groupQuery.in('id', i.groupId ? ids.filter(id => id === i.groupId) : ids)
  }

  const { data: groups } = await groupQuery

  for (const g of (groups ?? []) as Record<string, unknown>[]) {
    const groupId = String(g.id)

    const { data: auctions } = await sb.from('chit_auctions')
      .select('id, month_number, auction_date, winner_member_id, bid_amount, commission, net_payout, dividend_per_member')
      .eq('group_id', groupId).lte('auction_date', i.today)
      .order('auction_date', { ascending: false }).limit(1)
    const auction = (auctions ?? [])[0] as Record<string, unknown> | undefined
    const settled = auctionSettled(auction ?? null)

    if (needsResult && !settled) {
      notes.push(`${String(g.name)}: skipped — this month's auction has not been recorded yet`)
      continue
    }

    const monthNumber = auction ? Number(auction.month_number) || 0 : 0
    const auctionDate = auction ? String(auction.auction_date).slice(0, 10) : null
    const nextAuctionDate = auctionDate
      ? scheduledAuctionDate(String(g.start_date ?? ''), Number(g.auction_day) || null, monthNumber + 1)
      : null

    const [{ data: links }, { data: paid }, { data: windows }, { data: allAuctions }] = await Promise.all([
      sb.from('chit_group_members').select('member_id, slot_number').eq('group_id', groupId),
      sb.from('chit_collections').select('member_id, month_number').eq('group_id', groupId),
      sb.from('chit_bid_windows').select('ceiling_amount, min_increment')
        .eq('group_id', groupId).order('month_number', { ascending: false }).limit(1),
      sb.from('chit_auctions').select('month_number, dividend_per_member').eq('group_id', groupId),
    ])

    const memberLinks = (links ?? []) as { member_id: string; slot_number: number | null }[]
    let memberIds = memberLinks.map(l => String(l.member_id))
    // One member: still only if they are in this group.
    if (i.scope === 'member' && i.memberId) {
      memberIds = memberIds.filter(id => id === i.memberId)
    }
    if (memberIds.length === 0) continue

    const { data: people } = await sb.from('chit_members')
      .select('id, name, phone, dial_code, messaging_opted_out, member_code, address, aadhaar, pan, nominees, guarantors, bank_name, bank_account_number, bank_account_name, bank_branch, bank_ifsc')
      .in('id', memberIds)

    const rows = (people ?? []) as Record<string, unknown>[]
    const payments = (paid ?? []) as { member_id: string; month_number: number }[]
    const months = (allAuctions ?? []) as { month_number: number; dividend_per_member: number }[]
    const paidIds = new Set(payments
      .filter(p => Number(p.month_number) === monthNumber)
      .map(p => String(p.member_id)))
    const winnerId = String(auction?.winner_member_id ?? '')
    const winnerRow = rows.find(p => String(p.id) === winnerId)
    const window = ((windows ?? []) as Record<string, unknown>[])[0] ?? null

    // Who the message is written for decides who hears it.
    const audience = rows.filter(p => {
      // Asked not to be messaged. Not negotiable, not even for a manual send.
      if (p.messaging_opted_out) return false
      if (template.audience === 'winner') return String(p.id) === winnerId
      if (template.audience === 'except_winner') return !winnerId || String(p.id) !== winnerId
      if (template.audience === 'unpaid') return !paidIds.has(String(p.id))
      return true
    })

    for (const person of audience) {
      const memberId = String(person.id)
      const row = {
        user_id: uid,
        group_id: groupId,
        member_id: memberId,
        auction_id: auction ? String(auction.id) : null,
        step_key: i.stepKey,
        kind: 'manual',
        channel: config ? 'whatsapp' : 'link',
      }

      const facts = factsFor({
        group: g,
        auction: auction ?? null,
        member: person,
        slotNumber: memberLinks.find(l => String(l.member_id) === memberId)?.slot_number ?? null,
        winner: winnerRow ?? null,
        window,
        nextAuctionDate,
        duesDueDays: i.duesDueDays,
        allAuctions: months,
        paidMonths: payments.filter(p => String(p.member_id) === memberId).map(p => Number(p.month_number)),
        today: i.today,
      })

      const { values, filled, held, sendable } = renderVariables(template, facts, i.missingPolicy)
      const to = normalizeWhatsAppNumber(
        `${String(person.dial_code ?? '91')}${String(person.phone ?? '')}`.replace(/\D/g, ''),
      )

      if (!sendable || !to) {
        skipped++
        notes.push(`${String(person.name)}: ${!to ? 'no usable phone number' : `waiting for ${missingWords(held)}`}`)
        continue
      }

      const note = filled.length > 0 ? `sent with ${missingWords(filled)}` : null
      if (note) notes.push(`${String(person.name)}: ${note}`)

      if (!config) {
        // Recorded, so the list is ready the day the number goes live.
        const { error } = await sb.from('chit_message_log').insert({
          ...row, status: 'pending',
          error: ['Waiting for a registered WhatsApp number', note].filter(Boolean).join(' · '),
        })
        if (!error) pending++
        continue
      }

      const res = await sendTemplate({
        to, template: template.name, language: template.language, variables: values,
      }, config)

      if (res.ok) {
        sent++
        await sb.from('chit_message_log').insert({
          ...row, status: 'sent', provider_message_id: res.messageId, error: note,
        })
      } else {
        skipped++
        notes.push(`${String(person.name)}: ${res.error}`)
        await sb.from('chit_message_log').insert({ ...row, status: 'failed', error: res.error })
      }
    }
  }

  return { sent, pending, skipped, notes }
}

/** 'Sent to 18, 2 skipped.' — one line for a screen or a log. */
export function broadcastWords(r: BroadcastResult, configured: boolean): string {
  if (!configured) return `${r.pending} recorded as pending — no WhatsApp number is registered yet.`
  if (r.sent === 0 && r.skipped === 0) return 'Nobody to send to.'
  return `Sent to ${r.sent}${r.skipped > 0 ? `, ${r.skipped} skipped` : ''}.`
}

/** The library row a caller asked for, as the app holds it. */
export function pickTemplate(library: readonly MessageTemplate[], id: string): MessageTemplate | undefined {
  return templateById(library, id)
}
