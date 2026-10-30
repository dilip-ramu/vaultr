// The Invoices section no longer has tabs.
//
// It had three — Couriers, Reimbursables, Invoices — and they were the problem
// rather than the navigation: one was a batch screen, one was a queue of
// expenses that were not invoices at all, and the third was a list, while the
// page itself was called Invoices. A tab bar is the right shape for three
// views of one thing, and these were three different jobs.
//
// They are now three flows behind a chooser, each of which carries its own
// heading and step bar, so this layout has nothing left to add.

export default function InvoicesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
