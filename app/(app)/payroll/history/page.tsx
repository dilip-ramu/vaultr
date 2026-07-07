export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { PayrollMonth } from '@/lib/payroll/types'
import Link from 'next/link'

function fmtMonth(m: string) {
  const [year, month] = m.split('-')
  const date = new Date(Number(year), Number(month) - 1)
  return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}

function fmtInr(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
}

export default async function PayrollHistoryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: months } = await supabase
    .from('payroll_months')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_finalized', true)
    .order('payroll_month', { ascending: false })

  // Get entry counts + totals per month
  const monthIds = (months ?? []).map((m: PayrollMonth) => m.id)
  let entryStats: Record<string, { count: number; total: number }> = {}

  if (monthIds.length > 0) {
    const { data: entries } = await supabase
      .from('payroll_entries')
      .select('payroll_month_id, final_payable')
      .in('payroll_month_id', monthIds)
      .eq('user_id', user.id)

    for (const e of entries ?? []) {
      if (!entryStats[e.payroll_month_id]) {
        entryStats[e.payroll_month_id] = { count: 0, total: 0 }
      }
      entryStats[e.payroll_month_id].count += 1
      entryStats[e.payroll_month_id].total += Number(e.final_payable)
    }
  }

  const finalizedMonths = (months ?? []) as PayrollMonth[]

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payroll History</h1>
          <p className="text-sm text-gray-500 mt-1">{finalizedMonths.length} finalized month{finalizedMonths.length !== 1 ? 's' : ''}</p>
        </div>

        {finalizedMonths.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            No finalized payrolls yet. Finalize a month in{' '}
            <Link href="/payroll/processing" className="text-blue-500 hover:underline">Monthly Processing</Link>.
          </div>
        ) : (
          <div className="space-y-3">
            {finalizedMonths.map(m => {
              const stats = entryStats[m.id] ?? { count: 0, total: 0 }
              return (
                <div key={m.id} className="bg-white border border-gray-200 rounded-xl p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-3">
                        <h2 className="text-lg font-semibold text-gray-900">{fmtMonth(m.payroll_month)}</h2>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                          ✓ Finalized
                        </span>
                      </div>
                      {m.finalized_at && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          Finalized on {new Date(m.finalized_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-4">
                      <Link
                        href={`/payroll/slips?month=${m.id}`}
                        className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                      >
                        View Slips →
                      </Link>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-gray-100">
                    <div>
                      <div className="text-xs text-gray-400">Employees</div>
                      <div className="font-semibold text-gray-900 mt-0.5">{stats.count}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400">Total Payable</div>
                      <div className="font-semibold text-gray-900 mt-0.5">{fmtInr(stats.total)}</div>
                    </div>
                    {m.expended_rate > 0 && (
                      <div>
                        <div className="text-xs text-gray-400">Expended Rate</div>
                        <div className="font-mono font-semibold text-gray-900 mt-0.5">
                          ₹{Number(m.expended_rate).toLocaleString('en-IN', { minimumFractionDigits: 2 })} / €
                        </div>
                      </div>
                    )}
                    {m.effective_rate > 0 && (
                      <div>
                        <div className="text-xs text-gray-400">Effective Rate</div>
                        <div className="font-mono font-semibold text-gray-900 mt-0.5">
                          ₹{Number(m.effective_rate).toLocaleString('en-IN', { minimumFractionDigits: 2 })} / €
                        </div>
                      </div>
                    )}
                  </div>

                  {(m.billed_euros > 0 || m.received_inr > 0) && (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-3 pt-3 border-t border-gray-50">
                      {m.billed_euros > 0 && (
                        <div>
                          <div className="text-xs text-gray-400">Billed</div>
                          <div className="font-mono text-gray-700 mt-0.5">
                            €{Number(m.billed_euros).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </div>
                        </div>
                      )}
                      {m.received_inr > 0 && (
                        <div>
                          <div className="text-xs text-gray-400">Received</div>
                          <div className="font-mono text-gray-700 mt-0.5">{fmtInr(m.received_inr)}</div>
                        </div>
                      )}
                      {m.bank_charges > 0 && (
                        <div>
                          <div className="text-xs text-gray-400">Bank Charges</div>
                          <div className="font-mono text-gray-700 mt-0.5">{fmtInr(m.bank_charges)}</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
