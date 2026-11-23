// Send one message to everybody, now.
//
// WHY IT EXISTS
//
// The schedule covers the month. This is for the things a month does not: the
// auction has moved, the office is shut on Friday, a rule has changed. One
// message, every member of every active group, at the moment you press it.
//
// WHAT IT WILL NOT DO
//
// It will not send twice in a day. The send is keyed auction + member +
// 'manual:<message>:<date>', and chit_message_log has a unique index on those
// three, so a second press — or a double click, or a reloaded tab — writes
// nothing. Tomorrow is a different key, so a deliberate repeat still works.
//
// It will not send a message it cannot fill in. A message asking for the
// winning bid in a group whose auction has not been recorded is skipped for
// that group and reported, not sent with a blank.
//
// It respects who the message is written for: everybody, the winner, or only
// the members who still owe.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveChitAccess, CAN } from '@/lib/chit/access'
import { fromRow, templateById, renderVariables, fieldsUsed } from '@/lib/chit/messageTemplates'
import { fieldWords, usesResultFields } from '@/lib/chit/messageFields'
import { factsFor, auctionSettled } from '@/lib/chit/messageFacts'
import { cloudConfig, sendTemplate } from '@/lib/whatsapp/cloud'
import { normalizeWhatsAppNumber } from '@/lib/whatsapp'
import { scheduledAuctionDate } from '@/lib/chit/messages'

export async function POST(req: NextRequest) {
  const access = await resolveChitAccess()
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // Messaging every member is not something a collector or a viewer does.
  if (!CAN.manageGroups(access.role)) {
    return NextResponse.json({ error: 'You do not have permission to message every member.' }, { status: 403 })
  }

  let body: { templateId?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const templateId = String(body.templateId ?? '')
  if (!templateId) return NextResponse.json({ error: 'Which message?' }, { status: 400 })

  const sb = await createClient()
  const uid = access.ownerId
  const config = cloudConfig()
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

  const { data: templateRows } = await sb.from('chit_message_templates')
    .select('*').eq('user_id', uid)
  const library = ((templateRows ?? []) as Record<string, unknown>[]).map(fromRow)
  const template = templateById(library, templateId)
  if (!template) return NextResponse.json({ error: 'That message is not in the library.' }, { status: 404 })

  if (config && template.status !== 'APPROVED') {
    return NextResponse.json({
      error: `"${template.label}" has not been approved by Meta yet, so WhatsApp will refuse it.`,
    }, { status: 400 })
  }

  const { data: settings } = await sb.from('chit_settings')
    .select('dues_due_days').eq('user_id', uid).maybeSingle()
  const duesDueDays = (settings?.dues_due_days as number | null) ?? null

  const { data: groups } = await sb.from('chit_groups')
    .select('id, name, chit_value, members, auction_day, auction_time, start_date, commission_pct, bid_ceiling_pct, commission_model')
    .eq('user_id', uid).eq('status', 'active')

  const needsResult = usesResultFields(fieldsUsed(template.body))
  const stepKey = `manual:${template.id}:${today}`

  let sent = 0, pending = 0, skipped = 0
  const notes: string[] = []

  for (const g of (groups ?? []) as Record<string, unknown>[]) {
    const groupId = String(g.id)

    const { data: auctions } = await sb.from('chit_auctions')
      .select('id, month_number, auction_date, winner_member_id, bid_amount, commission, net_payout, dividend_per_member')
      .eq('group_id', groupId).lte('auction_date', today)
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

    const [{ data: links }, { data: paid }, { data: windows }] = await Promise.all([
      sb.from('chit_group_members').select('member_id, slot_number').eq('group_id', groupId),
      auction
        ? sb.from('chit_collections').select('member_id').eq('group_id', groupId).eq('month_number', monthNumber)
        : Promise.resolve({ data: [] as { member_id: string }[] }),
      sb.from('chit_bid_windows').select('ceiling_amount, min_increment')
        .eq('group_id', groupId).order('month_number', { ascending: false }).limit(1),
    ])

    const memberLinks = (links ?? []) as { member_id: string; slot_number: number | null }[]
    const memberIds = memberLinks.map(l => String(l.member_id))
    if (memberIds.length === 0) continue

    const { data: people } = await sb.from('chit_members')
      .select('id, name, phone, dial_code, member_code, address, aadhaar, pan, nominees, guarantors, bank_name, bank_account_number, bank_account_name, bank_branch, bank_ifsc')
      .in('id', memberIds)

    const rows = (people ?? []) as Record<string, unknown>[]
    const paidIds = new Set(((paid ?? []) as { member_id: string }[]).map(p => String(p.member_id)))
    const winnerId = String(auction?.winner_member_id ?? '')
    const winnerRow = rows.find(p => String(p.id) === winnerId)
    const window = ((windows ?? []) as Record<string, unknown>[])[0] ?? null

    // Who the message is written for decides who hears it.
    const audience = rows.filter(p => {
      if (template.audience === 'winner') return String(p.id) === winnerId
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
        step_key: stepKey,
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
        duesDueDays,
        today,
      })

      const { values, missing } = renderVariables(template, facts)
      const to = normalizeWhatsAppNumber(
        `${String(person.dial_code ?? '91')}${String(person.phone ?? '')}`.replace(/\D/g, ''),
      )

      if (missing.length > 0 || !to) {
        skipped++
        notes.push(`${String(person.name)}: ${!to ? 'no usable phone number' : `nothing to put in ${fieldWords(missing)}`}`)
        continue
      }

      if (!config) {
        // Recorded, so the list is ready the day the number goes live.
        const { error } = await sb.from('chit_message_log').insert({
          ...row, status: 'pending', error: 'Waiting for a registered WhatsApp number',
        })
        if (!error) pending++
        continue
      }

      const res = await sendTemplate({
        to, template: template.name, language: template.language, variables: values,
      }, config)

      if (res.ok) {
        sent++
        await sb.from('chit_message_log').insert({ ...row, status: 'sent', provider_message_id: res.messageId })
      } else {
        skipped++
        notes.push(`${String(person.name)}: ${res.error}`)
        await sb.from('chit_message_log').insert({ ...row, status: 'failed', error: res.error })
      }
    }
  }

  const words = !config
    ? `${pending} recorded as pending — no WhatsApp number is registered yet.`
    : sent === 0 && skipped === 0
      ? 'Nobody to send to.'
      : `Sent to ${sent}${skipped > 0 ? `, ${skipped} skipped` : ''}.`

  return NextResponse.json({
    ok: true, sent, pending, skipped,
    note: words,
    notes: notes.slice(0, 30),
  })
}
