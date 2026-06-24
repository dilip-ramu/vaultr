import type { SupabaseClient } from '@supabase/supabase-js'
import { decryptPassword } from './crypto'
import { parseAlert, type EmailInput } from '@/lib/bank-alert/parse'
import { matchAccount, applyMerchantRule, type AccountRef, type MerchantRule } from '@/lib/bank-alert/drafts'
import '@/lib/bank-alert/banks'   // registers bank-specific parsers (side effect)

export interface AlertCheckResult {
  checked: number
  added: number
  skipped: number
  errors: string[]
}

// Folders to scan — INBOX plus common Spam/Junk names across providers.
const FOLDERS = ['INBOX', '[Gmail]/Spam', 'Spam', 'Junk', 'Bulk Mail']

function htmlToText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"')
    .replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n')
    .trim()
}

export interface SenderRef { email: string; default_account_id?: string | null }

export async function checkBankAlerts(opts: {
  userId: string
  emailAddress: string
  encryptedPassword: string
  encryptionIv: string
  senders: SenderRef[]
  accounts: AccountRef[]
  merchantRules: MerchantRule[]
  supabase: SupabaseClient
}): Promise<AlertCheckResult> {
  const { userId, emailAddress, encryptedPassword, encryptionIv, senders, accounts, merchantRules, supabase } = opts
  const result: AlertCheckResult = { checked: 0, added: 0, skipped: 0, errors: [] }
  if (senders.length === 0) return result

  // sender email → its default account (used when the email has no last-4)
  const senderDefault = new Map<string, string | null>()
  for (const s of senders) senderDefault.set(s.email.toLowerCase(), s.default_account_id ?? null)

  const password = decryptPassword(encryptedPassword, encryptionIv)
  const { ImapFlow } = await import('imapflow')
  const { simpleParser } = await import('mailparser')

  const client = new ImapFlow({
    host: 'imap.mail.yahoo.com', port: 993, secure: true,
    auth: { user: emailAddress, pass: password },
    logger: false, tls: { rejectUnauthorized: false },
  })

  const monitored = new Set(senders.map(s => s.email.toLowerCase()))
  const since = new Date(); since.setDate(since.getDate() - 30)

  await client.connect()
  try {
    // discover which folders actually exist
    const available = new Set<string>()
    try {
      const boxes = await client.list()
      for (const box of boxes) available.add(box.path)
    } catch { /* some servers differ */ }

    for (const folder of FOLDERS) {
      if (folder !== 'INBOX' && !available.has(folder)) continue
      let lock
      try { lock = await client.getMailboxLock(folder) } catch { continue }
      try {
        const search = await client.search({ since })
        const seqs: number[] = Array.isArray(search) ? search : []
        for (const seq of seqs.slice(-300)) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const msg = await client.fetchOne(String(seq), { source: true }) as any
            if (!msg?.source) continue
            const parsed = await simpleParser(msg.source as Buffer)
            const from = parsed.from?.value?.[0]?.address?.toLowerCase() ?? ''
            if (!monitored.has(from)) continue

            result.checked++
            const messageId = parsed.messageId ?? `${seq}@${folder}`

            // dedup — one draft per email, ever (even if previously dismissed)
            const { data: existing } = await supabase
              .from('transaction_drafts')
              .select('id')
              .eq('user_id', userId)
              .eq('email_message_id', messageId)
              .maybeSingle()
            if (existing) { result.skipped++; continue }

            const subject = typeof parsed.subject === 'string' ? parsed.subject : ''
            const plain = typeof parsed.text === 'string' ? parsed.text.trim() : ''
            const html = parsed.html ? htmlToText(parsed.html as string) : ''
            const body = (html.length > plain.length ? html : plain).slice(0, 4000)
            const receivedAt = (parsed.date ?? new Date()).toISOString()

            const email: EmailInput = { from, subject, body, receivedAt }
            const a = parseAlert(email)
            if (!a || a.amount == null) { result.skipped++; continue }  // not a usable txn alert

            const match = matchAccount(a.partialAccount, accounts)
            // No last-4 match → fall back to this sender's default account
            const accountId = match.id ?? senderDefault.get(from) ?? null
            const rule = applyMerchantRule(a.merchant, merchantRules)

            await supabase.from('transaction_drafts').insert({
              user_id: userId,
              source: 'email',
              email_message_id: messageId,
              sender_email: from,
              received_at: receivedAt,
              raw_text: body,
              merchant: a.merchant,
              name: rule?.default_name ?? a.merchant ?? null,
              amount: a.amount,
              currency: a.currency,
              direction: a.direction,
              txn_date: a.date,
              partial_account: a.partialAccount,
              confidence: a.confidence,
              matched_account_id: accountId,
              category_id: rule?.category_id ?? null,
              payee_id: rule?.payee_id ?? null,
              status: accountId ? 'pending' : 'needs_account',
            })
            result.added++
          } catch (e) {
            result.errors.push(`${folder}#${seq}: ${(e as Error).message}`)
          }
        }
      } finally {
        lock.release()
      }
    }
  } finally {
    await client.logout().catch(() => {})
  }

  return result
}
