import { createClient } from '@/lib/supabase/client'

// ── Storage uploader (XHR, not fetch) ────────────────────────────────────────
// iOS Safari in standalone/home-screen mode fails fetch() requests with a File
// body — the error surfaces as "Load failed". Supabase's storage client uses
// fetch internally, so every attachment upload breaks. XMLHttpRequest is NOT
// affected by that WebKit bug, so we upload via XHR directly to the storage
// REST endpoint using the signed-in user's token.

export interface UploadResult {
  error?: string
}

export async function uploadToBucket(bucket: string, path: string, file: Blob, contentType?: string): Promise<UploadResult> {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { error: 'Not signed in — please refresh and try again.' }

  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!baseUrl) return { error: 'Storage not configured.' }

  const url = `${baseUrl}/storage/v1/object/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`

  return new Promise<UploadResult>((resolve) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url, true)
    xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`)
    xhr.setRequestHeader('x-upsert', 'false')
    const type = contentType || (file as File).type
    if (type) xhr.setRequestHeader('Content-Type', type)

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({})
      } else {
        let msg = `Upload failed (HTTP ${xhr.status})`
        try {
          const j = JSON.parse(xhr.responseText)
          msg = j.message || j.error || msg
        } catch { /* keep default */ }
        resolve({ error: msg })
      }
    }
    xhr.onerror = () => resolve({ error: 'Network error during upload — check your connection.' })
    xhr.ontimeout = () => resolve({ error: 'Upload timed out — try again.' })
    xhr.timeout = 120000
    xhr.send(file)
  })
}
