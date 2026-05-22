'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Bell, X, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Bill } from '@/lib/types'
import { formatCurrency, getDaysUntil } from '@/lib/utils'

export default function BillNotificationBanner() {
  const [urgentBills, setUrgentBills] = useState<Bill[]>([])
  const [dismissed, setDismissed] = useState(false)
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>('default')

  useEffect(() => {
    // Check browser notification permission
    if ('Notification' in window) {
      setNotifPermission(Notification.permission)
    }
    loadUrgentBills()
  }, [])

  const loadUrgentBills = async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const today = new Date().toISOString().split('T')[0]
    const in3days = new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0]

    const { data } = await supabase
      .from('bills')
      .select('*')
      .eq('user_id', user.id)
      .in('status', ['pending', 'overdue'])
      .lte('due_date', in3days)
      .order('due_date')

    if (data && data.length > 0) {
      setUrgentBills(data)
      // Fire browser notifications for due today
      data.forEach(bill => {
        const days = getDaysUntil(bill.due_date)
        if (days <= 0 && Notification.permission === 'granted') {
          new Notification(`Bill Due${days < 0 ? ' (Overdue)' : ' Today'}: ${bill.name}`, {
            body: `${formatCurrency(bill.amount)} — tap to view`,
            icon: '/favicon.ico',
            tag: `bill-${bill.id}`,
          })
        }
      })
    }
  }

  const requestNotifications = async () => {
    if (!('Notification' in window)) return
    const perm = await Notification.requestPermission()
    setNotifPermission(perm)
    if (perm === 'granted') {
      urgentBills.forEach(bill => {
        const days = getDaysUntil(bill.due_date)
        if (days <= 1) {
          new Notification(`Bill Due${days < 0 ? ' (Overdue)' : days === 0 ? ' Today' : ' Tomorrow'}: ${bill.name}`, {
            body: formatCurrency(bill.amount),
            icon: '/favicon.ico',
            tag: `bill-${bill.id}`,
          })
        }
      })
    }
  }

  if (dismissed || urgentBills.length === 0) return null

  const overdueCount = urgentBills.filter(b => getDaysUntil(b.due_date) < 0 || b.status === 'overdue').length
  const isOverdue = overdueCount > 0

  return (
    <div className={`shrink-0 ${isOverdue ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'} border-b px-4 py-2.5 flex items-center gap-3`}>
      <AlertCircle className={`w-4 h-4 shrink-0 ${isOverdue ? 'text-red-500' : 'text-amber-500'}`} />
      <p className={`text-xs font-medium flex-1 ${isOverdue ? 'text-red-700' : 'text-amber-700'}`}>
        {overdueCount > 0
          ? `${overdueCount} bill${overdueCount > 1 ? 's' : ''} overdue`
          : `${urgentBills.length} bill${urgentBills.length > 1 ? 's' : ''} due in the next 3 days`
        }
        {' — '}
        {urgentBills.slice(0, 2).map(b => b.name).join(', ')}
        {urgentBills.length > 2 ? ` +${urgentBills.length - 2} more` : ''}
      </p>

      <div className="flex items-center gap-2 shrink-0">
        {notifPermission === 'default' && 'Notification' in window && (
          <button
            onClick={requestNotifications}
            className={`text-xs font-medium flex items-center gap-1 px-2 py-1 rounded-lg ${isOverdue ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}
          >
            <Bell className="w-3 h-3" /> Enable alerts
          </button>
        )}
        <Link
          href="/bills"
          className={`text-xs font-semibold px-2 py-1 rounded-lg ${isOverdue ? 'bg-red-500 text-white' : 'bg-amber-500 text-white'}`}
        >
          View
        </Link>
        <button onClick={() => setDismissed(true)} className="text-gray-400 hover:text-gray-600">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
