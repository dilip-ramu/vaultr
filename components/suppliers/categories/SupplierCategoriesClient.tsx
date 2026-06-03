'use client'

import { useState, useCallback } from 'react'
import { CheckCircle2, Search } from 'lucide-react'
import type { Supplier } from '@/lib/suppliers/types'

interface Category {
  id: string
  name: string
  type: string
  icon: string
  color: string
  parent_id: string | null
}

interface Props {
  initialSuppliers: Supplier[]
  categories: Category[]
}

export default function SupplierCategoriesClient({ initialSuppliers, categories }: Props) {
  const [suppliers, setSuppliers]   = useState<Supplier[]>(initialSuppliers)
  const [saving, setSaving]         = useState<Record<string, boolean>>({})
  const [saved, setSaved]           = useState<Record<string, boolean>>({})
  const [search, setSearch]         = useState('')

  const expenseCategories = categories.filter(c => c.type === 'expense')

  const filtered = suppliers.filter(s => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return s.name.toLowerCase().includes(q) || (s.supplier_code ?? '').toLowerCase().includes(q)
  })

  const handleCategoryChange = useCallback(async (supplierId: string, categoryId: string | null) => {
    setSaving(p => ({ ...p, [supplierId]: true }))
    setSaved(p => ({ ...p, [supplierId]: false }))

    try {
      const res = await fetch(`/api/suppliers/${supplierId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ default_category_id: categoryId || null }),
      })
      if (res.ok) {
        setSuppliers(prev =>
          prev.map(s => s.id === supplierId ? { ...s, default_category_id: categoryId || null } : s)
        )
        setSaved(p => ({ ...p, [supplierId]: true }))
        setTimeout(() => setSaved(p => ({ ...p, [supplierId]: false })), 1500)
      }
    } finally {
      setSaving(p => ({ ...p, [supplierId]: false }))
    }
  }, [])

  const assignedCount = suppliers.filter(s => s.default_category_id).length

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Supplier Categories</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
          Default expense category applied to transactions when marking invoices as paid.
          {' '}
          <span style={{ color: assignedCount === suppliers.length ? 'var(--brand)' : 'var(--text-muted)' }}>
            {assignedCount} of {suppliers.length} assigned.
          </span>
        </p>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search suppliers…"
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border text-sm outline-none"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}
        />
      </div>

      {/* Table */}
      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'var(--surface-2, var(--surface))', borderBottom: '1px solid var(--border)' }}>
              <th className="text-left px-4 py-3 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Supplier</th>
              <th className="text-left px-4 py-3 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Code</th>
              <th className="px-4 py-3 text-left text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                Default Transaction Category
              </th>
              <th className="px-4 py-3 w-8" />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                  {search ? 'No suppliers match your search' : 'No suppliers yet'}
                </td>
              </tr>
            ) : filtered.map(supplier => {
              const currentCat = expenseCategories.find(c => c.id === supplier.default_category_id)
              const isSaving = saving[supplier.id]
              const isSaved  = saved[supplier.id]

              return (
                <tr key={supplier.id} style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
                  {/* Supplier name */}
                  <td className="px-4 py-3">
                    <p className="font-semibold" style={{ color: 'var(--text)' }}>{supplier.name}</p>
                  </td>

                  {/* Code */}
                  <td className="px-4 py-3">
                    <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                      {supplier.supplier_code ?? '—'}
                    </p>
                  </td>

                  {/* Category picker */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {currentCat && (
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ background: currentCat.color }}
                        />
                      )}
                      <select
                        value={supplier.default_category_id ?? ''}
                        onChange={e => handleCategoryChange(supplier.id, e.target.value || null)}
                        disabled={isSaving}
                        className="flex-1 max-w-xs px-3 py-1.5 rounded-lg border text-sm outline-none disabled:opacity-50"
                        style={{
                          background: 'var(--surface-2)',
                          borderColor: supplier.default_category_id ? 'var(--brand)' : 'var(--border)',
                          color: 'var(--text)',
                        }}
                      >
                        <option value="">— Not set —</option>
                        {expenseCategories.map(cat => (
                          <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                      </select>
                    </div>
                  </td>

                  {/* Save indicator */}
                  <td className="px-3 py-3">
                    {isSaving && (
                      <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--brand)', borderTopColor: 'transparent' }} />
                    )}
                    {isSaved && !isSaving && (
                      <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--brand)' }} />
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* Footer */}
        <div
          className="px-4 py-2.5 text-xs border-t"
          style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', background: 'var(--surface-2, var(--surface))' }}
        >
          Changes save automatically · {filtered.length} of {suppliers.length} supplier{suppliers.length !== 1 ? 's' : ''}
        </div>
      </div>
    </div>
  )
}
