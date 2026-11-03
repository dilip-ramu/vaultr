// The zip that goes to the supplier.
//
// One download that holds everything they need: the files you tagged for
// them, the purchase order itself, and a one-page summary so they do not have
// to open five attachments to find out what is wanted.
//
// What is in it is decided here, as a plan, separately from the code that
// actually fetches bytes and zips them. A pack that quietly leaves out a tech
// pack, or overwrites one file with another because both were called
// "artwork.pdf", is the kind of mistake that is only discovered when the wrong
// goods arrive.

export interface PackFile {
  /** The name as it was uploaded. */
  name: string
  /** Where it lives in storage. */
  path: string
}

export interface PackEntry {
  /** Name inside the zip. Unique, and safe on Windows. */
  entry: string
  kind: 'file' | 'purchase-order' | 'summary'
  /** Storage key, for the uploaded files only. */
  path?: string
}

export interface PackPlan {
  /** The .zip filename. */
  zipName: string
  entries: PackEntry[]
  /** Said on screen before you press download. */
  summaryLine: string
}

/** Strip what a file system or a zip reader will not take. */
export function safeName(name: string): string {
  const cleaned = String(name ?? '')
    .replace(/[\\/:*?"<>|]+/g, '-')   // illegal on Windows
    .replace(/\s+/g, ' ')
    .replace(/^\.+/, '')              // no hidden files, no '..'
    .trim()
  return cleaned || 'file'
}

/**
 * Make every name in the list distinct, keeping the extension.
 * Two files called artwork.pdf become artwork.pdf and artwork (2).pdf —
 * a zip with one of them silently missing is worse than an ugly name.
 */
export function uniqueNames(names: readonly string[]): string[] {
  const seen = new Map<string, number>()
  return names.map(raw => {
    const name = safeName(raw)
    const key = name.toLowerCase()
    const n = seen.get(key) ?? 0
    seen.set(key, n + 1)
    if (n === 0) return name
    const dot = name.lastIndexOf('.')
    const stem = dot > 0 ? name.slice(0, dot) : name
    const ext = dot > 0 ? name.slice(dot) : ''
    return `${stem} (${n + 1})${ext}`
  })
}

export interface PackInput {
  orderNumber: string
  /** The purchase order's number, when one has been raised. */
  poNumber?: string | null
  supplierName?: string | null
  files: readonly PackFile[]
}

export function supplierPack(input: PackInput): PackPlan {
  const names = uniqueNames(input.files.map(f => f.name))
  const entries: PackEntry[] = []

  // The purchase order first, because it is the instruction and everything
  // else is supporting material.
  if (input.poNumber) {
    entries.push({ entry: `${safeName(input.poNumber)}.pdf`, kind: 'purchase-order' })
  }
  entries.push({ entry: `${safeName(input.orderNumber)} - summary.pdf`, kind: 'summary' })
  input.files.forEach((f, i) => entries.push({ entry: names[i], kind: 'file', path: f.path }))

  const base = input.poNumber || input.orderNumber
  const who = input.supplierName ? ` - ${safeName(input.supplierName)}` : ''
  const fileCount = input.files.length

  return {
    zipName: `${safeName(base)}${who}.zip`,
    entries,
    summaryLine: input.poNumber
      ? `Purchase order, a one-page summary and ${fileCount} file${fileCount === 1 ? '' : 's'}.`
      : `A one-page summary and ${fileCount} file${fileCount === 1 ? '' : 's'}. Raise the purchase order first to include it.`,
  }
}
