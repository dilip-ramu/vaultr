'use client'

import { useState } from 'react'
import { Plus, Tag, Pencil, Trash2 } from 'lucide-react'
import type { Category, CategoryType } from '@/lib/types'
import { EMOJI_MAP } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import CategoryForm from './CategoryForm'

export default function CategoriesClient({ initialCategories }: { initialCategories: Category[] }) {
  const [categories, setCategories] = useState<Category[]>(initialCategories)
  const [activeTab, setActiveTab] = useState<CategoryType>('expense')
  const [showForm, setShowForm] = useState(false)
  const [editCat, setEditCat] = useState<Category | null>(null)

  const filtered = categories.filter(c => c.type === activeTab)

  const handleSaved = (cat: Category) => {
    setCategories(prev => {
      const exists = prev.find(c => c.id === cat.id)
      if (exists) return prev.map(c => c.id === cat.id ? cat : c)
      return [...prev, cat]
    })
    setShowForm(false)
    setEditCat(null)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this category? Existing transactions will be uncategorised.')) return
    const supabase = createClient()
    await supabase.from('categories').delete().eq('id', id)
    setCategories(prev => prev.filter(c => c.id !== id))
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Categories</h1>
          <p className="text-sm text-gray-500">{filtered.length} {activeTab} categories</p>
        </div>
        <button
          onClick={() => { setEditCat(null); setShowForm(true) }}
          className="flex items-center gap-1.5 bg-brand-500 text-white text-sm font-semibold px-4 py-2 rounded-xl shadow-sm hover:bg-brand-600 transition-all"
        >
          <Plus className="w-4 h-4" />
          Add
        </button>
      </div>

      {/* Tabs */}
      <div className="flex bg-gray-100 rounded-xl p-1 mb-5">
        <button
          onClick={() => setActiveTab('expense')}
          className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
            activeTab === 'expense' ? 'bg-white shadow-sm text-red-500' : 'text-gray-500'
          }`}
        >
          Expense
        </button>
        <button
          onClick={() => setActiveTab('income')}
          className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
            activeTab === 'income' ? 'bg-white shadow-sm text-green-500' : 'text-gray-500'
          }`}
        >
          Income
        </button>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Tag className="w-7 h-7 text-gray-400" />
          </div>
          <p className="text-gray-500 font-medium">No {activeTab} categories</p>
          <button onClick={() => setShowForm(true)} className="mt-3 text-brand-500 text-sm font-medium">
            + Add Category
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {filtered.map(cat => (
            <div
              key={cat.id}
              className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm group relative"
            >
              {/* Icon / Avatar */}
              {cat.avatar_url ? (
                <img
                  src={cat.avatar_url}
                  alt={cat.name}
                  className="w-10 h-10 rounded-xl object-cover mb-3"
                />
              ) : (
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-xl mb-3"
                  style={{ backgroundColor: `${cat.color}18` }}
                >
                  {EMOJI_MAP[cat.icon] ?? '💰'}
                </div>
              )}
              <p className="text-sm font-semibold text-gray-900 truncate">{cat.name}</p>
              <div
                className="w-2 h-2 rounded-full mt-1.5"
                style={{ backgroundColor: cat.color }}
              />

              {/* Actions (show on hover) */}
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
                <button
                  onClick={() => { setEditCat(cat); setShowForm(true) }}
                  className="w-7 h-7 bg-white border border-gray-100 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 shadow-sm"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleDelete(cat.id)}
                  className="w-7 h-7 bg-white border border-gray-100 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-500 shadow-sm"
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
          defaultType={activeTab}
          onSaved={handleSaved}
          onClose={() => { setShowForm(false); setEditCat(null) }}
        />
      )}
    </div>
  )
}
