'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Eye, EyeOff } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/dashboard')
      router.refresh()
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg)' }}>
      <div
        className="w-full max-w-[820px] rounded-[20px] overflow-hidden flex"
        style={{ border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)', minHeight: '520px' }}
      >
        {/* Brand panel */}
        <div
          className="hidden md:flex w-[340px] shrink-0 flex-col relative overflow-hidden p-[34px]"
          style={{ background: 'linear-gradient(160deg, #1F5C3A, #0C2A1B)' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/vaultr-letter-logo.png" alt="INEX" className="h-6 w-auto object-contain self-start" style={{ filter: 'brightness(0) invert(1)' }} />
          <div className="mt-auto">
            <p className="text-[26px] font-extrabold text-white leading-[1.25]" style={{ letterSpacing: '-.02em' }}>Every rupee,<br />in and out.</p>
            <p className="text-[13px] leading-[1.6] mt-3" style={{ color: 'rgba(255,255,255,.65)' }}>
              Invoicing, payroll, budgets and cashflow — one calm workspace for your business finances.
            </p>
          </div>
          <div className="flex gap-5 mt-6">
            <div>
              <p className="text-[19px] font-extrabold" style={{ color: '#7FD9A4', fontVariantNumeric: 'tabular-nums' }}>₹48.2L</p>
              <p className="text-[10px]" style={{ color: 'rgba(255,255,255,.5)' }}>tracked</p>
            </div>
            <div>
              <p className="text-[19px] font-extrabold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>1,240</p>
              <p className="text-[10px]" style={{ color: 'rgba(255,255,255,.5)' }}>transactions</p>
            </div>
          </div>
          <svg viewBox="0 0 340 120" preserveAspectRatio="none" className="absolute left-0 right-0 bottom-0 w-full h-[120px]" style={{ opacity: 0.16 }}>
            <polyline points="0,90 60,70 120,80 180,44 240,54 300,24 340,32" fill="none" stroke="#7FD9A4" strokeWidth="3" />
          </svg>
        </div>

        {/* Form pane */}
        <div className="flex-1 flex items-center justify-center p-10" style={{ background: 'var(--surface)' }}>
          <div className="w-full max-w-[300px]">
            <h1 className="text-[22px] font-extrabold" style={{ color: 'var(--text)', letterSpacing: '-.01em' }}>Welcome back</h1>
            <p className="text-[13px] mt-[3px]" style={{ color: 'var(--text-muted)' }}>Sign in to your INEX account</p>

            <form onSubmit={handleLogin} className="space-y-4 mt-6">
              {error && (
                <div className="text-[13px] rounded-xl px-4 py-3" style={{ background: 'color-mix(in srgb, var(--expense) 10%, transparent)', color: 'var(--expense)', border: '1px solid color-mix(in srgb, var(--expense) 26%, transparent)' }}>
                  {error}
                </div>
              )}
              <div>
                <label className="block text-[11px] font-bold mb-1.5" style={{ color: 'var(--text-muted)' }}>Email</label>
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com" required
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold mb-1.5" style={{ color: 'var(--text-muted)' }}>Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••" required
                    className="w-full px-4 py-3 rounded-xl text-sm pr-12 outline-none"
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-faint)' }}>
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>
              <button
                type="submit" disabled={loading}
                className="w-full text-white font-bold py-3 rounded-xl transition-opacity hover:opacity-90 disabled:opacity-60"
                style={{ background: 'var(--brand)' }}
              >
                {loading ? 'Signing in…' : 'Sign In'}
              </button>
            </form>

            <p className="text-center text-[13px] mt-6" style={{ color: 'var(--text-muted)' }}>
              Don&apos;t have an account?{' '}
              <Link href="/signup" className="font-semibold hover:underline" style={{ color: 'var(--brand)' }}>Create one</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
