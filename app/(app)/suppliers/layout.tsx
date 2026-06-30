import SuppliersHomeTabs from '@/components/suppliers/SuppliersHomeTabs'

export default function SuppliersLayout({ children }: { children: React.ReactNode }) {
  // Tab strip only renders on /suppliers and /suppliers/directory. Deeper
  // child routes (invoices, categories) keep their previous layout untouched.
  return (
    <div>
      <SuppliersHomeTabs />
      {children}
    </div>
  )
}
