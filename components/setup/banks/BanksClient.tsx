'use client'

import { useState } from 'react'
import { Plus, Landmark, Pencil, Trash2, Ruler } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { confirmDialog } from '@/components/shared/ConfirmDialog'
import { notify } from '@/components/shared/Toast'
import type { Bank } from '@/lib/cheque/types'
import { defaultChequeFields, DEFAULT_CHEQUE_SIZE } from '@/lib/cheque/types'
import ChequeTemplateEditor from './ChequeTemplateEditor'

interface Props {
  initialBanks: Bank[]
  bgUrls: Record<string, string>
  accountCount: Record<string, number>
}

export default function BanksClient({ initialBanks, bgUrls, accountCount }: Props) {
  const [banks, setBanks] = useState<Bank[]>(initialBanks)
  const [editing, setEditing] = useState<Bank | null>(null)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')

  async function addBank() {
    const nm = name.trim()
    if (!nm) return
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data, error } = await supabase.from('banks').insert({
      user_id: user.id, name: nm,
      cheque_width_mm: DEFAULT_CHEQUE_SIZE.width, cheque_height_mm: DEFAULT_CHEQUE_SIZE.height,
      cheque_fields: defaultChequeFields(),
    }).select('*').single()
    if (error || !data) { notify(error?.message ?? 'Could not add bank', 'error'); return }
    setBanks(prev => [...prev, data as Bank].sort((a, b) => a.name.localeCompare(b.name)))
    setName(''); setAdding(false)
    setEditing(data as Bank)   // jump straight into the template editor
  }

  async function delBank(b: Bank) {
    if (!await confirmDialog(`Delete “${b.name}” and its cheque template? Accounts linked to it will lose the template.`)) return
    const supabase = createClient()
    const { error } = await supabase.from('banks').delete().eq('id', b.id)
    if (error) { notify(error.message, 'error'); return }
    setBanks(prev => prev.filter(x => x.id !== b.id))
  }

  const onSaved = (b: Bank) => {
    setBanks(prev => prev.map(x => x.id === b.id ? b : x))
    setEditing(null)
  }

  return (
    <div className="w-full px-4 md:px-8 py-6">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>Cheques</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>Add each bank and calibrate its cheque template once. Link an account to a bank and it prints on that bank&apos;s cheque layout.</p>
        </div>
        <button onClick={() => setAdding(true)} className="flex items-center gap-2 text-white text-sm font-bold px-4 py-2 rounded-xl shrink-0" style={{ background: 'var(--brand)' }}>
          <Plus className="w-4 h-4" /> Add bank
        </button>
      </div>

      {adding && (
        <div className="flex items-center gap-2 mb-5 max-w-md">
          <input autoFocus value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addBank() }}
            placeholder="Bank name (e.g. HDFC Bank)" className="flex-1 px-3 py-2.5 rounded-xl border text-sm" style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }} />
          <button onClick={addBank} className="px-4 py-2.5 rounded-xl text-white text-sm font-bold" style={{ background: 'var(--brand)' }}>Add</button>
          <button onClick={() => { setAdding(false); setName('') }} className="px-3 py-2.5 rounded-xl text-sm font-semibold" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>Cancel</button>
        </div>
      )}

      {banks.length === 0 ? (
        <div className="text-center py-16 rounded-2xl" style={{ border: '1px dashed var(--border)' }}>
          <Landmark className="w-9 h-9 mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
          <p className="font-semibold" style={{ color: 'var(--text)' }}>No banks yet</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-faint)' }}>Add a bank, then calibrate its cheque template once.</p>
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
          {banks.map(b => {
            const hasTemplate = (b.cheque_fields?.length ?? 0) > 0 && b.cheque_width_mm && b.cheque_height_mm
            return (
              <div key={b.id} className="rounded-2xl border p-5 flex items-start gap-4" style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow)' }}>
                <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'color-mix(in srgb, var(--brand) 12%, transparent)', color: 'var(--brand)' }}><Landmark className="w-5 h-5" /></div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold" style={{ color: 'var(--text)' }}>{b.name}</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[12px]" style={{ color: 'var(--text-muted)' }}>
                    <span className="flex items-center gap-1"><Ruler className="w-3.5 h-3.5" />{b.cheque_width_mm ?? '—'} × {b.cheque_height_mm ?? '—'} mm</span>
                    <span>{b.cheque_fields?.length ?? 0} fields</span>
                    {accountCount[b.id] ? <span>· {accountCount[b.id]} account{accountCount[b.id] > 1 ? 's' : ''}</span> : null}
                    {!hasTemplate && <span style={{ color: 'var(--amber)' }}>· not calibrated</span>}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => setEditing(b)} className="px-3 py-1.5 rounded-lg text-[12.5px] font-bold flex items-center gap-1.5" style={{ background: 'var(--brand)', color: '#fff' }}><Pencil className="w-3.5 h-3.5" /> Template</button>
                  <button onClick={() => delBank(b)} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--surface-2)' }}><Trash2 className="w-3.5 h-3.5 text-[var(--expense)]" /></button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {editing && (
        <ChequeTemplateEditor bank={editing} bgUrl={bgUrls[editing.id]} onSaved={onSaved} onClose={() => setEditing(null)} />
      )}
    </div>
  )
}
