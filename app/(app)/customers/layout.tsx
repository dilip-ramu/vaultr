export default function CustomersLayout({ children }: { children: React.ReactNode }) {
  // Hub sub-nav (Overview / Directory / Invoices / Incoming / TDS) is the
  // single top toggle (HubTabs → Customers); this layout is a passthrough.
  return <div>{children}</div>
}
