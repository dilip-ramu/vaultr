'use client'

// A member's photograph, or their initials until they add one.
//
// The photo comes through a route rather than a link, because the bucket is
// private — a face is not a company logo. `hasPhoto` decides whether to ask
// for it at all, so a member without one is not a 404 on every screen.

import { useState } from 'react'
import { initialsOf } from '@/lib/chit/memberPhoto'

export default function PortalAvatar({
  name, src, size = 56,
}: {
  name: string
  /** Where to fetch it, or null for somebody with no photo. */
  src?: string | null
  size?: number
}) {
  const [failed, setFailed] = useState(false)
  const show = src && !failed

  return (
    <div className="rounded-full overflow-hidden flex items-center justify-center shrink-0"
      style={{
        width: size, height: size,
        background: 'color-mix(in srgb, var(--brand) 14%, var(--surface))',
        border: '1px solid var(--border)',
      }}>
      {show ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name} onError={() => setFailed(true)}
          className="w-full h-full object-cover" />
      ) : (
        <span className="font-extrabold" style={{ color: 'var(--brand)', fontSize: size * 0.36 }}>
          {initialsOf(name)}
        </span>
      )}
    </div>
  )
}
