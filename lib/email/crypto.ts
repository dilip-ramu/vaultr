import crypto from 'crypto'

export function encryptPassword(plain: string): { encrypted: string; iv: string } {
  const keyHex = process.env.INBOX_ENCRYPTION_KEY
  if (!keyHex || keyHex.length !== 64) throw new Error('INBOX_ENCRYPTION_KEY must be 64 hex chars (32 bytes)')
  const key = Buffer.from(keyHex, 'hex')
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  let enc = cipher.update(plain, 'utf8', 'hex')
  enc += cipher.final('hex')
  const tag = cipher.getAuthTag().toString('hex')
  return { encrypted: `${enc}:${tag}`, iv: iv.toString('hex') }
}

export function decryptPassword(encrypted: string, ivHex: string): string {
  const keyHex = process.env.INBOX_ENCRYPTION_KEY
  if (!keyHex) throw new Error('INBOX_ENCRYPTION_KEY not set')
  const key = Buffer.from(keyHex, 'hex')
  const [encText, tagHex] = encrypted.split(':')
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  let dec = decipher.update(encText, 'hex', 'utf8')
  dec += decipher.final('utf8')
  return dec
}
