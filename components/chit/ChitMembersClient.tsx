'use client'

import { sampleMemberCsv, parseMemberCsv } from '@/lib/chit/memberCsv'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Search, Upload, Trash2, Pencil, X, Phone, Link2, LogOut, Download } from 'lucide-react'
import { notify } from '@/components/shared/Toast'
import { confirmDialog } from '@/components/shared/ConfirmDialog'
import type { ChitMember } from '@/lib/chit/types'

export default function ChitMembersClient({ initialMembers }: { initialMembers: ChitMember[] }) {
  const router = useRouter()
  const [members, setMembers] = useState(initialMembers)
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<ChitMember | null>(null)
  const [adding, setAdding] = useState(false)
  const [importing, setImporting] = useState(false)

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return members
    return members.filter(m =>
      m.name.toLowerCase().includes(s)
      || (m.phone ?? '').includes(s)
      || (m.member_code ?? '').toLowerCase().includes(s))
  }, [members, q])

  // ── Member portal (v115) ──────────────────────────────────────────────────
  // Access is per member and off by default. Turning it OFF also signs the
  // member out everywhere, so "revoke" means revoked, not "revoked eventually".
  const [busyPortal, setBusyPortal] = useState<string | null>(null)
  const [invite, setInvite] = useState<{
    url: string; whatsappUrl: string | null; name: string
    origin: string; originSource: string; expiresAt: string
  } | null>(null)

  async function portalAction(memberId: string, action: 'enable' | 'disable' | 'invite' | 'revoke') {
    setBusyPortal(memberId)
    try {
      const res = await fetch('/api/chit/portal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ memberId, action }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { notify(body?.error ?? 'Could not do that', 'error'); return }

      if (action === 'enable' || action === 'disable') {
        setMembers(prev => prev.map(m => m.id === memberId ? { ...m, portal_enabled: body.portal_enabled } : m))
        notify(body.portal_enabled ? 'Portal access on' : 'Portal access off — signed out everywhere')
      } else if (action === 'revoke') {
        notify(body.revoked ? `Signed out of ${body.revoked} device(s)` : 'No active sessions')
      } else if (action === 'invite') {
        // The link is SHOWN, not fired blindly into WhatsApp. Whoever sends it
        // should be able to see the address they are sending — a link pointing
        // at localhost or at a preview deployment looks identical inside a chat
        // bubble, and the member is the one who discovers it does not work.
        setInvite({
          url: body.url,
          whatsappUrl: body.whatsappUrl ?? null,
          name: body.memberName ?? '',
          origin: body.origin ?? '',
          originSource: body.originSource ?? '',
          expiresAt: body.expiresAt ?? '',
        })
      }
    } finally {
      setBusyPortal(null)
    }
  }

  async function remove(id: string) {
    if (!(await confirmDialog('Remove this member? Their group history goes too.'))) return
    const res = await fetch(`/api/chit/members?id=${id}`, { method: 'DELETE' })
    if (!res.ok) { notify('Could not delete', 'error'); return }
    setMembers(prev => prev.filter(m => m.id !== id))
  }

  return (
    <div className="w-full px-4 md:px-8 py-6 space-y-5">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>Chit members</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{members.length} on the roster</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setImporting(true)}
            className="flex items-center gap-1.5 text-sm font-semibold px-3.5 py-2 rounded-xl"
            style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
            <Upload className="w-4 h-4" /> Import CSV
          </button>
          <button onClick={() => setAdding(true)}
            className="flex items-center gap-2 text-white text-sm font-bold px-4 py-2 rounded-xl" style={{ background: 'var(--brand)' }}>
            <Plus className="w-4 h-4" /> Add member
          </button>
        </div>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-faint)' }} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name or phone"
          className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm"
          style={{ border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }} />
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
        {filtered.length === 0 && (
          <p className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-faint)' }}>No members yet.</p>
        )}
        {filtered.map((m, i) => (
          <div key={m.id} className="flex items-center gap-3 px-4 py-3"
            style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
            <Link href={`/chit/members/${m.id}`} className="min-w-0 flex-1 group">
              <p className="text-sm font-bold truncate flex items-center gap-2" style={{ color: 'var(--text)' }}>
                <span className="group-hover:underline underline-offset-2">{m.name}</span>
                {m.member_code && (
                  <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-full shrink-0"
                    style={{ color: 'var(--brand)', background: 'color-mix(in srgb, var(--brand) 12%, transparent)' }}>
                    {m.member_code}
                  </span>
                )}
              </p>
              <p className="text-xs flex items-center gap-1.5" style={{ color: 'var(--text-faint)' }}>
                {m.phone && <><Phone className="w-3 h-3" />{m.phone}</>}
                {m.pan && <span>· PAN {m.pan}</span>}
              </p>
            </Link>
            {/* Portal access. Deliberately three separate controls: switching
                access on is not the same as sending a link, and revoking is not
                the same as switching off. */}
            {m.portal_enabled ? (
              <>
                <button onClick={() => portalAction(m.id, 'invite')} disabled={busyPortal === m.id}
                  title="Send a one-time login link on WhatsApp"
                  className="p-1.5 disabled:opacity-40" style={{ color: 'var(--brand)' }}>
                  <Link2 className="w-4 h-4" />
                </button>
                <button onClick={() => portalAction(m.id, 'revoke')} disabled={busyPortal === m.id}
                  title="Sign this member out of every device"
                  className="p-1.5 disabled:opacity-40" style={{ color: 'var(--text-faint)' }}>
                  <LogOut className="w-4 h-4" />
                </button>
                <button onClick={() => portalAction(m.id, 'disable')} disabled={busyPortal === m.id}
                  className="text-[10px] font-extrabold uppercase tracking-wide px-2 py-1 rounded-full disabled:opacity-40"
                  style={{ color: 'var(--income)', background: 'color-mix(in srgb, var(--income) 14%, transparent)' }}>
                  Portal on
                </button>
              </>
            ) : (
              <button onClick={() => portalAction(m.id, 'enable')} disabled={busyPortal === m.id}
                title="Allow this member to sign in to the read-only portal"
                className="text-[10px] font-extrabold uppercase tracking-wide px-2 py-1 rounded-full disabled:opacity-40"
                style={{ color: 'var(--text-faint)', border: '1px solid var(--border)' }}>
                Portal off
              </button>
            )}
            <button onClick={() => setEditing(m)} className="p-1.5" style={{ color: 'var(--text-faint)' }}><Pencil className="w-4 h-4" /></button>
            <button onClick={() => remove(m.id)} className="p-1.5" style={{ color: 'var(--expense)' }}><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
      </div>

      {(adding || editing) && (
        <MemberForm
          member={editing}
          members={members}
          onClose={() => { setAdding(false); setEditing(null) }}
          onSaved={m => {
            setMembers(prev => prev.some(x => x.id === m.id) ? prev.map(x => x.id === m.id ? m : x) : [...prev, m].sort((a, b) => a.name.localeCompare(b.name)))
            setAdding(false); setEditing(null)
          }}
        />
      )}

      {invite && <InviteSheet invite={invite} onClose={() => setInvite(null)} />}

      {importing && <ImportSheet onClose={() => setImporting(false)} onDone={() => { setImporting(false); router.refresh() }} />}
    </div>
  )
}

function MemberForm({ member, members, onClose, onSaved }: {
  member: ChitMember | null
  /** Everyone else, so "introduced by" can point at a real member. */
  members: ChitMember[]
  onClose: () => void
  onSaved: (m: ChitMember) => void
}) {
  const [code, setCode] = useState(member?.member_code ?? '')
  const [name, setName] = useState(member?.name ?? '')
  const [bankName, setBankName] = useState(member?.bank_name ?? '')
  const [bankBranch, setBankBranch] = useState(member?.bank_branch ?? '')
  const [bankAcctName, setBankAcctName] = useState(member?.bank_account_name ?? '')
  const [bankAcctNum, setBankAcctNum] = useState(member?.bank_account_number ?? '')
  const [bankIfsc, setBankIfsc] = useState(member?.bank_ifsc ?? '')
  const [referredBy, setReferredBy] = useState(member?.referred_by_member_id ?? '')
  const [dial, setDial] = useState(member?.dial_code ?? '91')
  const [phone, setPhone] = useState(member?.phone ?? '')
  const [address, setAddress] = useState(member?.address ?? '')
  const [aadhaar, setAadhaar] = useState(member?.aadhaar ?? '')
  const [pan, setPan] = useState(member?.pan ?? '')
  const [notes, setNotes] = useState(member?.notes ?? '')
  const [busy, setBusy] = useState(false)

  const fld = 'w-full px-3 py-2.5 rounded-xl border text-sm outline-none'
  const fs = { background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }
  const lbl = 'text-[11px] font-bold block mb-1'

  async function save(force = false) {
    if (!name.trim()) { notify('Name is required', 'error'); return }
    setBusy(true)
    try {
      const payload = {
        id: member?.id, name, dial_code: dial, phone, address, aadhaar, pan, notes, force,
        // Blank on a NEW member means "give me the next number".
        member_code: code.trim() || (member ? null : undefined),
        bank_name: bankName, bank_branch: bankBranch, bank_account_name: bankAcctName,
        bank_account_number: bankAcctNum, bank_ifsc: bankIfsc,
        referred_by_member_id: referredBy || null,
      }
      const res = await fetch('/api/chit/members', {
        method: member ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (res.status === 409 && json.duplicate) {
        if (await confirmDialog(`${json.error}. Add anyway?`)) return save(true)
        return
      }
      if (!res.ok) { notify(json.error ?? 'Save failed', 'error'); return }
      onSaved(json.member)
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end md:items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full md:max-w-md rounded-t-3xl md:rounded-2xl p-6 shadow-xl slide-up max-h-[90vh] overflow-y-auto" style={{ background: 'var(--surface)' }}>
        <div className="flex items-center justify-between mb-4">
          <p className="text-base font-extrabold" style={{ color: 'var(--text)' }}>{member ? 'Edit member' : 'Add member'}</p>
          <button onClick={onClose} style={{ color: 'var(--text-faint)' }}><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-2.5 max-h-[70dvh] overflow-y-auto pr-0.5">
          <div className="grid grid-cols-3 gap-2">
            <div><label className={lbl} style={{ color: 'var(--text-muted)' }}>Member no.</label>
              <input className={fld} style={fs} value={code} onChange={e => setCode(e.target.value.toUpperCase())}
                placeholder={member ? '' : 'auto'} title="Leave blank to get the next number" /></div>
            <div className="col-span-2"><label className={lbl} style={{ color: 'var(--text-muted)' }}>Name</label>
              <input className={fld} style={fs} value={name} onChange={e => setName(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className={lbl} style={{ color: 'var(--text-muted)' }}>Phone</label>
              <div className="flex gap-1.5">
                <div className="relative w-20 shrink-0">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--text-faint)' }}>+</span>
                  <input className={`${fld} pl-5`} style={fs} value={dial} onChange={e => setDial(e.target.value.replace(/\D/g, ''))} inputMode="numeric" title="Country code" />
                </div>
                <input className={fld} style={fs} value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" placeholder="10-digit number" />
              </div>
            </div>
            <div><label className={lbl} style={{ color: 'var(--text-muted)' }}>PAN</label>
              <input className={fld} style={fs} value={pan} onChange={e => setPan(e.target.value.toUpperCase())} /></div>
          </div>
          <div><label className={lbl} style={{ color: 'var(--text-muted)' }}>Aadhaar</label>
            <input className={fld} style={fs} value={aadhaar} onChange={e => setAadhaar(e.target.value)} inputMode="numeric" /></div>
          <div><label className={lbl} style={{ color: 'var(--text-muted)' }}>Address</label>
            <textarea className={fld} style={fs} rows={2} value={address} onChange={e => setAddress(e.target.value)} /></div>
          {/* Where this member is PAID their prize. Their account, not one of
              your company's billing accounts. */}
          <p className="text-[10.5px] font-extrabold uppercase tracking-wide pt-1" style={{ color: 'var(--text-faint)' }}>
            Bank account — for paying their prize
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div><label className={lbl} style={{ color: 'var(--text-muted)' }}>Bank</label>
              <input className={fld} style={fs} value={bankName} onChange={e => setBankName(e.target.value)} /></div>
            <div><label className={lbl} style={{ color: 'var(--text-muted)' }}>Branch</label>
              <input className={fld} style={fs} value={bankBranch} onChange={e => setBankBranch(e.target.value)} /></div>
          </div>
          <div><label className={lbl} style={{ color: 'var(--text-muted)' }}>Account name</label>
            <input className={fld} style={fs} value={bankAcctName} onChange={e => setBankAcctName(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className={lbl} style={{ color: 'var(--text-muted)' }}>Account number</label>
              <input className={fld} style={fs} value={bankAcctNum} onChange={e => setBankAcctNum(e.target.value)} inputMode="numeric" /></div>
            <div><label className={lbl} style={{ color: 'var(--text-muted)' }}>IFSC</label>
              <input className={fld} style={fs} value={bankIfsc} onChange={e => setBankIfsc(e.target.value.toUpperCase())} /></div>
          </div>

          <div><label className={lbl} style={{ color: 'var(--text-muted)' }}>Introduced by</label>
            <select className={fld} style={fs} value={referredBy} onChange={e => setReferredBy(e.target.value)}>
              <option value="">— nobody recorded —</option>
              {members.filter(m => m.id !== member?.id).map(m => (
                <option key={m.id} value={m.id}>
                  {m.member_code ? `${m.member_code} · ` : ''}{m.name}
                </option>
              ))}
            </select></div>

          <div><label className={lbl} style={{ color: 'var(--text-muted)' }}>Notes</label>
            <input className={fld} style={fs} value={notes} onChange={e => setNotes(e.target.value)} placeholder="nominees, guarantors, securities…" /></div>
          <button onClick={() => save()} disabled={busy}
            className="w-full text-white text-sm font-bold py-2.5 rounded-xl mt-1 disabled:opacity-60" style={{ background: 'var(--brand)' }}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ImportSheet({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [problems, setProblems] = useState<string[]>([])

  /** The sample is generated from the SAME column list the parser reads, so a
   *  column in the file is always a column that gets imported. */
  function downloadSample() {
    const blob = new Blob([sampleMemberCsv()], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'chit-members-example.csv'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  async function handleFile(file: File) {
    setBusy(true); setResult(null); setProblems([])
    try {
      const { rows, headers } = parseMemberCsv(await file.text())
      if (!('name' in headers)) {
        notify('That file has no Name column. Download the example to see the format.', 'error')
        return
      }
      if (!rows.length) { notify('No rows found in that file', 'error'); return }

      // Introduced-by is given as a member NUMBER in the file, which means
      // nothing to the database. Resolve it after every row exists, so a file
      // can reference a member it also creates.
      const pending: { code: string; referrer: string }[] = []
      const failed: string[] = []
      let ok = 0

      for (const r of rows) {
        if (r.error) { failed.push(`Row ${r.row}: ${r.error}`); continue }
        const { referred_by_code, ...fields } = r.values
        const res = await fetch('/api/chit/members', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...fields, force: true }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) { failed.push(`Row ${r.row} (${fields.name}): ${json?.error ?? 'could not be added'}`); continue }
        ok++
        if (referred_by_code && json.member?.member_code) {
          pending.push({ code: json.member.member_code, referrer: referred_by_code })
        }
      }

      // Second pass: link the introducers now that everyone has a number.
      if (pending.length) {
        const all = await (await fetch('/api/chit/members')).json().catch(() => ({ members: [] }))
        const byCode = new Map<string, string>(
          (all.members ?? []).map((m: ChitMember) => [String(m.member_code ?? '').toUpperCase(), m.id]),
        )
        for (const link of pending) {
          const selfId = byCode.get(link.code.toUpperCase())
          const refId = byCode.get(link.referrer.trim().toUpperCase())
          if (!selfId || !refId || selfId === refId) {
            failed.push(`${link.code}: introducer ${link.referrer} not found`)
            continue
          }
          await fetch('/api/chit/members', {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: selfId, referred_by_member_id: refId }),
          })
        }
      }

      setResult(`Imported ${ok} of ${rows.length}.`)
      setProblems(failed.slice(0, 8))
      if (ok > 0) setTimeout(onDone, failed.length ? 4000 : 1200)
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end md:items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full md:max-w-md rounded-t-3xl md:rounded-2xl p-6 shadow-xl slide-up" style={{ background: 'var(--surface)' }}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-base font-extrabold" style={{ color: 'var(--text)' }}>Import members</p>
          <button onClick={onClose} style={{ color: 'var(--text-faint)' }}><X className="w-4 h-4" /></button>
        </div>

        <p className="text-[12.5px] mb-3" style={{ color: 'var(--text-muted)' }}>
          Only <b>Name</b> is required. Everything else is optional, and any column the
          file does not have is simply left blank.
        </p>

        <button onClick={downloadSample}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] font-bold mb-3"
          style={{ border: '1px solid var(--border)', color: 'var(--brand)' }}>
          <Download className="w-4 h-4" /> Download example CSV
        </button>

        <label className="block w-full text-center py-8 rounded-xl cursor-pointer" style={{ border: '1px dashed var(--border)', color: 'var(--text-muted)' }}>
          {busy ? 'Importing…' : 'Choose CSV file'}
          <input type="file" accept=".csv,text/csv" className="hidden" disabled={busy}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
        </label>

        {result && <p className="text-sm mt-3 font-semibold" style={{ color: 'var(--brand)' }}>{result}</p>}
        {problems.length > 0 && (
          <div className="mt-2 space-y-0.5">
            {problems.map((p, i) => (
              <p key={i} className="text-[11.5px]" style={{ color: 'var(--expense)' }}>{p}</p>
            ))}
          </div>
        )}

        <p className="text-[11px] mt-3 leading-relaxed" style={{ color: 'var(--text-faint)' }}>
          Members without a number in the file are given the next one automatically.
          &ldquo;Introduced By&rdquo; takes a member number and is linked after every row is
          added, so a file can reference someone it creates further down.
        </p>
      </div>
    </div>
  )
}

// ── The login link, shown before it is sent ──────────────────────────────────
//
// Deliberately not a toast. The address matters, the expiry matters, and the
// person sending it should read both before a member does.
function InviteSheet({
  invite, onClose,
}: {
  invite: { url: string; whatsappUrl: string | null; name: string; origin: string; originSource: string; expiresAt: string }
  onClose: () => void
}) {
  const looksLocal = /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(invite.origin)
  const expires = invite.expiresAt
    ? new Date(invite.expiresAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.45)' }} onClick={onClose}>
      <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-extrabold" style={{ color: 'var(--text)' }}>
              Login link{invite.name ? ` for ${invite.name}` : ''}
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-faint)' }}>
              Works once{expires ? `, expires ${expires}` : ''}. Do not post it anywhere public.
            </p>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-faint)' }}><X className="w-4 h-4" /></button>
        </div>

        {/* THE ADDRESS, in plain sight. This is the thing that goes wrong. */}
        <div className="mt-3 rounded-xl px-3 py-2.5 text-[11.5px] break-all"
          style={{ background: 'var(--surface-2, var(--bg))', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
          {invite.url}
        </div>

        {looksLocal ? (
          <p className="text-[12px] mt-2 leading-relaxed" style={{ color: 'var(--expense)' }}>
            This link points at your own computer, so it will not open on anyone else&apos;s phone.
            Set <b>NEXT_PUBLIC_SITE_URL</b> in Vercel to your real address and send a new link.
          </p>
        ) : (
          <p className="text-[11px] mt-2" style={{ color: 'var(--text-faint)' }}>
            Address taken from {invite.originSource}. Members must be able to reach {invite.origin}.
          </p>
        )}

        <div className="flex items-center gap-2 mt-4">
          <button
            onClick={async () => {
              try { await navigator.clipboard.writeText(invite.url); notify('Link copied') }
              catch { notify('Could not copy — select the link above', 'error') }
            }}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold"
            style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
            Copy link
          </button>
          {invite.whatsappUrl && (
            <a href={invite.whatsappUrl} target="_blank" rel="noopener noreferrer"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-center text-white"
              style={{ background: '#25D366' }}>
              Send on WhatsApp
            </a>
          )}
        </div>
        {!invite.whatsappUrl && (
          <p className="text-[11.5px] mt-2" style={{ color: 'var(--text-muted)' }}>
            No phone number on file for this member — copy the link and send it yourself.
          </p>
        )}
      </div>
    </div>
  )
}
