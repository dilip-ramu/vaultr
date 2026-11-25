'use client'

// A member's photograph in the app, or their initials until they add one.
//
// They upload it from their own portal; this is the operator's side of it —
// a face beside a name on a collection round. The bucket is private, so it
// comes through a route that checks the member belongs to this account.

import { useState } from 'react'
import { initialsOf } from '@/lib/chit/memberPhoto'

export default function MemberAvatar({
  id, name, hasPhoto, size = 34,
}: { id: string; name: string; hasPhoto?: boolean | null; size?: number }) {
  const [failed, setFailed] = useState(false)
  const show = hasPhoto && !failed

  return (
    <div className="rounded-full overflow-hidden flex items-center justify-center shrink-0"
      style={{
        width: size, height: size,
        background: 'color-mix(in srgb, var(--brand) 12%, var(--surface-2))',
        border: '1px solid var(--border)',
      }}>
      {show ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/chit/member-photo/${id}`} alt={name} onError={() => setFailed(true)}
          className="w-full h-full object-cover" />
      ) : (
        <span className="font-extrabold" style={{ color: 'var(--brand)', fontSize: size * 0.38 }}>
          {initialsOf(name)}
        </span>
      )}
    </div>
  )
}
