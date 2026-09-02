// The member portal's own shell.
//
// Deliberately NOT the app's AppShell. There is no navigation to anything else
// in Inex from here, because there is nothing else here for these people to
// reach. A member who guesses /dashboard gets the normal login redirect — their
// portal session is not an app session and never becomes one.

export const metadata = { title: 'My Chit' }

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', color: 'var(--text)' }}>
      <div className="mx-auto w-full max-w-lg px-4 pb-16">{children}</div>
    </div>
  )
}
