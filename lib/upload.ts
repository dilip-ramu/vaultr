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

/** Upload a file. `prefix` is an optional sub-folder (e.g. "supplier-invoices"). */
export async function uploadAttachment(file: File, prefix = ''): Promise<UploadResult> {
  try {
    const fd = new FormData()
    fd.append('file', file)
    if (prefix) fd.append('prefix', prefix)
    const res = await fetch('/api/upload', { method: 'POST', body: fd })
    const data = await res.json()
    if (!res.ok) return { error: data.error ?? `Upload failed (HTTP ${res.status})` }
    return { path: data.path, name: data.name, size: data.size }
  } catch (e) {
    return { error: (e as Error).message }
  }
}
