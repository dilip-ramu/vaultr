'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import type { Employee } from '@/lib/payroll/types'
import { confirmDialog } from '@/components/shared/ConfirmDialog'
import { notify } from '@/components/shared/Toast'
import EntityCard, { FaceField } from '@/components/shared/EntityCard'
import ColorPicker from '@/components/shared/ColorPicker'
import { autoColor } from '@/lib/card-gradient'

interface Customer { id: string; name: string }
interface Company  { id: string; name: string; is_default?: boolean }

interface Props {
  employees: Employee[]
  customers?: Customer[]
  /** v66 — companies the user has. Drives:
   *   ─ the Company dropdown on the employee form
   *   ─ the chip filter row at the top of the list
   *  Undefined/empty = single-company setups; UI hides those affordances. */
  companies?: Company[]
}

const EMPTY: Partial<Employee> = {
  employee_id: '',
  name: '',
  designation: '',
  salary_amount: 0,
  // INR by default — most staff are paid in rupees. EUR/USD is the exception,
  // set explicitly per-employee.
  salary_currency: 'INR',
  account_number: '',
  account_type: '10',
  ifsc: '',
  bank_name: '',
  branch: '',
  pan_number: '',
  upi_id: '',
  joining_date: '',
  date_of_birth: '',
  address: '',
  reporting_manager: '',
  reporting_manager_designation: '',
  employment_country: '',
  employment_city: '',
  phone: '',
  whatsapp_number: '',
  email: '',
  is_active: true,
  works_for_customer_id: null,
  exclude_from_invoicing: false,
  company_id: null,
  color: null,
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function StaffClient({ employees: initialEmployees, customers = [], companies = [] }: Props) {
  const router = useRouter()
  const [employees, setEmployees] = useState(initialEmployees)
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  /** v66 — Company chip filter. 'all' shows every row; 'personal' shows
   *  employees without a company_id; a specific company id shows just its
   *  own. Hidden entirely when the user has fewer than 2 companies. */
  const [companyFilter, setCompanyFilter] = useState<'all' | 'personal' | string>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Employee | null>(null)
  const [form, setForm] = useState<Partial<Employee>>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generatingId, setGeneratingId] = useState<string | null>(null)

  async function handleGenerateContract(emp: Employee) {
    setGeneratingId(emp.id)
    try {
      const res = await fetch('/api/contracts/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: emp.id }),
      })
      const data = await res.json()
      if (!res.ok) { notify(data.error || 'Could not generate contract', 'error'); return }
      // Trigger the download of the signed .docx URL.
      const a = document.createElement('a')
      a.href = data.url; a.download = data.fileName ?? 'contract.docx'
      document.body.appendChild(a); a.click(); a.remove()
      notify('Contract generated', 'success')
    } catch {
      notify('Could not generate contract', 'error')
    } finally { setGeneratingId(null) }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return employees.filter(e => {
      if (!showInactive && !e.is_active) return false
      // Company filter: 'personal' = null company_id; a real id = exact match.
      if (companyFilter === 'personal' && (e as { company_id?: string | null }).company_id != null) return false
      if (companyFilter !== 'all' && companyFilter !== 'personal') {
        if ((e as { company_id?: string | null }).company_id !== companyFilter) return false
      }
      if (!q) return true
      return (
        e.name.toLowerCase().includes(q) ||
        e.employee_id.toLowerCase().includes(q) ||
        (e.designation ?? '').toLowerCase().includes(q)
      )
    })
  }, [employees, search, showInactive, companyFilter])

  function openCreate() {
    setEditing(null)
    setForm({ ...EMPTY })
    setError(null)
    setModalOpen(true)
  }

  function openEdit(emp: Employee) {
    setEditing(emp)
    setForm({ ...emp })
    setError(null)
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditing(null)
    setForm(EMPTY)
    setError(null)
  }

  function setField(key: keyof Employee, value: string | number | boolean) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    if (!form.name?.trim()) { setError('Employee name is required'); return }
    if (!form.employee_id?.trim()) { setError('Employee ID is required'); return }
    if (!form.salary_amount || form.salary_amount <= 0) { setError('Salary must be > 0'); return }

    setSaving(true)
    setError(null)
    try {
      let res: Response
      if (editing) {
        res = await fetch(`/api/payroll/employees/${editing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
      } else {
        res = await fetch('/api/payroll/employees', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
      }
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to save'); return }

      if (editing) {
        setEmployees(prev => prev.map(e => e.id === editing.id ? data.employee : e))
      } else {
        setEmployees(prev => [data.employee, ...prev])
      }
      closeModal()
      router.refresh()
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeactivate(emp: Employee) {
    const action = emp.is_active ? 'deactivate' : 'reactivate'
    if (!await confirmDialog(`${action.charAt(0).toUpperCase() + action.slice(1)} ${emp.name}?`)) return

    try {
      const res = await fetch(`/api/payroll/employees/${emp.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !emp.is_active }),
      })
      const data = await res.json()
      if (!res.ok) { notify(data.error ?? 'Failed'); return }
      setEmployees(prev => prev.map(e => e.id === emp.id ? data.employee : e))
      router.refresh()
    } catch {
      notify('Network error')
    }
  }

  const activeCount = employees.filter(e => e.is_active).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text)]">Staff</h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">{activeCount} active employee{activeCount !== 1 ? 's' : ''} · salary &amp; bank details</p>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2 btn-brand text-white rounded-xl text-sm font-bold transition-colors"
        >
          + Add staff
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <input
          type="text"
          placeholder="Search by name, ID or designation…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 max-w-sm px-3 py-2 border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--border)]"
        />
        <label className="flex items-center gap-2 text-sm text-[var(--text-muted)] cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={e => setShowInactive(e.target.checked)}
            className="rounded"
          />
          Show inactive
        </label>
      </div>

      {/* v66 — Company chips. Hidden when the user only has one company
          (or none), since filtering wouldn't be useful there. */}
      {companies.length >= 1 && (
        <div className="flex flex-wrap gap-1.5">
          <CompanyChip active={companyFilter === 'all'}       onClick={() => setCompanyFilter('all')}      label="All" />
          <CompanyChip active={companyFilter === 'personal'}  onClick={() => setCompanyFilter('personal')} label="Personal" hue="#6B7280" />
          {companies.map(c => (
            <CompanyChip
              key={c.id}
              active={companyFilter === c.id}
              onClick={() => setCompanyFilter(c.id)}
              label={c.name + (c.is_default ? ' · default' : '')}
              hue="#3B4AC7"
            />
          ))}
        </div>
      )}

      {/* Cards */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-[var(--text-faint)]">
          {employees.length === 0
            ? 'No employees yet. Click "+ Add staff" to get started.'
            : 'No employees match your search.'}
        </div>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
          {filtered.map(emp => {
            const color = autoColor(emp.id, emp.color)
            const last4 = emp.account_number ? String(emp.account_number).replace(/\s/g, '').slice(-4) : ''
            const salary = emp.salary_currency && emp.salary_currency !== 'INR'
              ? `${emp.salary_currency} ${Number(emp.salary_amount || 0).toLocaleString('en-IN')}`
              : `₹${Number(emp.salary_amount || 0).toLocaleString('en-IN')}`
            const companyName = emp.company_id ? companies.find(c => c.id === emp.company_id)?.name : null
            return (
              <div key={emp.id} style={{ opacity: emp.is_active ? 1 : 0.6 }}>
                <EntityCard
                  color={color}
                  onClick={() => openEdit(emp)}
                  faceTop={<>
                    <span className="text-[10.5px] font-bold tracking-[0.1em] uppercase mt-1" style={{ color: 'rgba(255,255,255,0.8)' }}>{companyName || 'Employee'}</span>
                    <div className="w-12 h-12 rounded-lg flex items-center justify-center text-lg font-extrabold shrink-0" style={{ background: 'rgba(255,255,255,0.18)', color: '#fff' }}>{emp.name.slice(0, 2).toUpperCase()}</div>
                  </>}
                  faceBottom={<>
                    <FaceField label="Employee ID" value={emp.employee_id || '—'} />
                    <div className="mt-3"><FaceField label="Designation" value={emp.designation || '—'} /></div>
                  </>}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-[15px] font-bold truncate" style={{ color: 'var(--text)' }}>{emp.name}</p>
                        {!emp.is_active && <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>Inactive</span>}
                      </div>
                      {emp.designation && <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>{emp.designation}</p>}
                    </div>
                    <div className="flex gap-2 shrink-0 items-center" onClick={e => e.stopPropagation()}>
                      <button onClick={() => handleGenerateContract(emp)} disabled={generatingId === emp.id} className="text-[11px] font-semibold disabled:opacity-50" style={{ color: 'var(--brand)' }} title="Generate contract">{generatingId === emp.id ? '…' : 'Contract'}</button>
                      <button onClick={() => openEdit(emp)} className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>Edit</button>
                      <button onClick={() => handleDeactivate(emp)} className="text-[11px] font-semibold" style={{ color: emp.is_active ? 'var(--expense)' : 'var(--income)' }}>{emp.is_active ? 'Deactivate' : 'Reactivate'}</button>
                    </div>
                  </div>

                  <div className="mt-4">
                    <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Salary / mo</p>
                    <p className="text-2xl font-extrabold tracking-tight tabular-nums" style={{ color: 'var(--text)' }}>{salary}</p>
                  </div>

                  <div className="mt-auto pt-3 flex flex-col gap-1" style={{ borderTop: '1px solid var(--border-2, var(--border))' }}>
                    {emp.bank_name ? <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>{emp.bank_name}{last4 ? ` •••• ${last4}` : ''}{emp.ifsc ? ` · ${emp.ifsc}` : ''}</span> : <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>No bank details</span>}
                    {(emp.phone || emp.email) && <span className="text-[11px] truncate" style={{ color: 'var(--text-faint)' }}>{[emp.phone, emp.email].filter(Boolean).join(' · ')}</span>}
                  </div>
                </EntityCard>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4">
          <div className="bg-[var(--surface)] rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-2xl max-h-[92dvh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
              <h2 className="text-lg font-semibold text-[var(--text)]">
                {editing ? 'Edit Employee' : 'Add Employee'}
              </h2>
              <button onClick={closeModal} className="text-[var(--text-faint)] hover:text-[var(--text-muted)] text-xl font-light">×</button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {error && (
                <div className="bg-[var(--surface-2)] text-[var(--expense)] text-sm px-4 py-2 rounded-lg">{error}</div>
              )}

              <div className="grid grid-cols-2 gap-4">
                {/* Employee Name */}
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-[var(--text)] mb-1">Employee Name *</label>
                  <input
                    type="text"
                    value={form.name ?? ''}
                    onChange={e => setField('name', e.target.value)}
                    className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--border)]"
                    placeholder="Full name"
                  />
                </div>

                {/* Card colour */}
                <div className="col-span-2">
                  <ColorPicker value={form.color ?? null} onChange={v => setField('color', v)} label="Card colour" />
                  <p className="text-[10px] text-[var(--text-faint)] mt-1">Colours this employee&apos;s card. Leave unset for an auto colour.</p>
                </div>

                {/* Employee ID */}
                <div>
                  <label className="block text-xs font-medium text-[var(--text)] mb-1">Employee ID *</label>
                  <input
                    type="text"
                    value={form.employee_id ?? ''}
                    onChange={e => setField('employee_id', e.target.value)}
                    className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--border)]"
                    placeholder="e.g. EMP001"
                  />
                </div>

                {/* Designation */}
                <div>
                  <label className="block text-xs font-medium text-[var(--text)] mb-1">Designation</label>
                  <input
                    type="text"
                    value={form.designation ?? ''}
                    onChange={e => setField('designation', e.target.value)}
                    className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--border)]"
                    placeholder="e.g. Software Engineer"
                  />
                </div>

                {/* Salary amount + currency */}
                <div>
                  <label className="block text-xs font-medium text-[var(--text)] mb-1">Salary *</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.salary_amount ?? ''}
                      onChange={e => setField('salary_amount', parseFloat(e.target.value) || 0)}
                      className="flex-1 px-3 py-2 border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--border)]"
                      placeholder="0.00"
                    />
                    <select
                      value={form.salary_currency ?? 'INR'}
                      onChange={e => setField('salary_currency', e.target.value)}
                      className="px-2 py-2 border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--border)]"
                    >
                      {['INR','EUR','USD','GBP','AED','SGD','AUD','CAD','JPY','CHF'].map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Joining Date */}
                <div>
                  <label className="block text-xs font-medium text-[var(--text)] mb-1">Joining Date</label>
                  <input
                    type="date"
                    value={form.joining_date ?? ''}
                    onChange={e => setField('joining_date', e.target.value)}
                    className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--border)]"
                  />
                </div>

                {/* Divider */}
                <div className="col-span-2 border-t border-[var(--border)] pt-2">
                  <p className="text-xs font-semibold text-[var(--text-faint)] uppercase tracking-wider">Bank Details</p>
                </div>

                {/* Account Number */}
                <div>
                  <label className="block text-xs font-medium text-[var(--text)] mb-1">Account Number</label>
                  <input
                    type="text"
                    value={form.account_number ?? ''}
                    onChange={e => setField('account_number', e.target.value)}
                    className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--border)]"
                    placeholder="Account number"
                  />
                </div>

                {/* Account Type */}
                <div>
                  <label className="block text-xs font-medium text-[var(--text)] mb-1">Account Type</label>
                  <select
                    value={form.account_type ?? 'SB'}
                    onChange={e => setField('account_type', e.target.value)}
                    className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--border)]"
                  >
                    <option value="10">10 — Savings</option>
                    <option value="11">11 — Current</option>
                    <option value="13">13 — Cash Credit</option>
                    <option value="14">14 — NRE</option>
                    <option value="15">15 — NRO</option>
                  </select>
                </div>

                {/* IFSC */}
                <div>
                  <label className="block text-xs font-medium text-[var(--text)] mb-1">IFSC Code</label>
                  <input
                    type="text"
                    value={form.ifsc ?? ''}
                    onChange={e => setField('ifsc', e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--border)] font-mono"
                    placeholder="SBIN0001234"
                  />
                </div>

                {/* Bank Name */}
                <div>
                  <label className="block text-xs font-medium text-[var(--text)] mb-1">Bank Name</label>
                  <input
                    type="text"
                    value={form.bank_name ?? ''}
                    onChange={e => setField('bank_name', e.target.value)}
                    className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--border)]"
                    placeholder="e.g. State Bank of India"
                  />
                </div>

                {/* Branch */}
                <div>
                  <label className="block text-xs font-medium text-[var(--text)] mb-1">Branch</label>
                  <input
                    type="text"
                    value={form.branch ?? ''}
                    onChange={e => setField('branch', e.target.value)}
                    className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--border)]"
                    placeholder="Branch name"
                  />
                </div>

                {/* Divider */}
                <div className="col-span-2 border-t border-[var(--border)] pt-2">
                  <p className="text-xs font-semibold text-[var(--text-faint)] uppercase tracking-wider">Tax & Payment</p>
                </div>

                {/* PAN */}
                <div>
                  <label className="block text-xs font-medium text-[var(--text)] mb-1">PAN Number</label>
                  <input
                    type="text"
                    value={form.pan_number ?? ''}
                    onChange={e => setField('pan_number', e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--border)] font-mono"
                    placeholder="ABCDE1234F"
                  />
                </div>

                {/* UPI */}
                <div>
                  <label className="block text-xs font-medium text-[var(--text)] mb-1">UPI ID <span className="text-[var(--text-faint)] font-normal">(optional)</span></label>
                  <input
                    type="text"
                    value={form.upi_id ?? ''}
                    onChange={e => setField('upi_id', e.target.value)}
                    className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--border)]"
                    placeholder="name@upi"
                  />
                </div>

                {/* Divider */}
                <div className="col-span-2 border-t border-[var(--border)] pt-2">
                  <p className="text-xs font-semibold text-[var(--text-faint)] uppercase tracking-wider">Personal Details</p>
                </div>

                {/* Date of Birth */}
                <div>
                  <label className="block text-xs font-medium text-[var(--text)] mb-1">Date of Birth</label>
                  <input
                    type="date"
                    value={form.date_of_birth ?? ''}
                    onChange={e => setField('date_of_birth', e.target.value)}
                    className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--border)]"
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-xs font-medium text-[var(--text)] mb-1">Phone Number</label>
                  <input
                    type="tel"
                    value={form.phone ?? ''}
                    onChange={e => setField('phone', e.target.value)}
                    className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--border)]"
                    placeholder="+91 99999 99999"
                  />
                </div>

                {/* WhatsApp */}
                <div>
                  <label className="block text-xs font-medium text-[var(--text)] mb-1">WhatsApp Number</label>
                  <input
                    type="tel"
                    value={form.whatsapp_number ?? ''}
                    onChange={e => setField('whatsapp_number', e.target.value)}
                    className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--border)]"
                    placeholder="+91 99999 99999 (for salary slips)"
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-xs font-medium text-[var(--text)] mb-1">Email ID</label>
                  <input
                    type="email"
                    value={form.email ?? ''}
                    onChange={e => setField('email', e.target.value)}
                    className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--border)]"
                    placeholder="employee@example.com"
                  />
                </div>

                {/* Address */}
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-[var(--text)] mb-1">Address</label>
                  <textarea
                    value={form.address ?? ''}
                    onChange={e => setField('address', e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--border)] resize-none"
                    placeholder="Street, City, State, PIN"
                  />
                </div>

                {/* Contract fields (v73) — reporting manager + place of employment */}
                <div className="col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-[var(--text)] mb-1">Reporting manager</label>
                    <input
                      value={form.reporting_manager ?? ''}
                      onChange={e => setField('reporting_manager', e.target.value)}
                      className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--border)]"
                      placeholder="e.g. Priya Nair"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--text)] mb-1">Reporting manager&apos;s designation</label>
                    <input
                      value={form.reporting_manager_designation ?? ''}
                      onChange={e => setField('reporting_manager_designation', e.target.value)}
                      className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--border)]"
                      placeholder="e.g. Operations Head"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--text)] mb-1">Country of employment</label>
                    <input
                      value={form.employment_country ?? ''}
                      onChange={e => setField('employment_country', e.target.value)}
                      className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--border)]"
                      placeholder="e.g. India"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--text)] mb-1">City of employment</label>
                    <input
                      value={form.employment_city ?? ''}
                      onChange={e => setField('employment_city', e.target.value)}
                      className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--border)]"
                      placeholder="e.g. Chennai"
                    />
                  </div>
                </div>

                {/* Company + Works for + invoicing toggle */}
                <div className="col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 mt-2 border-t border-[var(--border)]">
                  {/* v66 — which of the user's own companies employs this person.
                       Blank / "Personal" = not attached to any business entity. */}
                  <div>
                    <label className="block text-xs font-medium text-[var(--text)] mb-1">Company</label>
                    <select
                      value={(form.company_id as string | null) ?? ''}
                      onChange={e => setField('company_id', (e.target.value || null) as never)}
                      className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--border)]"
                    >
                      <option value="">Personal (no company)</option>
                      {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <p className="text-[10px] text-[var(--text-faint)] mt-1">Which company employs them.</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--text)] mb-1">Works for (customer)</label>
                    <select
                      value={form.works_for_customer_id ?? ''}
                      onChange={e => setField('works_for_customer_id', e.target.value || (null as never))}
                      className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--border)]"
                    >
                      <option value="">Me (own work)</option>
                      {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <p className="text-[10px] text-[var(--text-faint)] mt-1">Drives where their salary gets invoiced.</p>
                  </div>
                  <div className="flex items-end">
                    <label
                      className="inline-flex items-center gap-2 text-sm cursor-pointer"
                      style={{ color: form.works_for_customer_id ? '#374151' : '#9ca3af' }}
                    >
                      <input
                        type="checkbox"
                        // Only meaningful when Works-for is a customer. When
                        // Works-for is Me, the box is forced off (the salary
                        // is never invoiced) and disabled to make that clear.
                        checked={!!form.works_for_customer_id && !form.exclude_from_invoicing}
                        onChange={e => setField('exclude_from_invoicing', !e.target.checked)}
                        disabled={!form.works_for_customer_id}
                      />
                      Include salary in client invoice
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--border)] bg-[var(--surface-2)] rounded-b-2xl">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2 btn-brand text-white rounded-lg text-sm font-medium  disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Employee'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** Company filter chip — matches AccountChipPicker (transactions) style:
 *  chunky rounded-xl with a 28px letter box + colored dot + label. */
function CompanyChip({
  active, onClick, label, hue,
}: { active: boolean; onClick: () => void; label: string; hue?: string }) {
  const color   = hue ?? '#2A7A50'
  const initial = label[0]?.toUpperCase() ?? '?'
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-2 rounded-xl border-2 transition-all"
      style={
        active
          ? { borderColor: color, backgroundColor: `${color}10`, boxShadow: '0 1px 3px rgba(0,0,0,.08)' }
          : { borderColor: 'transparent', backgroundColor: 'var(--surface-2)' }
      }
    >
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0 font-bold text-white"
        style={{ background: color }}
      >
        {initial}
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
        <span
          className="text-sm font-medium"
          style={{ color: active ? 'var(--text)' : 'var(--text-muted)' }}
        >
          {label}
        </span>
      </div>
    </button>
  )
}
