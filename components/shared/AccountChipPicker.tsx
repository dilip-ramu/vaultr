'use client'

import { useMemo } from 'react'
import { ACCOUNT_TYPE_CONFIG } from '@/lib/types'
import { Avatar } from '@/components/AppShell'
import { accountGroupRank } from '@/lib/utils'

export interface PickerAccount {
  id: string
  name: string
  type: string
  color?: string | null
  avatar_url?: string | null
  custom_type_id?: string | null
  custom_type_name?: string | null
  custom_type_color?: string | null
  custom_type_icon?: string | null
  custom_type_avatar_url?: string | null
}

interface Props {
  accounts: PickerAccount[]
  selectedId: string
  onSelect: (id: string) => void
}

const ACCOUNT_EMOJI: Record<string, string> = {
  checking: '🏦', savings: '🐷', credit: '💳', cash: '💵',
  investment: '📈', loan: '🏛️', auto_loan: '🚗', home_loan: '🏠',
  business_loan: '💼', chit: '🏢', other: '💰',
}

function typeLabel(type: string): string {
  return ACCOUNT_TYPE_CONFIG[type as keyof typeof ACCOUNT_TYPE_CONFIG]?.label ?? type
}

function getEmoji(type: string): string {
  return ACCOUNT_EMOJI[type] ?? '💰'
}

function getAccent(acc: PickerAccount): string {
  return (
    acc.custom_type_color ??
    acc.color ??
    (ACCOUNT_TYPE_CONFIG[acc.type as keyof typeof ACCOUNT_TYPE_CONFIG]?.color ?? '#6B7280')
  )
}

function getIconBg(acc: PickerAccount): string {
  if (acc.custom_type_color) return `${acc.custom_type_color}20`
  return ACCOUNT_TYPE_CONFIG[acc.type as keyof typeof ACCOUNT_TYPE_CONFIG]?.bgColor ?? '#F3F4F6'
}

export default function AccountChipPicker({ accounts, selectedId, onSelect }: Props) {
  const groups = useMemo(() => {
    const customMap = new Map<string, { label: string; accounts: PickerAccount[] }>()
    const standardMap = new Map<string, PickerAccount[]>()

    const sorted = [...accounts].sort((a, b) => a.name.localeCompare(b.name))

    for (const acc of sorted) {
      if (acc.custom_type_id && acc.custom_type_name) {
        if (!customMap.has(acc.custom_type_id)) {
          customMap.set(acc.custom_type_id, { label: acc.custom_type_name, accounts: [] })
        }
        customMap.get(acc.custom_type_id)!.accounts.push(acc)
      } else {
        const key = acc.type ?? 'other'
        if (!standardMap.has(key)) standardMap.set(key, [])
        standardMap.get(key)!.push(acc)
      }
    }

    // Build every group (built-in + custom), then order them all uniformly:
    // Current → Savings → Credit → rest (alphabetical within "rest").
    const all: { key: string; label: string; type?: string; accounts: PickerAccount[] }[] = []

    for (const [t, accs] of standardMap.entries()) {
      all.push({ key: t, label: typeLabel(t), type: t, accounts: accs })
    }
    for (const [key, v] of customMap.entries()) {
      all.push({ key, label: v.label, accounts: v.accounts })
    }

    const result = all.sort((a, b) => {
      const ra = accountGroupRank(a.type, a.label)
      const rb = accountGroupRank(b.type, b.label)
      if (ra !== rb) return ra - rb
      return a.label.localeCompare(b.label)
    })

    return result
  }, [accounts])

  if (groups.length === 0) return null

  const showHeaders = groups.length > 1

  return (
    <div className="space-y-3">
      {groups.map(g => (
        <div key={g.key}>
          {showHeaders && (
            <p
              className="text-[10px] font-semibold uppercase tracking-wide mb-1.5"
              style={{ color: 'var(--text-faint)' }}
            >
              {g.label}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {g.accounts.map(acc => {
              const selected = acc.id === selectedId
              const accent = getAccent(acc)
              const iconBg = getIconBg(acc)

              return (
                <button
                  key={acc.id}
                  type="button"
                  onClick={() => onSelect(acc.id)}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl border-2 transition-all"
                  style={
                    selected
                      ? { borderColor: accent, backgroundColor: `${accent}10`, boxShadow: '0 1px 3px rgba(0,0,0,.08)' }
                      : { borderColor: 'transparent', backgroundColor: 'var(--surface-2)' }
                  }
                >
                  {/* Photo or emoji icon — matches TransactionForm AccountChip exactly */}
                  {acc.avatar_url ? (
                    <Avatar
                      url={acc.avatar_url}
                      initials={acc.name.slice(0, 2).toUpperCase()}
                      size="sm"
                    />
                  ) : (
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0"
                      style={{ backgroundColor: iconBg }}
                    >
                      {acc.custom_type_icon ?? getEmoji(acc.type)}
                    </div>
                  )}

                  {/* Dot + name */}
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: accent }}
                    />
                    <span
                      className="text-sm font-medium whitespace-nowrap"
                      style={{ color: selected ? 'var(--text)' : 'var(--text-muted)' }}
                    >
                      {acc.name}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
