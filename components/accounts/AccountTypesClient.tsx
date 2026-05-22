'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Trash2, Check, ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ACCOUNT_COLORS } from '@/lib/types'

interface CustomType {
  id: string
  name: string
  color: string
  icon: string
}

const ICON_OPTIONS = [
  { value: 'wallet',      emoji: '👛', label: 'Wallet' },
  { value: 'piggy-bank',  emoji: '🐷', label: 'Savings' },
  { value: 'trending-up', emoji: '📈', label: 'Investment' },
  { value: 'building',    emoji: '🏢', label: 'Business' },
  { value: 'home',        emoji: '🏠', label: 'Property' },
  { value: 'gold',        emoji: '🪙', label: 'Gold' },
  { value: 'gem',         emoji: '💎', label: 'Asset' },
  { value: 'landmark',    emoji: '🏛️', label: 'Fund' },
  { value: 'leaf',        emoji: '🌿', label: 'Pension' },
  { value: 'briefcase',   emoji: '💼', label: 'Business' },
  { value: 'credit-card', emoji: '💳', label: 'Card' },
  { value: 'smartphone',  emoji: '📱', label: 'Digital' },
]

interface Props {
  initialTypes: CustomType[]
}

export default function AccountTypesClient({ initialTypes }: Props) {
  const router = useRouter()
  const [types, setTypes] = useState<CustomType[]>(initialTypes)
  const [showForm, setShowForm] = useState(false)
  const [editType, setEditType] = useState<CustomType | null>(null)

  // Form state
  const [name, setName] = useState('')
  const [color, setColor] = useState(ACCOUNT_COLORS[0])
  const [icon, setIcon] = useState('wallet')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const openCreate = () => {
    setEditType(null)
    setName('')
    setColor(ACCOUNT_COLORS[0])
    setIcon('wallet')
    setError('')
    setShowForm(true)
  }

  const openEdit = (t: CustomType) => {
    setEditType(t)
    setName(t.name)
    setColor(t.color)
    setIcon(t.icon)
    setError('')
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!name.trim()) { setError('Name is required'); return }
    setSaving(true)
    setError('')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (editType) {
      const { data, error: err } = await supabase
        .from('custom_account_types')
        .update({ name: name.trim(), color, icon })
        .eq('id', editType.id)
        .select().single()
      if (err) { setError(err.message); setSaving(false); return }
      setTypes(prev => prev.map(t => t.id === editType.id ? data : t))
    } else {
      const { data, error: err } = await supabase
        .from('custom_account_types')
        .insert({ name: name.trim(), color, icon, user_id: user!.id })
        .select().single()
      if (err) { setError(err.message); setSaving(false); return }
      setTypes(prev => [...prev, data])
    }

    setSaving(false)
    setShowForm(false)
    router.refresh()
  }

  const handleDelete = async (id: string, typeName: string) => {
    if (!confirm(`Delete account type "${typeName}"? Existing accounts using this type won't be affected.`)) return
    const supabase = createClient()
    await supabase.from('custom_account_types').delete().eq('id', id)
    setTypes(prev => prev.filter(t => t.id !== id))
    router.refresh()
  }

  const selectedIconEmoji = ICON_OPTIONS.find(i => i.value === icon)?.emoji ?? '👛'

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <button onClick={() => router.back()} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">Account Types</h1>
          <p className="text-sm text-gray-400">Create custom types like PPF, NPS, Gold, etc.</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 bg-brand-500 text-white text-sm font-semibold px-4 py-2 rounded-xl"
        >
          <Plus className="w-4 h-4" /> New Type
        </button>
      </div>

      {/* Built-in types (read-only display) */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <p className="text-sm font-semibold text-gray-900">Built-in Types</p>
          <p className="text-xs text-gray-400 mt-0.5">These cannot be edited</p>
        </div>
        <div className="divide-y divide-gray-50">
          {[
            { emoji: '🏦', label: 'Checking', color: '#6366F1' },
            { emoji: '🐷', label: 'Savings', color: '#10B981' },
            { emoji: '💳', label: 'Credit Card', color: '#F59E0B' },
            { emoji: '💵', label: 'Cash', color: '#8B5CF6' },
            { emoji: '📈', label: 'Investment', color: '#3B82F6' },
            { emoji: '🏛️', label: 'Loan', color: '#EF4444' },
            { emoji: '💰', label: 'Other', color: '#6B7280' },
          ].map(t => (
            <div key={t.label} className="px-5 py-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm"
                style={{ backgroundColor: `${t.color}18` }}>
                {t.emoji}
              </div>
              <p className="text-sm text-gray-700">{t.label}</p>
              <div className="w-3 h-3 rounded-full ml-auto" style={{ backgroundColor: t.color }} />
            </div>
          ))}
        </div>
      </div>

      {/* Custom types */}
      {types.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-900">Custom Types</p>
          </div>
          <div className="divide-y divide-gray-50">
            {types.map(t => {
              const iconEmoji = ICON_OPTIONS.find(i => i.value === t.icon)?.emoji ?? '👛'
              return (
                <div key={t.id} className="px-5 py-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm"
                    style={{ backgroundColor: `${t.color}18` }}>
                    {iconEmoji}
                  </div>
                  <p className="text-sm font-medium text-gray-800 flex-1">{t.name}</p>
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: t.color }} />
                  <button onClick={() => openEdit(t)} className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-brand-500 hover:bg-brand-50 rounded-lg ml-1">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDelete(t.id, t.name)} className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {types.length === 0 && (
        <div className="text-center py-10 text-gray-400">
          <p className="text-3xl mb-2">🗂️</p>
          <p className="text-sm font-medium">No custom types yet</p>
          <p className="text-xs mt-1">Create types like PPF, NPS, Gold, Crypto…</p>
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
          <div className="fixed inset-0 bg-black/40" onClick={() => setShowForm(false)} />
          <div className="relative bg-white w-full md:max-w-sm rounded-t-3xl md:rounded-2xl p-6 shadow-xl slide-up space-y-4">
            <h2 className="text-base font-bold text-gray-900">
              {editType ? 'Edit Type' : 'New Account Type'}
            </h2>

            {error && <div className="bg-red-50 text-red-600 text-sm rounded-xl px-4 py-3">{error}</div>}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)}
                placeholder="e.g. PPF, NPS, Gold, Crypto"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Icon</label>
              <div className="grid grid-cols-6 gap-2">
                {ICON_OPTIONS.map(opt => (
                  <button key={opt.value} type="button" onClick={() => setIcon(opt.value)}
                    className={`h-10 rounded-xl text-lg flex items-center justify-center transition-all ${icon === opt.value ? 'ring-2 ring-brand-500 bg-brand-50' : 'bg-gray-50 hover:bg-gray-100'}`}>
                    {opt.emoji}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Color</label>
              <div className="flex gap-2 flex-wrap">
                {ACCOUNT_COLORS.map(c => (
                  <button key={c} type="button" onClick={() => setColor(c)}
                    className="w-8 h-8 rounded-full flex items-center justify-center transition-transform hover:scale-110"
                    style={{ backgroundColor: c }}>
                    {color === c && <Check className="w-4 h-4 text-white" strokeWidth={3} />}
                  </button>
                ))}
              </div>
            </div>

            {/* Preview */}
            <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base"
                style={{ backgroundColor: `${color}18` }}>
                {selectedIconEmoji}
              </div>
              <p className="text-sm font-medium text-gray-800">{name || 'Preview'}</p>
              <div className="w-3 h-3 rounded-full ml-auto" style={{ backgroundColor: color }} />
            </div>

            <div className="flex gap-3 pt-1">
              <button onClick={() => setShowForm(false)}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-3 rounded-xl bg-brand-500 text-white text-sm font-semibold disabled:opacity-60">
                {saving ? 'Saving…' : editType ? 'Save' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
