'use client'

// The bank accounts this company bills from.
//
// These are the SAME accounts as on the Accounts page — the ones whose balances
// you reconcile. Attaching one to a company sets its company, nothing is copied.
// So an account number is edited in exactly one place, and every invoice that
// prints it follows automatically.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, Star, Link2Off, X, ExternalLink } from 'lucide-react'
import { notify } from '@/components/shared/Toast'
import { confirmDialog } from '@/components/shared/ConfirmDialog'
import type { BillingAccount } from '@/lib/companies/bankAccounts'
import { accountLabel } from '@/lib/companies/bankAccounts'

export default function BankAccountsPanel({ companyId }: { companyId: string }) {
  const [accounts, setAccounts] = useState<BillingAccount[]>([])
  const [available, setAvailable] = useState<BillingAccount[]>([])
  const [defaultId, setDefaultId] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const res = await fetch(`/api/companies/billing-accounts?companyId=${encodeURIComponent(companyId)}`, { cache: 'no-store' })
    const body = await res.json().catch(() => ({}))
    if (res.ok) {
      setAccounts(body.accounts ?? [])
      setAvailable(body.available ?? [])
      setDefaultId(body.defaultAccountId ?? null)
    }
    setLoading(false)
  }, [companyId])

  useEffect(() => { load() }, [load])

  async function act(action: 'attach' | 'detach' | 'set_default', accountId: string) {
    const res = await fetch('/api/companies/billing-accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, companyId, accountId }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) { notify(body?.error ?? 'Could not do that', 'error'); return }
    setPicking(false)
    await load()
    notify(
      action === 'attach' ? 'Account added to this company'
      : action === 'detach' ? 'Account removed from this company'
      : 'Default account set',
      'success',
    )
  }

  if (loading) return null

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>Bank accounts</p>
          <p className="text-xs" style={{ color: 'var(--text-faint)' }}>
            From your Accounts page. The default is used on documents that do not name one.
          </p>
        </div>
        <button type="button" onClick={() => setPicking(true)}
          className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg"
          style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
          <Plus className="w-3.5 h-3.5" /> Add account
        </button>
      </div>

      {accounts.length === 0 ? (
        <p className="text-xs py-3 leading-relaxed" style={{ color: 'var(--text-faint)' }}>
          No accounts assigned. Documents from this company will print no bank details
          until one is added — deliberately, so an invoice never shows another
          company&apos;s account.
        </p>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          {accounts.map((a, i) => (
            <div key={a.id} className="flex items-center gap-3 px-3 py-2.5"
              style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined, opacity: a.is_active ? 1 : 0.55 }}>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold flex items-center gap-2" style={{ color: 'var(--text)' }}>
                  {accountLabel(a)}
                  {a.id === defaultId && (
                    <span className="text-[9.5px] font-extrabold uppercase tracking-wide px-1.5 py-0.5 rounded-full"
                      style={{ color: 'var(--brand)', background: 'color-mix(in srgb, var(--brand) 12%, transparent)' }}>
                      Default
                    </span>
                  )}
                  {!a.is_active && (
                    <span className="text-[9.5px] uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>inactive</span>
                  )}
                </p>
                <p className="text-[11px] truncate" style={{ color: 'var(--text-faint)' }}>
                  {[a.account_number, a.ifsc_code].filter(Boolean).join(' · ') || 'No account number on this account'}
                </p>
              </div>
              {a.id !== defaultId && a.is_active && (
                <button type="button" onClick={() => act('set_default', a.id)} title="Use by default"
                  className="p-1.5" style={{ color: 'var(--text-faint)' }}><Star className="w-3.5 h-3.5" /></button>
              )}
              <button type="button" onClick={async () => {
                if (await confirmDialog(
                  `Remove ${accountLabel(a)} from this company?\n\n`
                  + 'The account itself is not touched — only the link to this company. '
                  + 'Documents already issued with it keep printing it.',
                )) act('detach', a.id)
              }} title="Remove from this company"
                className="p-1.5" style={{ color: 'var(--expense)' }}><Link2Off className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
        Account numbers and IFSC are edited on the{' '}
        <Link href="/accounts" className="underline underline-offset-2 inline-flex items-center gap-0.5">
          Accounts page <ExternalLink className="w-2.5 h-2.5" />
        </Link>{' '}— there is only one copy of them.
      </p>

      {picking && (
        <AttachSheet
          available={available}
          onClose={() => setPicking(false)}
          onPick={id => act('attach', id)}
        />
      )}
    </div>
  )
}

/** Pick from accounts that exist and are not tied to another company. */
function AttachSheet({
  available, onClose, onPick,
}: { available: BillingAccount[]; onClose: () => void; onPick: (id: string) => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.45)' }} onClick={onClose}>
      <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <p className="text-base font-extrabold" style={{ color: 'var(--text)' }}>Add a bank account</p>
          <button type="button" onClick={onClose} style={{ color: 'var(--text-faint)' }}><X className="w-4 h-4" /></button>
        </div>
        <p className="text-xs mb-3" style={{ color: 'var(--text-faint)' }}>
          Choose one of your existing accounts. Nothing is copied — this simply says the
          account belongs to this company.
        </p>

        {available.length === 0 ? (
          <p className="text-[12.5px] leading-relaxed py-3" style={{ color: 'var(--text-muted)' }}>
            Every account is already assigned to a company. To move one, change its company
            on the <Link href="/accounts" className="underline underline-offset-2">Accounts page</Link> —
            doing it there makes it obvious that the other company&apos;s invoices change too.
          </p>
        ) : (
          <div className="space-y-1.5 max-h-[50dvh] overflow-y-auto">
            {available.map(a => (
              <button key={a.id} type="button" onClick={() => onPick(a.id)}
                className="w-full text-left px-3 py-2.5 rounded-xl"
                style={{ border: '1px solid var(--border)', background: 'var(--surface-2, var(--bg))' }}>
                <p className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>{a.name}</p>
                <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
                  {[a.account_number, a.ifsc_code].filter(Boolean).join(' · ') || 'No account number on file'}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
