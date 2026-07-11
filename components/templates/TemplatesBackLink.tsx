'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'

/** Shown on every template page except the hub itself. */
export default function TemplatesBackLink() {
  const pathname = usePathname()
  if (pathname === '/templates') return null

  return (
    <div className="w-full px-4 md:px-8 pt-5">
      <Link
        href="/templates"
        className="inline-flex items-center gap-1.5 text-sm font-semibold"
        style={{ color: 'var(--text-muted)' }}
      >
        <ChevronLeft className="w-4 h-4" />
        All templates
      </Link>
    </div>
  )
}
