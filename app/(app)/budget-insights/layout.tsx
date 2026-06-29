import BudgetInsightsTabs from '@/components/budget-insights/BudgetInsightsTabs'

export default function BudgetInsightsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      <div>
        <h1 className="text-heading" style={{ color: 'var(--text)' }}>Budget and Insights</h1>
        <p className="text-caption">Set monthly budgets and see what your spending is telling you</p>
      </div>
      <BudgetInsightsTabs />
      <div>{children}</div>
    </div>
  )
}
