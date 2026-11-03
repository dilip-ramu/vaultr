'use client'

import { useState } from 'react'
import { Package, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { notify } from '@/components/shared/Toast'
import { supplierPack, type PackFile } from '@/lib/orders/pack'
import { orderSummaryDocModel, type SummaryInput } from '@/lib/orders/summaryDoc'
import type { DocModel } from '@/lib/documents/model'

interface Props {
  orderNumber: string
  /** The purchase order raised for this order, if there is one. */
  poDocId: string | null
  poNumber: string | null
  supplierName: string | null
  files: PackFile[]
  summary: SummaryInput
}

/**
 * One download holding everything the supplier needs: the purchase order, a
 * one-page summary, and every file tagged for them.
 *
 * Zipped in the browser rather than on the server, because the PDFs are drawn
 * by jsPDF and the letterhead logo loads through an Image element — which
 * only exists here. A purchase order without the letterhead looks like a
 * draft, and that is what the supplier would receive.
 */
export default function SupplierPackButton({ orderNumber, poDocId, poNumber, supplierName, files, summary }: Props) {
  const [busy, setBusy] = useState(false)
  const plan = supplierPack({ orderNumber, poNumber, supplierName, files })

  async function build() {
    setBusy(true)
    try {
      const [{ default: JSZip }, { docModelPdfBlob }] = await Promise.all([
        import('jszip'),
        import('@/lib/pdf/renderDocModelPdf'),
      ])
      const zip = new JSZip()
      const sb = createClient()
      const missing: string[] = []

      for (const entry of plan.entries) {
        if (entry.kind === 'summary') {
          zip.file(entry.entry, await docModelPdfBlob(orderSummaryDocModel(summary)))
          continue
        }
        if (entry.kind === 'purchase-order') {
          if (!poDocId) continue
          const res = await fetch(`/api/documents/${poDocId}/model`)
          if (!res.ok) { missing.push('the purchase order'); continue }
          const built = await res.json() as { model: DocModel }
          zip.file(entry.entry, await docModelPdfBlob(built.model))
          continue
        }
        // An uploaded file. A signed URL rather than a public one: the bucket
        // is private, and it should stay that way.
        const { data } = await sb.storage.from('vaultr-attachments').createSignedUrl(entry.path!, 300)
        if (!data?.signedUrl) { missing.push(entry.entry); continue }
        const res = await fetch(data.signedUrl)
        if (!res.ok) { missing.push(entry.entry); continue }
        zip.file(entry.entry, await res.blob())
      }

      const blob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = plan.zipName
      a.click()
      URL.revokeObjectURL(url)

      // Never say "done" when something was left out. The whole point of the
      // pack is that the supplier gets everything.
      if (missing.length) notify(`Pack downloaded, but could not include: ${missing.join(', ')}`, 'error')
      else notify('Supplier pack downloaded ✓', 'success')
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not build the pack', 'error')
    } finally { setBusy(false) }
  }

  return (
    <div className="rounded-xl p-3 flex flex-wrap items-center justify-between gap-3" style={{ background: 'var(--surface-2)' }}>
      <div className="min-w-0">
        <div className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>Supplier pack</div>
        <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>{plan.summaryLine}</div>
      </div>
      <button onClick={build} disabled={busy}
        className="shrink-0 flex items-center gap-2 px-3.5 py-2 rounded-xl text-white text-[13px] font-bold disabled:opacity-60"
        style={{ background: 'var(--brand)' }}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}
        {busy ? 'Building…' : 'Download zip'}
      </button>
    </div>
  )
}
