import { NextRequest, NextResponse } from 'next/server'
import { createElement } from 'react'
import path from 'path'
import { createClient } from '@/lib/supabase/server'
import { Font, renderToBuffer } from '@react-pdf/renderer'
import { SalarySlipDocument } from '@/components/payroll/slips/SalarySlipPDF'
import type { PayrollEntry, PayrollMonth, Employee } from '@/lib/payroll/types'

// Server-side font registration: the shared SalarySlipPDF module registers
// browser URLs; on the server we must point at the files on disk instead.
// (Registering the same family again overrides the earlier registration.)
const fontsDir = path.join(process.cwd(), 'public', 'fonts')
Font.register({
  family: 'LiberationSans',
  fonts: [
    { src: path.join(fontsDir, 'LiberationSans-Regular.ttf'), fontWeight: 'normal', fontStyle: 'normal' },
    { src: path.join(fontsDir, 'LiberationSans-Bold.ttf'),    fontWeight: 'bold',   fontStyle: 'normal' },
    { src: path.join(fontsDir, 'LiberationSans-Italic.ttf'),  fontWeight: 'normal', fontStyle: 'italic' },
  ],
})

type EnrichedEntry = PayrollEntry & { employee: Employee; month: PayrollMonth }

export interface SlipEmailResult {
  entry_id: string
  employee: string
  status: 'sent' | 'no_email' | 'error'
  error?: string
}

function fmtMonth(m: string) {
  const [year, month] = m.split('-')
  return new Date(Number(year), Number(month) - 1)
    .toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}

function fmtInr(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
}

function slug(s: string) {
  return s.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

async function sendViaBrevo(opts: {
  apiKey: string
  fromEmail: string
  fromName: string
  toEmail: string
  toName: string
  subject: string
  html: string
  attachmentName: string
  attachmentBase64: string
}) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': opts.apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sender: { email: opts.fromEmail, name: opts.fromName },
      to: [{ email: opts.toEmail, name: opts.toName }],
      subject: opts.subject,
      htmlContent: opts.html,
      attachment: [{ name: opts.attachmentName, content: opts.attachmentBase64 }],
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Email service error (${res.status}): ${body.slice(0, 200)}`)
  }
}

// POST /api/payroll/slips/email — body: { entry_ids: string[] }
// Renders each salary slip PDF server-side and emails it to the employee.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.BREVO_API_KEY
  const fromEmail = process.env.PAYROLL_FROM_EMAIL
  if (!apiKey || !fromEmail) {
    return NextResponse.json({
      error: 'Email sending is not configured yet. Add BREVO_API_KEY and PAYROLL_FROM_EMAIL in Vercel → Settings → Environment Variables (see SETUP.md).',
    }, { status: 400 })
  }

  let body: { entry_ids?: string[] }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const entryIds = (body.entry_ids ?? []).filter(Boolean)
  if (entryIds.length === 0) {
    return NextResponse.json({ error: 'entry_ids is required' }, { status: 400 })
  }
  if (entryIds.length > 100) {
    return NextResponse.json({ error: 'Too many slips at once (max 100)' }, { status: 400 })
  }

  const [{ data: entries }, { data: settings }] = await Promise.all([
    supabase
      .from('payroll_entries')
      .select('*, employee:employees(*), month:payroll_months(*)')
      .in('id', entryIds)
      .eq('user_id', user.id),
    supabase
      .from('recoverable_invoice_settings')
      .select('company_name, company_address')
      .eq('user_id', user.id)
      .maybeSingle(),
  ])

  const fromName = process.env.PAYROLL_FROM_NAME || settings?.company_name || 'Payroll'
  const results: SlipEmailResult[] = []

  for (const entry of (entries ?? []) as unknown as EnrichedEntry[]) {
    const name = entry.employee?.name ?? 'Employee'
    const email = entry.employee?.email?.trim()

    if (!email) {
      results.push({ entry_id: entry.id, employee: name, status: 'no_email' })
      continue
    }

    try {
      const monthLabel = fmtMonth(entry.month.payroll_month)
      const net = fmtInr(Number(entry.final_payable))

      const doc = createElement(SalarySlipDocument, {
        entry,
        month: entry.month,
        employee: entry.employee,
        companyName: settings?.company_name ?? null,
        companyAddress: settings?.company_address ?? null,
      }) as Parameters<typeof renderToBuffer>[0]
      const buffer = await renderToBuffer(doc)

      await sendViaBrevo({
        apiKey,
        fromEmail,
        fromName,
        toEmail: email,
        toName: name,
        subject: `Salary Slip — ${monthLabel}`,
        html: `
          <p>Dear ${name.split(' ')[0]},</p>
          <p>Please find attached your salary slip for <strong>${monthLabel}</strong>.</p>
          <p>Net payable: <strong>${net}</strong></p>
          <p>Regards,<br/>${fromName}</p>
        `,
        attachmentName: `${slug(name)}-${slug(monthLabel)}.pdf`,
        attachmentBase64: buffer.toString('base64'),
      })

      results.push({ entry_id: entry.id, employee: name, status: 'sent' })
    } catch (err) {
      results.push({ entry_id: entry.id, employee: name, status: 'error', error: String(err).slice(0, 200) })
    }
  }

  return NextResponse.json({ results })
}
