import ProcessingTabs from '@/components/payroll/processing/ProcessingTabs'

export default function ProcessingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-3">
        <ProcessingTabs />
      </div>
      <div>{children}</div>
    </div>
  )
}
