// ── Storage uploader (via our own server) ────────────────────────────────────
// The browser POSTs the file to our same-origin /api/upload route; the server
// uploads it to Supabase storage. This avoids all browser↔storage problems
// (CORS, iOS standalone fetch bug) and returns the real storage error if any.

export interface UploadResult {
  path?: string
  name?: string
  size?: number
  error?: string
}

/** Upload a file. `prefix` is an optional sub-folder (e.g. "supplier-invoices").
 *  Sent via XMLHttpRequest (not fetch) to our same-origin /api/upload route:
 *  XHR avoids the Safari/iOS "Load failed" bug that breaks fetch() with a file
 *  body, and the same-origin server route avoids all browser↔storage CORS. */
export async function uploadAttachment(file: File, prefix = ''): Promise<UploadResult> {
  const fd = new FormData()
  fd.append('file', file)
  if (prefix) fd.append('prefix', prefix)

  return new Promise<UploadResult>((resolve) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/upload', true)
    xhr.onload = () => {
      let data: { path?: string; name?: string; size?: number; error?: string } = {}
      try { data = JSON.parse(xhr.responseText) } catch { /* non-JSON response */ }
      if (xhr.status >= 200 && xhr.status < 300 && data.path) {
        resolve({ path: data.path, name: data.name, size: data.size })
      } else {
        resolve({ error: data.error ?? `Upload failed (HTTP ${xhr.status})` })
      }
    }
    xhr.onerror = () => resolve({ error: 'Network error during upload — check your connection.' })
    xhr.ontimeout = () => resolve({ error: 'Upload timed out — try again.' })
    xhr.timeout = 120000
    xhr.send(fd)
  })
}
