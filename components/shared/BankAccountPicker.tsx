'use client'

// "Which of this company's accounts should this document show?"
//
// Appears wherever a document is created that prints bank details. It defaults
// to the company's default account, so doing nothing produces exactly the
// behaviour there was before choosing was possible.

import { useEffect, useState } from 'react'
import type { CompanyBankAccount } from '@/lib/companies/bankAccounts'
import { accountLabel } from '@/lib/companies/bankAccounts'

export default function BankAccountPicker({
  companyId, value, onChange, label = 'Bank account on this document',
}: {
  companyId: string | null
  value: string | null
  onChange: (id: string | null) => void
  label?: string
}) {
  const [accounts, setAccounts] = useState<CompanyBankAccount[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!companyId) { setAccounts([]); setLoaded(true); return }
    setLoaded(false)
    fetch(`/api/companies/bank-accounts?companyId=${encodeURIComponent(companyId)}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(b => {
        if (cancelled) return
        const active = (b.accounts ?? []).filter((a: CompanyBankAccount) => a.is_active)
        setAccounts(active)
        // Changing company must not leave the previous company's account
        // selected — that is the exact mistake this feature exists to prevent.
        if (value && !active.some((a: CompanyBankAccount) => a.id === value)) onChange(null)
      })
      .catch(() => { if (!cancelled) setAccounts([]) })
      .finally(() => { if (!cancelled) setLoaded(true) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId])

  if (!companyId || !loaded) return null

  const fallback = accounts.find(a => a.is_default) ?? null

  return (
    <div>
      <label className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>{label}</label>
      {accounts.length === 0 ? (
        <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--amber)' }}>
          This company has no bank account on file, so the document will print no bank
          details. Add one in Company details → Bank accounts.
        </p>
      ) : (
        <>
          <select
            value={value ?? ''}
            onChange={e => onChange(e.target.value || null)}
            className="w-full mt-1 px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: 'var(--surface-2, var(--bg))', border: '1px solid var(--border)', color: 'var(--text)' }}
          >
            <option value="">
              {fallback ? `Default — ${accountLabel(fallback)}` : 'Company default'}
            </option>
            {accounts.map(a => (
              <option key={a.id} value={a.id}>{accountLabel(a)}</option>
            ))}
          </select>
          <p className="text-[11px] mt-1" style={{ color: 'var(--text-faint)' }}>
            Leaving this on the default means the document follows the company&apos;s
            default account, even if that changes later.
          </p>
        </>
      )}
    </div>
  )
}
