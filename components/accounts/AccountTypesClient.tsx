'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Trash2, Check, ArrowLeft, Camera } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ACCOUNT_COLORS, ACCOUNT_TYPE_CONFIG, EMOJI_MAP } from '@/lib/types'
import type { AccountType, CustomAccountType, BuiltinTypeOverride } from '@/lib/types'
import { Avatar } from '../AppShell'

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
  initialTypes: CustomAccountType[]
  initialOverrides: BuiltinTypeOverride[]
}

type FormMode = 'create-custom' | 'edit-custom' | 'edit-builtin'

export default function AccountTypesClient({ initialTypes, initialOverrides }: Props) {
  const router = useRouter()
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const [types, setTypes] = useState<CustomAccountType[]>(initialTypes)
  const [overrides, setOverrides] = useState<BuiltinTypeOverride[]>(initialOverrides)
  const [showForm, setShowForm] = useState(false)
  const [formMode, setFormMode] = useState<FormMode>('create-custom')
  const [editCustomId, setEditCustomId] = useState<string | null>(null)
  const [editBuiltinKey, setEditBuiltinKey] = useState<AccountType | null>(null)

  // Form state
  const [name, setName] = useState('')
  const [color, setColor] = useState(ACCOUNT_COLORS[0])
  const [icon, setIcon] = useState('wallet')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const openCreate = () => {
    setFormMode('create-custom')
    setEditCustomId(null)
    setEditBuiltinKey(null)
    setName('')
    setColor(ACCOUNT_COLORS[0])
    setIcon('wallet')
    setAvatarUrl('')
    setError('')
    setShowForm(true)
  }

  const openEditCustom = (t: CustomAccountType) => {
    setFormMode('edit-custom')
    setEditCustomId(t.id)
    setEditBuiltinKey(null)
    setName(t.name)
    setColor(t.color)
    setIcon(t.icon)
    setAvatarUrl(t.avatar_url ?? '')
    setError('')
    setShowForm(true)
  }

  const openEditBuiltin = (key: AccountType) => {
    const override = overrides.find(o => o.type_key === key)
    const defaults = ACCOUNT_TYPE_CONFIG[key]
    setFormMode('edit-builtin')
    setEditBuiltinKey(key)
    setEditCustomId(null)
    setName(override?.name ?? defaults.label)
    setColor(override?.color ?? defaults.color)
    setIcon(override?.icon ?? defaults.icon)
    setAvatarUrl(override?.avatar_url ?? '')
    setError('')
    setShowForm(true)
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { setError('Image must be under 2MB'); return }
    setAvatarUploading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const ext = file.name.split('.').pop()
    const path = `${user!.id}/account-types/${Date.now()}.${ext}`
    const { error: uploadErr } = await supabase.storage.from('vaultr-avatars').upload(path, file, { upsert: true })
    if (uploadErr) { setError(uploadErr.message); setAvatarUploading(false); return }
    const { data: { publicUrl } } = supabase.storage.from('vaultr-avatars').getPublicUrl(path)
    setAvatarUrl(`${publicUrl}?t=${Date.now()}`)
    setAvatarUploading(false)
  }

  const handleSave = async () => {
    if (!name.trim()) { setError('Name is required'); return }
    setSaving(true)
    setError('')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (formMode === 'edit-builtin' && editBuiltinKey) {
      const { data, error: err } = await supabase
        .from('builtin_account_type_overrides')
        .upsert({
          user_id: user!.id,
          type_key: editBuiltinKey,
          name: name.trim(),
          color,
          icon,
          avatar_url: avatarUrl || null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,type_key' })
        .select().single()
      if (err) { setError(err.message); setSaving(false); return }
      setOverrides(prev => {
        const exists = prev.find(o => o.type_key === editBuiltinKey)
        if (exists) return prev.map(o => o.type_key === editBuiltinKey ? data : o)
        return [...prev, data]
      })
    } else if (formMode === 'edit-custom' && editCustomId) {
      const { data, error: err } = await supabase
        .from('custom_account_types')
        .update({ name: name.trim(), color, icon, avatar_url: avatarUrl || null })
        .eq('id', editCustomId)
        .select().single()
      if (err) { setError(err.message); setSaving(false); return }
      setTypes(prev => prev.map(t => t.id === editCustomId ? data : t))
    } else {
      const { data, error: err } = await supabase
        .from('custom_account_types')
        .insert({ name: name.trim(), color, icon, avatar_url: avatarUrl || null, user_id: user!.id })
        .select().single()
      if (err) { setError(err.message); setSaving(false); return }
      setTypes(prev => [...prev, data])
    }

    setSaving(false)
    setShowForm(false)
    router.refresh()
  }

  const handleDeleteCustom = async (id: string, typeName: string) => {
    if (!confirm(`Delete account type "${typeName}"? Existing accounts using this type won't be affected.`)) return
    const supabase = createClient()
    await supabase.from('custom_account_types').delete().eq('id', id)
    setTypes(prev => prev.filter(t => t.id !== id))
    router.refresh()
  }

  const handleResetBuiltin = async (key: AccountType) => {
    if (!confirm('Reset this type to its default name and color?')) return
    const supabase = createClient()
    await supabase.from('builtin_account_type_overrides').delete().eq('type_key', key)
    setOverrides(prev => prev.filter(o => o.type_key !== key))
    router.refresh()
  }

  const selectedIconEmoji = ICON_OPTIONS.find(i => i.value === icon)?.emoji ?? EMOJI_MAP[icon] ?? '👛'

  const getBuiltinDisplay = (key: AccountType) => {
    const override = overrides.find(o => o.type_key === key)
    const defaults = ACCOUNT_TYPE_CONFIG[key]
    return {
      name: override?.name ?? defaults.label,
      color: override?.color ?? defaults.color,
      icon: override?.icon ?? defaults.icon,
      avatarUrl: override?.avatar_url ?? null,
      isOverridden: !!override,
    }
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <button onClick={() => router.back()} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">Account Types</h1>
          <p className="text-sm text-gray-400">Customise built-in types or create new ones</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 bg-brand-500 text-white text-sm font-semibold px-4 py-2 rounded-xl"
        >
          <Plus className="w-4 h-4" /> New Type
        </button>
      </div>

      {/* Built-in types */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <p className="text-sm font-semibold text-gray-900">Built-in Types</p>
          <p className="text-xs text-gray-400 mt-0.5">Tap edit to rename or recolour</p>
        </div>
        <div className="divide-y divide-gray-50">
          {(Object.keys(ACCOUNT_TYPE_CONFIG) as AccountType[]).map(key => {
            const d = getBuiltinDisplay(key)
            const iconEmoji = ICON_OPTIONS.find(i => i.value === d.icon)?.emoji ?? EMOJI_MAP[d.icon] ?? '💰'
            return (
              <div key={key} className="px-5 py-3 flex items-center gap-3">
                {d.avatarUrl ? (
                  <img src={d.avatarUrl} alt={d.name} className="w-8 h-8 rounded-xl object-cover shrink-0" />
                ) : (
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm shrink-0"
                    style={{ backgroundColor: `${d.color}18` }}>
                    {iconEmoji}
                  </div>
                )}
                <p className="text-sm text-gray-700 flex-1">{d.name}</p>
                {d.isOverridden && (
                  <span className="text-[10px] bg-brand-50 text-brand-500 px-1.5 py-0.5 rounded-md font-medium">custom</span>
                )}
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }} />
                <button
                  onClick={() => openEditBuiltin(key)}
                  className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-brand-500 hover:bg-brand-50 rounded-lg ml-1"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                {d.isOverridden && (
                  <button
                    onClick={() => handleResetBuiltin(key)}
                    className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                    title="Reset to default"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )
          })}
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
              const iconEmoji = ICON_OPTIONS.find(i => i.value === t.icon)?.emoji ?? EMOJI_MAP[t.icon] ?? '👛'
              return (
                <div key={t.id} className="px-5 py-3 flex items-center gap-3">
                  {t.avatar_url ? (
                    <img src={t.avatar_url} alt={t.name} className="w-8 h-8 rounded-xl object-cover shrink-0" />
                  ) : (
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm shrink-0"
                      style={{ backgroundColor: `${t.color}18` }}>
                      {iconEmoji}
                    </div>
                  )}
                  <p className="text-sm font-medium text-gray-800 flex-1">{t.name}</p>
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: t.color }} />
                  <button onClick={() => openEditCustom(t)} className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-brand-500 hover:bg-brand-50 rounded-lg ml-1">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDeleteCustom(t.id, t.name)} className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg">
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
              {formMode === 'edit-builtin' ? `Edit "${ACCOUNT_TYPE_CONFIG[editBuiltinKey!]?.label}"` :
               formMode === 'edit-custom' ? 'Edit Type' : 'New Account Type'}
            </h2>

            {error && <div className="bg-red-50 text-red-600 text-sm rounded-xl px-4 py-3">{error}</div>}

            {/* Avatar */}
            <div className="flex items-center gap-4">
              <div className="relative">
                <Avatar url={avatarUrl || null} initials={name.slice(0, 2).toUpperCase() || '??'} size="lg" />
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
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Name</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)}
                  placeholder="e.g. PPF, NPS, Gold, Crypto"
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
              </div>
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
              {avatarUrl ? (
                <img src={avatarUrl} alt={name} className="w-9 h-9 rounded-xl object-cover shrink-0" />
              ) : (
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0"
                  style={{ backgroundColor: `${color}18` }}>
                  {selectedIconEmoji}
                </div>
              )}
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
                {saving ? 'Saving…' : formMode === 'create-custom' ? 'Create' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
