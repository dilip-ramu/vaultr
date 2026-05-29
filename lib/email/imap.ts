import type { SupabaseClient } from '@supabase/supabase-js'
import { decryptPassword } from './crypto'

export interface CheckResult {
  checked: number
  added: number
  duplicates: number
  errors: string[]
}

export async function checkMailbox(opts: {
  userId: string
  integrationId: string
  emailAddress: string
  encryptedPassword: string
  encryptionIv: string
  monitoredEmails: string[]
  supabase: SupabaseClient
}): Promise<CheckResult> {
  const { userId, integrationId, emailAddress, encryptedPassword, encryptionIv, monitoredEmails, supabase } = opts
  const result: CheckResult = { checked: 0, added: 0, duplicates: 0, errors: [] }

  const password = decryptPassword(encryptedPassword, encryptionIv)

  // Dynamic imports to avoid SSR issues
  const { ImapFlow } = await import('imapflow')
  const { simpleParser } = await import('mailparser')

  const client = new ImapFlow({
    host: 'imap.mail.yahoo.com',
    port: 993,
    secure: true,
    auth: { user: emailAddress, pass: password },
    logger: false,
    tls: { rejectUnauthorized: false },
  })

  await client.connect()
  const lock = await client.getMailboxLock('INBOX')
  try {
    const searchResult = await client.search({ seen: false })
    const seqNums: number[] = Array.isArray(searchResult) ? searchResult : []
    const toProcess = seqNums.slice(-100) // max 100 unseen

    for (const seq of toProcess) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const msgResult = await client.fetchOne(String(seq), { source: true }) as any
        if (!msgResult?.source) continue
        const msgSource = msgResult.source as Buffer

        const parsed = await simpleParser(msgSource)
        const fromAddr = parsed.from?.value?.[0]?.address?.toLowerCase() ?? ''
        const fromName = parsed.from?.value?.[0]?.name ?? ''

        if (!monitoredEmails.some(m => m.toLowerCase() === fromAddr)) continue

        result.checked++
        const subject = typeof parsed.subject === 'string' ? parsed.subject : '(no subject)'
        const receivedAt = parsed.date ?? new Date()
        const messageId = parsed.messageId ?? `${seq}@${emailAddress}`
        const body = typeof parsed.text === 'string' ? parsed.text.slice(0, 2000) : ''

        // Process PDF/image attachments
        const attachments = parsed.attachments.filter(a => {
          const ct = a.contentType.toLowerCase()
          const fn = (a.filename ?? '').toLowerCase()
          return ct.includes('pdf') || ct.includes('image') || fn.endsWith('.pdf') ||
            fn.endsWith('.jpg') || fn.endsWith('.jpeg') || fn.endsWith('.png')
        })

        if (attachments.length === 0) {
          // If no attachments, still store email as a document with null attachment
          attachments.push({ filename: null, content: null, contentType: 'text/plain', size: 0 } as never)
        }

        for (const att of attachments) {
          const attName = att.filename ?? null

          // Duplicate check
          const { data: existing } = await supabase
            .from('email_documents')
            .select('id')
            .eq('user_id', userId)
            .eq('sender_email', fromAddr)
            .eq('email_message_id', messageId)
            .eq('attachment_name', attName ?? '')
            .maybeSingle()

          const isDup = !!existing
          if (isDup) { result.duplicates++; continue }

          let attachmentUrl: string | null = null
          let storagePath: string | null = null

          if (att.content && attName) {
            try {
              const path = `${userId}/email-documents/${Date.now()}-${attName.replace(/[^a-zA-Z0-9._-]/g, '_')}`
              const { error: upErr } = await supabase.storage
                .from('vaultr-attachments')
                .upload(path, att.content, { contentType: att.contentType, upsert: false })

              if (!upErr) {
                storagePath = path
                const { data: signed } = await supabase.storage
                  .from('vaultr-attachments')
                  .createSignedUrl(path, 60 * 60 * 24 * 365)
                attachmentUrl = signed?.signedUrl ?? null
              }
            } catch (e) {
              result.errors.push(`Upload failed for ${attName}: ${(e as Error).message}`)
            }
          }

          await supabase.from('email_documents').insert({
            user_id: userId,
            integration_id: integrationId,
            sender_email: fromAddr,
            sender_name: fromName || null,
            email_subject: subject,
            email_body: body || null,
            attachment_name: attName,
            attachment_url: attachmentUrl,
            storage_path: storagePath,
            received_at: receivedAt.toISOString(),
            status: 'new',
            is_duplicate: false,
            email_message_id: messageId,
          })

          result.added++
        }

        // Mark as seen after processing
        await client.messageFlagsAdd(String(seq), ['\\Seen'])
      } catch (e) {
        result.errors.push(`Seq ${seq}: ${(e as Error).message}`)
      }
    }
  } finally {
    lock.release()
    await client.logout().catch(() => {})
  }

  return result
}
