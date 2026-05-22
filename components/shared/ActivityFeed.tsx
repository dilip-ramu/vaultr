'use client'

import { useState, useEffect, useRef } from 'react'
import { Send, MessageCircle } from 'lucide-react'
import type { ActivityNote, Profile } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { Avatar } from '../AppShell'

interface Props {
  transactionId?: string
  accountId?: string
  billId?: string
}

export default function ActivityFeed({ transactionId, accountId, billId }: Props) {
  const [notes, setNotes] = useState<ActivityNote[]>([])
  const [newNote, setNewNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadNotes()
    loadProfile()
  }, [transactionId, accountId, billId])

  const loadProfile = async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    setProfile(data)
  }

  const loadNotes = async () => {
    const supabase = createClient()
    let query = supabase
      .from('activity_notes')
      .select('*, creator:profiles(id,full_name,avatar_url,nickname)')
      .order('created_at', { ascending: true })

    if (transactionId) query = query.eq('transaction_id', transactionId)
    else if (accountId) query = query.eq('account_id', accountId)
    else if (billId) query = query.eq('bill_id', billId)

    const { data } = await query
    setNotes(data ?? [])
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newNote.trim() || submitting) return
    setSubmitting(true)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSubmitting(false); return }

    const { data } = await supabase.from('activity_notes').insert({
      user_id: user.id,
      transaction_id: transactionId ?? null,
      account_id: accountId ?? null,
      bill_id: billId ?? null,
      content: newNote.trim(),
    }).select('*, creator:profiles(id,full_name,avatar_url,nickname)').single()

    if (data) {
      setNotes(prev => [...prev, data])
      setNewNote('')
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    }
    setSubmitting(false)
  }

  const formatTime = (dt: string) => {
    const d = new Date(dt)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHrs = Math.floor(diffMins / 60)
    if (diffHrs < 24) return `${diffHrs}h ago`
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  }

  const getInitials = (p: Profile | null | undefined) => {
    const name = p?.nickname || p?.full_name || 'U'
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <MessageCircle className="w-4 h-4 text-gray-400" />
        <p className="text-sm font-medium text-gray-700">Activity</p>
        {notes.length > 0 && <span className="text-xs text-gray-400">{notes.length}</span>}
      </div>

      {notes.length === 0 && (
        <p className="text-xs text-gray-400 italic mb-3">No notes yet — add one below</p>
      )}

      <div className="space-y-3 mb-3 max-h-48 overflow-y-auto">
        {notes.map(note => {
          const creator = note.creator as Profile | undefined
          const isMe = creator?.id === profile?.id
          return (
            <div key={note.id} className={`flex gap-2.5 ${isMe ? 'flex-row-reverse' : ''}`}>
              <Avatar
                url={creator?.avatar_url}
                initials={getInitials(creator)}
                size="sm"
              />
              <div className={`max-w-[75%] ${isMe ? 'items-end' : 'items-start'} flex flex-col`}>
                <div className={`rounded-2xl px-3 py-2 text-sm ${
                  isMe ? 'bg-brand-500 text-white rounded-tr-sm' : 'bg-gray-100 text-gray-800 rounded-tl-sm'
                }`}>
                  {note.content}
                </div>
                <span className="text-[10px] text-gray-400 mt-0.5 px-1">
                  {!isMe && (creator?.nickname || creator?.full_name || 'Unknown') + ' · '}
                  {formatTime(note.created_at)}
                </span>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={newNote}
          onChange={e => setNewNote(e.target.value)}
          placeholder="Add a note…"
          className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm"
        />
        <button
          type="submit"
          disabled={submitting || !newNote.trim()}
          className="w-9 h-9 bg-brand-500 rounded-xl flex items-center justify-center text-white disabled:opacity-40 shrink-0"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  )
}
