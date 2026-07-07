export default function SuppliersLayout({ children }: { children: React.ReactNode }) {
  // Hub sub-nav (Overview / Directory / Invoices / Fetch) is the single top
  // toggle (HubTabs → Suppliers); this layout is just a passthrough.
  return <div>{children}</div>
}
