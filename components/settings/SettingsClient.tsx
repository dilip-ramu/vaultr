'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  User, LogOut, Camera,
  ChevronRight, Palette
} from 'lucide-react'
import type { Profile } from '@/lib/types'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { Avatar } from '../AppShell'

interface Props {
  user: SupabaseUser
  profile: Profile | null
}

export default function SettingsClient({ user, profile }: Props) {
  const router = useRouter()
  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [nickname, setNickname] = useState(profile?.nickname ?? '')
  const [saving, setSaving] = useState(false)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url ?? '')
  const [message, setMessage] = useState('')
  const avatarInputRef = useRef<HTMLInputElement>(null)

  const initials = (nickname || fullName || user.email?.[0] || 'U')
    .split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)

  const handleSaveProfile = async () => {
    setSaving(true)
    const supabase = createClient()
    await supabase.from('profiles').update({
      full_name: fullName.trim(),
      nickname: nickname.trim() || null,
    }).eq('id', user.id)
    setMessage('Profile saved!')
    setSaving(false)
    setTimeout(() => setMessage(''), 2000)
    router.refresh()
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { setMessage('Image must be under 2MB'); return }

    setAvatarUploading(true)
    const supabase = createClient()
    const ext = file.name.split('.').pop()
    const path = `${user.id}/avatar.${ext}`

    const { error } = await supabase.storage.from('vaultr-avatars').upload(path, file, { upsert: true })
    if (error) { setMessage(error.message); setAvatarUploading(false); return }

    const { data: { publicUrl } } = supabase.storage.from('vaultr-avatars').getPublicUrl(path)
    const urlWithCache = `${publicUrl}?t=${Date.now()}`

    await supabase.from('profiles').update({ avatar_url: urlWithCache }).eq('id', user.id)
    setAvatarUrl(urlWithCache)
    setMessage('Photo updated!')
    setAvatarUploading(false)
    setTimeout(() => setMessage(''), 2000)
    router.refresh()
  }

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
      <h1 className="text-xl font-bold text-[var(--text)]">Settings</h1>

      {message && (
        <div className="bg-[var(--brand-light)] text-[var(--income)] text-sm rounded-xl px-4 py-3 border border-green-100 fade-in">
          {message}
        </div>
      )}

      {/* Profile card */}
      <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border)] flex items-center gap-2">
          <User className="w-4 h-4 text-[var(--text-faint)]" />
          <p className="text-sm font-semibold text-[var(--text)]">My Profile</p>
        </div>

        <div className="p-5 space-y-4">
          {/* Avatar */}
          <div className="flex items-center gap-4">
            <div className="relative">
              <Avatar url={avatarUrl} initials={initials} size="lg" />
              <button
                onClick={() => avatarInputRef.current?.click()}
                disabled={avatarUploading}
                className="absolute -bottom-1 -right-1 w-6 h-6 bg-[var(--brand)] rounded-full flex items-center justify-center shadow-md"
              >
                {avatarUploading
                  ? <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                  : <Camera className="w-3 h-3 text-white" />}
              </button>
              <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
            </div>
            <div>
              <p className="text-sm font-semibold text-[var(--text)]">{fullName || user.email}</p>
              <p className="text-xs text-[var(--text-faint)]">{user.email}</p>
              <p className="text-xs text-[var(--text-faint)] mt-0.5">Tap camera to change photo</p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Full Name</label>
            <input type="text" value={fullName} onChange={e => setFullName(e.target.value)}
              className="w-full px-3 py-2.5 bg-[var(--surface-2)] border border-[var(--border)] rounded-xl text-sm" />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">
              Nickname <span className="text-[var(--text-faint)]">(shown in activity feed)</span>
            </label>
            <input type="text" value={nickname} onChange={e => setNickname(e.target.value)}
              placeholder="e.g. Dad, Dilip"
              className="w-full px-3 py-2.5 bg-[var(--surface-2)] border border-[var(--border)] rounded-xl text-sm" />
          </div>

          <button onClick={handleSaveProfile} disabled={saving}
            className="w-full bg-[var(--brand)] text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-60">
            {saving ? 'Saving…' : 'Save Profile'}
          </button>
        </div>
      </div>

      {/* App preferences */}
      <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border)] flex items-center gap-2">
          <Palette className="w-4 h-4 text-[var(--text-faint)]" />
          <p className="text-sm font-semibold text-[var(--text)]">Preferences</p>
        </div>
        <div className="divide-y divide-gray-50">
          {[
            { label: 'Currency', value: profile?.currency ?? 'INR', icon: '₹' },
          ].map(item => (
            <div key={item.label} className="px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-base">{item.icon}</span>
                <p className="text-sm text-[var(--text)]">{item.label}</p>
              </div>
              <div className="flex items-center gap-1 text-sm text-[var(--text-muted)]">
                {item.value}
                <ChevronRight className="w-3.5 h-3.5 text-[var(--text-faint)]" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Danger zone */}
      <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] shadow-sm overflow-hidden">
        <button
          onClick={handleLogout}
          className="w-full px-5 py-4 flex items-center gap-3 text-[var(--expense)] hover:bg-[var(--surface-2)] transition-colors"
        >
          <LogOut className="w-4 h-4" />
          <span className="text-sm font-medium">Sign Out</span>
        </button>
      </div>

      <p className="text-center text-xs text-[var(--text-faint)] pb-4">InEx v0.2 · Built with ❤️</p>
    </div>
  )
}
