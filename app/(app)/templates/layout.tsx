import TemplatesBackLink from '@/components/templates/TemplatesBackLink'

/** Templates hub. There is no tab row here — the hub is a tile grid, and each
 *  template opens as its own full page with a back link. */
export default function TemplatesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TemplatesBackLink />
      {children}
    </>
  )
}
