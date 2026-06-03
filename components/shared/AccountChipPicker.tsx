'use client'

import { useMemo } from 'react'
import { ACCOUNT_TYPE_CONFIG } from '@/lib/types'
import { Avatar } from '@/components/AppShell'

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

const TYPE_ORDER = ['checking', 'savings', 'credit', 'cash', 'investment', 'loan']

const TYPE_LABELS: Record<string, string> = {
  checking:   'Checking',
  savings:    'Savings',
  credit:     'Credit Card',
  cash:       'Cash',
  investment: 'Investment',
  loan:       'Loan',
  other:      'Other',
}

const ACCOUNT_EMOJI: Record<string, string> = {
  checking: '🏦', savings: '🐷', credit: '💳',
  cash: '💵', investment: '📈', loan: '🏛️', other: '💰',
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

    const result: { key: string; label: string; accounts: PickerAccount[] }[] = []

    for (const t of TYPE_ORDER) {
      if (standardMap.has(t)) {
        result.push({ key: t, label: TYPE_LABELS[t] ?? t, accounts: standardMap.get(t)! })
      }
    }

    const customGroups = [...customMap.entries()]
      .map(([key, v]) => ({ key, label: v.label, accounts: v.accounts }))
      .sort((a, b) => a.label.localeCompare(b.label))
    result.push(...customGroups)

    if (standardMap.has('other')) {
      result.push({ key: 'other', label: TYPE_LABELS.other, accounts: standardMap.get('other')! })
    }

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
