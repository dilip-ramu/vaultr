// The member portal's own shell.
//
// Deliberately NOT the app's AppShell. There is no navigation to anything else
// in Inex from here, because there is nothing else here for these people to
// reach. A member who guesses /dashboard gets the normal login redirect — their
// portal session is not an app session and never becomes one.

export const metadata = { title: 'My Chit' }

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    // The portal has to scroll ITSELF. The app sets `body { overflow: hidden }`
    // and scrolls an inner pane instead, which the portal does not have — so
    // without this, a passbook longer than the screen simply could not be
    // read past the fold. Touch scrolling is asked for explicitly because
    // this is opened on a phone far more often than not.
    <div style={{
      height: '100dvh',
      overflowY: 'auto',
      WebkitOverflowScrolling: 'touch',
      background: 'var(--bg)',
      color: 'var(--text)',
    }}>
      <div className="mx-auto w-full max-w-lg px-4 pb-16">{children}</div>
    </div>
  )
}
