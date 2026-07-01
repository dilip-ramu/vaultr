'use client'

import { useState, useRef } from 'react'
import { X, Check, Camera } from 'lucide-react'
import type { Category } from '@/lib/types'
import { CATEGORY_ICONS, ACCOUNT_COLORS } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { Avatar } from '../AppShell'

interface Props {
  category: Category | null
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

export default function CategoryForm({ category, onSaved, onClose }: Props) {
  const isEdit = !!category
  const avatarInputRef = useRef<HTMLInputElement>(null)

  const [name, setName] = useState(category?.name ?? '')
  const type = 'expense' as const  // unified — income uses the same list
  const [icon, setIcon] = useState(category?.icon ?? 'more-horizontal')
  const [color, setColor] = useState(category?.color ?? ACCOUNT_COLORS[0])
  const [avatarUrl, setAvatarUrl] = useState(category?.avatar_url ?? '')
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const initials = name.slice(0, 2).toUpperCase() || (ICON_EMOJI_MAP[icon] ?? '?')

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { setError('Image must be under 2MB'); return }
    setAvatarUploading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const ext = file.name.split('.').pop()
    const path = `${user!.id}/categories/${Date.now()}.${ext}`
    const { error: uploadErr } = await supabase.storage.from('vaultr-avatars').upload(path, file, { upsert: true })
    if (uploadErr) { setError(uploadErr.message); setAvatarUploading(false); return }
    const { data: { publicUrl } } = supabase.storage.from('vaultr-avatars').getPublicUrl(path)
    setAvatarUrl(`${publicUrl}?t=${Date.now()}`)
    setAvatarUploading(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError('')

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const payload = { name: name.trim(), type, icon, color, avatar_url: avatarUrl || null }
    let data, err

    if (isEdit) {
      const res = await supabase.from('categories').update(payload).eq('id', category.id).eq('user_id', user!.id).select().single()
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

          {/* Avatar + Name row */}
          <div className="flex items-center gap-4">
            <div className="relative">
              <Avatar url={avatarUrl || null} initials={initials} size="lg" />
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={avatarUploading}
                className="absolute -bottom-1 -right-1 w-6 h-6 bg-brand-500 rounded-full flex items-center justify-center shadow-md"
              >
                {avatarUploading
                  ? <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                  : <Camera className="w-3 h-3 text-white" />}
              </button>
              <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
            </div>

            <div className="flex-1">
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
