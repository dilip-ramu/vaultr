'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Plus, Tag, Pencil, Trash2 } from 'lucide-react'
import type { Category } from '@/lib/types'
import { getCategoryEmoji } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import CategoryForm from './CategoryForm'
import { confirmDialog } from '@/components/shared/ConfirmDialog'

export default function CategoriesClient({ initialCategories }: { initialCategories: Category[] }) {
  const [categories, setCategories] = useState<Category[]>(
    // Show only expense-typed categories (unified list — income uses these too)
    initialCategories
      .filter(c => c.type === 'expense')
      .sort((a, b) => a.name.localeCompare(b.name))
  )
  const [showForm, setShowForm] = useState(false)
  const [editCat, setEditCat] = useState<Category | null>(null)

  const handleSaved = (cat: Category) => {
    setCategories(prev => {
      const exists = prev.find(c => c.id === cat.id)
      const next = exists ? prev.map(c => c.id === cat.id ? cat : c) : [...prev, cat]
      return next.sort((a, b) => a.name.localeCompare(b.name))
    })
    setShowForm(false)
    setEditCat(null)
  }

  const handleDelete = async (id: string) => {
    if (!await confirmDialog('Delete this category? Existing transactions will be uncategorised.')) return
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('categories').delete().eq('id', id).eq('user_id', user.id)
    setCategories(prev => prev.filter(c => c.id !== id))
  }

  return (
    <div className="w-full px-4 md:px-8 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Categories</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{categories.length} categories</p>
        </div>
        <button
          onClick={() => { setEditCat(null); setShowForm(true) }}
          className="flex items-center gap-1.5 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-all"
          style={{ backgroundColor: 'var(--brand)' }}
        >
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>

      {/* Grid */}
      {categories.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: 'var(--surface-2)' }}>
            <Tag className="w-7 h-7" style={{ color: 'var(--text-muted)' }} />
          </div>
          <p className="font-medium" style={{ color: 'var(--text)' }}>No categories yet</p>
          <button onClick={() => setShowForm(true)} className="mt-3 text-sm font-medium" style={{ color: 'var(--brand)' }}>
            + Add Category
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {categories.map(cat => (
            <div
              key={cat.id}
              className="rounded-2xl border p-4 shadow-sm group relative"
              style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
            >
              <Link href={`/categories/${cat.id}`} className="block">
                {/* Icon / Avatar */}
                {cat.avatar_url ? (
                  <img src={cat.avatar_url} alt={cat.name} className="w-10 h-10 rounded-xl object-cover mb-3" />
                ) : (
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-xl mb-3"
                    style={{ backgroundColor: `${cat.color}18` }}
                  >
                    {getCategoryEmoji(cat.icon)}
                  </div>
                )}
                <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{cat.name}</p>
                <div className="w-2 h-2 rounded-full mt-1.5" style={{ backgroundColor: cat.color }} />
              </Link>

              {/* Actions — stop propagation so they don't trigger navigation */}
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity" onClick={e => e.stopPropagation()}>
                <button
                  onClick={() => { setEditCat(cat); setShowForm(true) }}
                  className="w-7 h-7 rounded-lg flex items-center justify-center shadow-sm"
                  style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleDelete(cat.id)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center shadow-sm"
                  style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--expense)' }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <CategoryForm
          category={editCat}
          onSaved={handleSaved}
          onClose={() => { setShowForm(false); setEditCat(null) }}
        />
      )}
    </div>
  )
}
