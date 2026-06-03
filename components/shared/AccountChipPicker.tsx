'use client'

import { useMemo } from 'react'
import { ACCOUNT_TYPE_CONFIG } from '@/lib/types'

// Minimal account shape — compatible with both Account from @/lib/types
// and the lighter interfaces used in payroll/recoverables modals.
export interface PickerAccount {
  id: string
  name: string
  type: string
  color?: string | null
  avatar_url?: string | null
  // custom type fields (present when fetched from account_balances view)
  custom_type_id?: string | null
  custom_type_name?: string | null
  custom_type_color?: string | null
  custom_type_icon?: string | null
}

interface Props {
  accounts: PickerAccount[]
  selectedId: string
  onSelect: (id: string) => void
}

// Standard type display order
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

function accentColor(acc: PickerAccount): string {
  return (
    acc.custom_type_color ??
    acc.color ??
    (ACCOUNT_TYPE_CONFIG[acc.type as keyof typeof ACCOUNT_TYPE_CONFIG]?.color ?? '#6B7280')
  )
}

function bgColor(acc: PickerAccount): string {
  const c = accentColor(acc)
  return `${c}18`
}

export default function AccountChipPicker({ accounts, selectedId, onSelect }: Props) {
  const groups = useMemo(() => {
    // Separate custom-typed accounts from standard-typed ones
    const customMap = new Map<string, { label: string; accounts: PickerAccount[] }>()
    const standardMap = new Map<string, PickerAccount[]>()

    const sorted = [...accounts].sort((a, b) => a.name.localeCompare(b.name))

    for (const acc of sorted) {
      if (acc.custom_type_id && acc.custom_type_name) {
        // Custom type — group by custom_type_id
        if (!customMap.has(acc.custom_type_id)) {
          customMap.set(acc.custom_type_id, { label: acc.custom_type_name, accounts: [] })
        }
        customMap.get(acc.custom_type_id)!.accounts.push(acc)
      } else {
        // Standard type
        const key = acc.type ?? 'other'
        if (!standardMap.has(key)) standardMap.set(key, [])
        standardMap.get(key)!.push(acc)
      }
    }

    const result: { key: string; label: string; accounts: PickerAccount[] }[] = []

    // 1. Standard types in canonical order
    for (const t of TYPE_ORDER) {
      if (standardMap.has(t)) {
        result.push({ key: t, label: TYPE_LABELS[t] ?? t, accounts: standardMap.get(t)! })
      }
    }

    // 2. Custom types alphabetically
    const customGroups = [...customMap.entries()]
      .map(([key, v]) => ({ key, label: v.label, accounts: v.accounts }))
      .sort((a, b) => a.label.localeCompare(b.label))
    result.push(...customGroups)

    // 3. Standard 'other' last
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
              const accent = accentColor(acc)
              const bg = bgColor(acc)
              return (
                <button
                  key={acc.id}
                  type="button"
                  onClick={() => onSelect(acc.id)}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl border-2 transition-all text-sm font-medium"
                  style={
                    selected
                      ? { borderColor: accent, backgroundColor: bg, color: 'var(--text)' }
                      : { borderColor: 'transparent', backgroundColor: 'var(--surface-2)', color: 'var(--text-muted)' }
                  }
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: accent }}
                  />
                  <span className="whitespace-nowrap">{acc.name}</span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
