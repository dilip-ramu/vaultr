export const dynamic = 'force-dynamic'

/** Setup is configured via the single top hub toggle (HubTabs → System:
 *  Settings / Email / Categories / Account types / Currencies / Export /
 *  Downloads). This layout is just a full-width passthrough — each section
 *  page owns its own header + padding. */
export default function SetupLayout({ children }: { children: React.ReactNode }) {
  return <div className="w-full">{children}</div>
}
