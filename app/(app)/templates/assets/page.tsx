import AssetsClient from '@/components/templates/AssetsClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Image assets — Vaultr' }

export default function TemplateAssetsPage() {
  return (
    <div className="w-full px-4 md:px-8 py-6">
      <div className="mb-5">
        <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>Image assets</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
          Your reusable images — letterheads, watermarks, stamps, banners. Set the size (mm), opacity and fit once here,
          then add the image to any template from <b>Image → From assets</b> and it arrives already configured.
        </p>
      </div>
      <AssetsClient />
    </div>
  )
}
