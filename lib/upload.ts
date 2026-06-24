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

interface Attempt extends UploadResult {
  retriable?: boolean   // network/timeout/5xx — worth retrying
}

function postOnce(file: File, prefix: string): Promise<Attempt> {
  const fd = new FormData()
  fd.append('file', file)
  if (prefix) fd.append('prefix', prefix)

  return new Promise<Attempt>((resolve) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/upload', true)
    xhr.onload = () => {
      let data: { path?: string; name?: string; size?: number; error?: string } = {}
      try { data = JSON.parse(xhr.responseText) } catch { /* non-JSON response */ }
      if (xhr.status >= 200 && xhr.status < 300 && data.path) {
        resolve({ path: data.path, name: data.name, size: data.size })
      } else {
        // 4xx = real, non-retriable error; 5xx (or 0) = transient
        resolve({ error: data.error ?? `Upload failed (HTTP ${xhr.status})`, retriable: xhr.status === 0 || xhr.status >= 500 })
      }
    }
    xhr.onerror = () => resolve({ error: 'Network error during upload', retriable: true })
    xhr.ontimeout = () => resolve({ error: 'Upload timed out', retriable: true })
    xhr.timeout = 120000
    xhr.send(fd)
  })
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/** Upload a file via our same-origin /api/upload route, over XHR (not fetch, to
 *  dodge the Safari "Load failed" bug), with automatic retries for transient
 *  network failures. `prefix` is an optional sub-folder (e.g. "supplier-invoices"). */
export async function uploadAttachment(file: File, prefix = ''): Promise<UploadResult> {
  let last: Attempt = { error: 'Upload failed' }
  for (let attempt = 1; attempt <= 3; attempt++) {
    last = await postOnce(file, prefix)
    if (!last.error) return last           // success
    if (!last.retriable) return last        // real error — don't keep trying
    if (attempt < 3) await sleep(800 * attempt)  // transient — back off and retry
  }
  return { error: `${last.error} (after 3 attempts — please try again in a moment)` }
}
