// A member's photograph: what may be uploaded, and what to show without one.
//
// Pure. No storage, no session — just the rules, so they are the same in the
// portal, in the app, and in a test.

export const MAX_PHOTO_BYTES = 3 * 1024 * 1024

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']

/** Why this file cannot be a member's photo, or null when it can. */
export function photoProblem(file: { type?: string | null; size?: number | null }): string | null {
  const type = String(file.type ?? '').toLowerCase()
  if (!type) return 'That file has no type the app can read.'
  if (!ALLOWED.includes(type)) {
    return 'Please use a photo — JPG, PNG or HEIC.'
  }
  const size = Number(file.size ?? 0)
  if (!Number.isFinite(size) || size <= 0) return 'That file is empty.'
  // A phone photograph is a megabyte or two. Beyond three, something else is
  // being uploaded and the member's connection will suffer for it.
  if (size > MAX_PHOTO_BYTES) return 'That photo is too large. Keep it under 3 MB.'
  return null
}

/** The extension to store it under, from the type the browser reported. */
export function photoExtension(type: string): string {
  switch (String(type ?? '').toLowerCase()) {
    case 'image/png': return 'png'
    case 'image/webp': return 'webp'
    case 'image/heic': return 'heic'
    case 'image/heif': return 'heif'
    default: return 'jpg'
  }
}

/** Where it lives: one file per member, replaced rather than piled up. */
export function photoPath(userId: string, memberId: string, type: string): string {
  return `${userId}/members/${memberId}.${photoExtension(type)}`
}

/**
 * The letters shown in place of a photo.
 *
 * Two at most, from the first and last words of the name — 'Vishnu Prasanth'
 * is VP. A name with one word gives one letter rather than a nonsense pair.
 */
export function initialsOf(name: string): string {
  const words = String(name ?? '').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  const first = words[0][0] ?? ''
  const last = words.length > 1 ? (words[words.length - 1][0] ?? '') : ''
  return (first + last).toUpperCase()
}
