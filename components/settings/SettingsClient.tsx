'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  User, Users, Copy, Check, LogOut, Camera, Link,
  Shield, ChevronRight, Bell, Palette
} from 'lucide-react'
import type { Profile, Household } from '@/lib/types'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { Avatar } from '../AppShell'

interface Props {
  user: SupabaseUser
  profile: Profile | null
  household: Household | null
  members: { id: string; full_name: string | null; nickname: string | null; avatar_url: string | null }[]
}

export default function SettingsClient({ user, profile, household, members }: Props) {
  const router = useRouter()
  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [nickname, setNickname] = useState(profile?.nickname ?? '')
  const [inviteCode, setInviteCode] = useState('')
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
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

  const handleCopyInvite = () => {
    const code = household?.invite_code
    if (!code) return
    const url = `${window.location.origin}/signup?invite=${code}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleJoinHousehold = async () => {
    if (!inviteCode.trim()) return
    setSaving(true)
    const supabase = createClient()

    const { data: hh } = await supabase
      .from('households')
      .select('id')
      .eq('invite_code', inviteCode.trim())
      .single()

    if (!hh) { setMessage('Invalid invite code'); setSaving(false); return }

    await supabase.from('profiles').update({ household_id: hh.id }).eq('id', user.id)
    setMessage('Joined household!')
    setSaving(false)
    router.refresh()
  }

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
      <h1 className="text-xl font-bold text-gray-900">Settings</h1>

      {message && (
        <div className="bg-green-50 text-green-700 text-sm rounded-xl px-4 py-3 border border-green-100 fade-in">
          {message}
        </div>
      )}

      {/* Profile card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <User className="w-4 h-4 text-gray-400" />
          <p className="text-sm font-semibold text-gray-900">My Profile</p>
        </div>

        <div className="p-5 space-y-4">
          {/* Avatar */}
          <div className="flex items-center gap-4">
            <div className="relative">
              <Avatar url={avatarUrl} initials={initials} size="lg" />
              <button
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
            <div>
              <p className="text-sm font-semibold text-gray-900">{fullName || user.email}</p>
              <p className="text-xs text-gray-400">{user.email}</p>
              <p className="text-xs text-gray-400 mt-0.5">Tap camera to change photo</p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Full Name</label>
            <input type="text" value={fullName} onChange={e => setFullName(e.target.value)}
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Nickname <span className="text-gray-400">(shown in activity feed)</span>
            </label>
            <input type="text" value={nickname} onChange={e => setNickname(e.target.value)}
              placeholder="e.g. Dad, Dilip"
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
          </div>

          <button onClick={handleSaveProfile} disabled={saving}
            className="w-full bg-brand-500 text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-60">
            {saving ? 'Saving…' : 'Save Profile'}
          </button>
        </div>
      </div>

      {/* Household / Family Sharing */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <Users className="w-4 h-4 text-gray-400" />
          <p className="text-sm font-semibold text-gray-900">Family Sharing</p>
        </div>

        <div className="p-5 space-y-4">
          {household ? (
            <>
              <div>
                <p className="text-xs font-medium text-gray-600 mb-2">Your household</p>
                <p className="text-sm font-semibold text-gray-900">{household.name}</p>
              </div>

              {/* Members */}
              {members.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-2">{members.length} member{members.length > 1 ? 's' : ''}</p>
                  <div className="flex gap-2 flex-wrap">
                    {members.map(m => (
                      <div key={m.id} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-1.5">
                        <Avatar url={m.avatar_url} initials={(m.nickname || m.full_name || 'U').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()} size="sm" />
                        <span className="text-xs font-medium text-gray-700">{m.nickname || m.full_name || 'Member'}</span>
                        {m.id === user.id && <span className="text-[10px] text-brand-500">you</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Invite link */}
              <div className="bg-brand-50 rounded-xl p-4">
                <p className="text-xs font-semibold text-brand-700 mb-1">Invite your family</p>
                <p className="text-xs text-brand-600 mb-3">Share this link with your wife or family members so they can join your shared household.</p>
                <button
                  onClick={handleCopyInvite}
                  className="w-full flex items-center justify-center gap-2 bg-brand-500 text-white text-xs font-semibold py-2.5 rounded-xl"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Link copied!' : 'Copy Invite Link'}
                </button>
                <p className="text-[10px] text-brand-500 mt-2 text-center">Code: <span className="font-mono font-bold">{household.invite_code}</span></p>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-500">You're not in a shared household yet. Join your family's household using their invite code, or yours will be auto-created on next login.</p>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Enter invite code</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={inviteCode}
                    onChange={e => setInviteCode(e.target.value)}
                    placeholder="e.g. a1b2c3d4"
                    className="flex-1 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-mono"
                  />
                  <button onClick={handleJoinHousehold} disabled={saving || !inviteCode.trim()}
                    className="px-4 py-2.5 bg-brand-500 text-white text-sm font-semibold rounded-xl disabled:opacity-50">
                    Join
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* App preferences */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <Palette className="w-4 h-4 text-gray-400" />
          <p className="text-sm font-semibold text-gray-900">Preferences</p>
        </div>
        <div className="divide-y divide-gray-50">
          {[
            { label: 'Currency', value: profile?.currency ?? 'INR', icon: '₹' },
          ].map(item => (
            <div key={item.label} className="px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-base">{item.icon}</span>
                <p className="text-sm text-gray-700">{item.label}</p>
              </div>
              <div className="flex items-center gap-1 text-sm text-gray-500">
                {item.value}
                <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Danger zone */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <button
          onClick={handleLogout}
          className="w-full px-5 py-4 flex items-center gap-3 text-red-500 hover:bg-red-50 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          <span className="text-sm font-medium">Sign Out</span>
        </button>
      </div>

      <p className="text-center text-xs text-gray-300 pb-4">InEx v0.2 · Built with ❤️</p>
    </div>
  )
}
