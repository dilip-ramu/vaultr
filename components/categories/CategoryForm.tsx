'use client'

import { useState } from 'react'
import { X, Check } from 'lucide-react'
import type { Category, CategoryType } from '@/lib/types'
import { CATEGORY_ICONS, ACCOUNT_COLORS } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'

interface Props {
  category: Category | null
  defaultType: CategoryType
  onSaved: (category: Category) => void
  onClose: () => void
}

const ICON_EMOJI_MAP: Record<string, string> = {
  'utensils': '🍽️', 'car': '🚗', 'shopping-bag': '🛍️', 'film': '🎬',
  'zap': '⚡', 'heart-pulse': '❤️', 'graduation-cap': '🎓', 'home': '🏠',
  'plane': '✈️', 'shirt': '👕', 'gift': '🎁', 'briefcase': '💼',
  'dumbbell': '🏋️', 'smartphone': '📱', 'book': '📚', 'coffee': '☕',
  'music': '🎵', 'wifi': '📶', 'building': '🏢', 'trending-up': '📈',
  'dollar-sign': '💵', 'percent': '💹', 'laptop': '💻', 'more-horizontal': '•',
}

export default function CategoryForm({ category, defaultType, onSaved, onClose }: Props) {
  const isEdit = !!category

  const [name, setName] = useState(category?.name ?? '')
  const [type, setType] = useState<CategoryType>(category?.type ?? defaultType)
  const [icon, setIcon] = useState(category?.icon ?? 'more-horizontal')
  const [color, setColor] = useState(category?.color ?? ACCOUNT_COLORS[0])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError('')

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const payload = { name: name.trim(), type, icon, color }
    let data, err

    if (isEdit) {
      const res = await supabase.from('categories').update(payload).eq('id', category.id).select().single()
      data = res.data; err = res.error
    } else {
      const res = await supabase.from('categories').insert({ ...payload, user_id: user!.id }).select().single()
      data = res.data; err = res.error
    }

    if (err) { setError(err.message); setSaving(false); return }
    onSaved(data)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white w-full md:max-w-md rounded-t-3xl md:rounded-2xl p-6 shadow-xl slide-up">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">
            {isEdit ? 'Edit Category' : 'New Category'}
          </h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && <div className="bg-red-50 text-red-600 text-sm rounded-xl px-4 py-3">{error}</div>}

          {/* Type */}
          <div className="flex bg-gray-100 rounded-xl p-1">
            <button
              type="button"
              onClick={() => setType('expense')}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${type === 'expense' ? 'bg-white shadow-sm text-red-500' : 'text-gray-500'}`}
            >
              Expense
            </button>
            <button
              type="button"
              onClick={() => setType('income')}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${type === 'income' ? 'bg-white shadow-sm text-green-500' : 'text-gray-500'}`}
            >
              Income
            </button>
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Category Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Groceries"
              required
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm"
            />
          </div>

          {/* Icon picker */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Icon</label>
            <div className="grid grid-cols-6 gap-2 max-h-32 overflow-y-auto">
              {CATEGORY_ICONS.map(({ value }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setIcon(value)}
                  className={`w-10 h-10 rounded-xl text-lg flex items-center justify-center transition-all ${
                    icon === value ? 'ring-2 ring-offset-1 ring-brand-500 bg-brand-50' : 'bg-gray-50 hover:bg-gray-100'
                  }`}
                >
                  {ICON_EMOJI_MAP[value] ?? '•'}
                </button>
              ))}
            </div>
          </div>

          {/* Color */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Color</label>
            <div className="flex gap-2 flex-wrap">
              {ACCOUNT_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className="w-8 h-8 rounded-full flex items-center justify-center hover:scale-110 transition-transform"
                  style={{ backgroundColor: c }}
                >
                  {color === c && <Check className="w-4 h-4 text-white" strokeWidth={3} />}
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-brand-500 hover:bg-brand-600 text-white font-semibold py-3.5 rounded-xl transition-all disabled:opacity-60"
          >
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Category'}
          </button>
        </form>
      </div>
    </div>
  )
}
