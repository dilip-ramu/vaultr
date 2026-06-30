'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import type { Employee } from '@/lib/payroll/types'
import { confirmDialog } from '@/components/shared/ConfirmDialog'
import { notify } from '@/components/shared/Toast'

interface Customer { id: string; name: string }

interface Props {
  employees: Employee[]
  customers?: Customer[]
}

const EMPTY: Partial<Employee> = {
  employee_id: '',
  name: '',
  designation: '',
  salary_amount: 0,
  salary_currency: 'EUR',
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
  phone: '',
  whatsapp_number: '',
  email: '',
  is_active: true,
  works_for_customer_id: null,
  exclude_from_invoicing: false,
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function StaffClient({ employees: initialEmployees, customers = [] }: Props) {
  const router = useRouter()
  const [employees, setEmployees] = useState(initialEmployees)
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Employee | null>(null)
  const [form, setForm] = useState<Partial<Employee>>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return employees.filter(e => {
      if (!showInactive && !e.is_active) return false
      if (!q) return true
      return (
        e.name.toLowerCase().includes(q) ||
        e.employee_id.toLowerCase().includes(q) ||
        (e.designation ?? '').toLowerCase().includes(q)
      )
    })
  }, [employees, search, showInactive])

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
          <h1 className="text-2xl font-bold text-gray-900">Staff Particulars</h1>
          <p className="text-sm text-gray-500 mt-1">{activeCount} active employee{activeCount !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2 btn-brand text-white rounded-lg text-sm font-medium  transition-colors"
        >
          + Add Employee
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <input
          type="text"
          placeholder="Search by name, ID or designation…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 max-w-sm px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={e => setShowInactive(e.target.checked)}
            className="rounded"
          />
          Show inactive
        </label>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          {employees.length === 0
            ? 'No employees yet. Click "+ Add Employee" to get started.'
            : 'No employees match your search.'}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Employee</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Designation</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Bank</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">PAN</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Joined</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(emp => (
                  <tr key={emp.id} className={`hover:bg-gray-50 transition-colors ${!emp.is_active ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{emp.name}</div>
                      <div className="text-xs text-gray-400">{emp.employee_id}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{emp.designation ?? '—'}</td>
                    <td className="px-4 py-3">
                      {emp.bank_name ? (
                        <div>
                          <div className="text-gray-700">{emp.bank_name}</div>
                          <div className="text-xs text-gray-400">{emp.account_number ?? ''} {emp.ifsc ? `· ${emp.ifsc}` : ''}</div>
                        </div>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{emp.pan_number ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{fmtDate(emp.joining_date)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        emp.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {emp.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEdit(emp)}
                          className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeactivate(emp)}
                          className={`text-xs font-medium ${
                            emp.is_active
                              ? 'text-red-500 hover:text-red-700'
                              : 'text-green-600 hover:text-green-800'
                          }`}
                        >
                          {emp.is_active ? 'Deactivate' : 'Reactivate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-2xl max-h-[92dvh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">
                {editing ? 'Edit Employee' : 'Add Employee'}
              </h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-xl font-light">×</button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {error && (
                <div className="bg-red-50 text-red-700 text-sm px-4 py-2 rounded-lg">{error}</div>
              )}

              <div className="grid grid-cols-2 gap-4">
                {/* Employee Name */}
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Employee Name *</label>
                  <input
                    type="text"
                    value={form.name ?? ''}
                    onChange={e => setField('name', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Full name"
                  />
                </div>

                {/* Employee ID */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Employee ID *</label>
                  <input
                    type="text"
                    value={form.employee_id ?? ''}
                    onChange={e => setField('employee_id', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g. EMP001"
                  />
                </div>

                {/* Designation */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Designation</label>
                  <input
                    type="text"
                    value={form.designation ?? ''}
                    onChange={e => setField('designation', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g. Software Engineer"
                  />
                </div>

                {/* Salary amount + currency */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Salary *</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.salary_amount ?? ''}
                      onChange={e => setField('salary_amount', parseFloat(e.target.value) || 0)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="0.00"
                    />
                    <select
                      value={form.salary_currency ?? 'EUR'}
                      onChange={e => setField('salary_currency', e.target.value)}
                      className="px-2 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {['EUR','USD','GBP','AED','SGD','AUD','CAD','JPY','CHF','INR'].map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Joining Date */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Joining Date</label>
                  <input
                    type="date"
                    value={form.joining_date ?? ''}
                    onChange={e => setField('joining_date', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Divider */}
                <div className="col-span-2 border-t border-gray-100 pt-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Bank Details</p>
                </div>

                {/* Account Number */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Account Number</label>
                  <input
                    type="text"
                    value={form.account_number ?? ''}
                    onChange={e => setField('account_number', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Account number"
                  />
                </div>

                {/* Account Type */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Account Type</label>
                  <select
                    value={form.account_type ?? 'SB'}
                    onChange={e => setField('account_type', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  <label className="block text-xs font-medium text-gray-700 mb-1">IFSC Code</label>
                  <input
                    type="text"
                    value={form.ifsc ?? ''}
                    onChange={e => setField('ifsc', e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                    placeholder="SBIN0001234"
                  />
                </div>

                {/* Bank Name */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Bank Name</label>
                  <input
                    type="text"
                    value={form.bank_name ?? ''}
                    onChange={e => setField('bank_name', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g. State Bank of India"
                  />
                </div>

                {/* Branch */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Branch</label>
                  <input
                    type="text"
                    value={form.branch ?? ''}
                    onChange={e => setField('branch', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Branch name"
                  />
                </div>

                {/* Divider */}
                <div className="col-span-2 border-t border-gray-100 pt-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Tax & Payment</p>
                </div>

                {/* PAN */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">PAN Number</label>
                  <input
                    type="text"
                    value={form.pan_number ?? ''}
                    onChange={e => setField('pan_number', e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                    placeholder="ABCDE1234F"
                  />
                </div>

                {/* UPI */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">UPI ID <span className="text-gray-400 font-normal">(optional)</span></label>
                  <input
                    type="text"
                    value={form.upi_id ?? ''}
                    onChange={e => setField('upi_id', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="name@upi"
                  />
                </div>

                {/* Divider */}
                <div className="col-span-2 border-t border-gray-100 pt-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Personal Details</p>
                </div>

                {/* Date of Birth */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Date of Birth</label>
                  <input
                    type="date"
                    value={form.date_of_birth ?? ''}
                    onChange={e => setField('date_of_birth', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Phone Number</label>
                  <input
                    type="tel"
                    value={form.phone ?? ''}
                    onChange={e => setField('phone', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="+91 99999 99999"
                  />
                </div>

                {/* WhatsApp */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">WhatsApp Number</label>
                  <input
                    type="tel"
                    value={form.whatsapp_number ?? ''}
                    onChange={e => setField('whatsapp_number', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="+91 99999 99999 (for salary slips)"
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Email ID</label>
                  <input
                    type="email"
                    value={form.email ?? ''}
                    onChange={e => setField('email', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="employee@example.com"
                  />
                </div>

                {/* Address */}
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Address</label>
                  <textarea
                    value={form.address ?? ''}
                    onChange={e => setField('address', e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    placeholder="Street, City, State, PIN"
                  />
                </div>

                {/* Works for + invoicing toggle */}
                <div className="col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 mt-2 border-t border-gray-100">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Works for</label>
                    <select
                      value={form.works_for_customer_id ?? ''}
                      onChange={e => setField('works_for_customer_id', e.target.value || (null as never))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Me (own work)</option>
                      {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <p className="text-[10px] text-gray-400 mt-1">Drives where their salary gets invoiced.</p>
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

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
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
