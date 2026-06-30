import CustomersHomeTabs from '@/components/customers/CustomersHomeTabs'

export default function CustomersLayout({ children }: { children: React.ReactNode }) {
  // The tab strip is a client component that only renders on /customers and
  // /customers/directory — so deeper child routes (commission, etc.) keep
  // their previous layout unchanged.
  return (
    <div>
      <CustomersHomeTabs />
      {children}
    </div>
  )
}
