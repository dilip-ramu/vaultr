#!/usr/bin/env node
/**
 * Bulk-import Monday.com attachments onto EXISTING Vaultr assets.
 *
 *   node scripts/import-monday-attachments.mjs                 # dry run — shows the matches, writes nothing
 *   node scripts/import-monday-attachments.mjs --apply         # actually import
 *   node scripts/import-monday-attachments.mjs --board=metals  # one board only
 *
 * ── What it does ────────────────────────────────────────────────────────────
 * For each Monday item it finds the Vaultr asset with the same name, downloads
 * every file attached to that item, uploads it to Supabase storage, and links it
 * onto the asset — a Photo becomes the asset's photo, an Invoice becomes its
 * invoice, and everything else joins its documents list.
 *
 * ── Why a dry run by default ────────────────────────────────────────────────
 * This matches on NAME, and names are not keys. Two items called "Vanjipalayam
 * Land" are indistinguishable to a machine and obvious to you. So nothing is
 * written until you've read the report and passed --apply. Ambiguous and
 * unmatched items are printed, never guessed at.
 *
 * ── Re-running is safe ──────────────────────────────────────────────────────
 * Each file lands at a path derived from its Monday asset id, so a second run
 * overwrites the same object rather than creating a twin, and documents are
 * deduped by URL. Existing photos/invoices are NOT clobbered unless you pass
 * --overwrite.
 *
 * ── Setup ───────────────────────────────────────────────────────────────────
 * Needs a Monday API token: monday.com → your avatar (bottom left) → Developers
 * → My Access Tokens → copy. Then:
 *
 *   export MONDAY_TOKEN=xxx
 *
 * Supabase creds are read from .env.local (the service-role key — this bypasses
 * RLS, which is why this is a local script and not something the app exposes).
 */

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

// ── Config: which Monday board, which columns, where they land ───────────────
const BOARDS = {
  metals: {
    id: '2051554822',
    label: 'Precious Metals',
    columns: {
      file_mkwc9aas: { target: 'photo' },                       // "Photo"
      file_mkwc4wrr: { target: 'invoice' },                     // "Invoice"
    },
  },
  realestate: {
    id: '5008204283',
    label: 'Real Estate',
    columns: {
      file_mkwc9aas: { target: 'document', type: 'Parent document' },  // "Document Copy"
      file_mkwcc061: { target: 'document', type: 'Other' },            // "Other Files"
    },
  },
}

const BUCKET = 'vaultr-avatars'

// ── Args ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const OVERWRITE = args.includes('--overwrite')
const only = args.find(a => a.startsWith('--board='))?.split('=')[1]
const boards = only ? { [only]: BOARDS[only] } : BOARDS
if (only && !BOARDS[only]) {
  console.error(`Unknown board "${only}". Options: ${Object.keys(BOARDS).join(', ')}`)
  process.exit(1)
}

// ── Env ─────────────────────────────────────────────────────────────────────
const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter(l => l.trim() && !l.startsWith('#') && l.includes('='))
    .map(l => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
    }),
)

const MONDAY_TOKEN = process.env.MONDAY_TOKEN
if (!MONDAY_TOKEN) {
  console.error('Set MONDAY_TOKEN first — monday.com → avatar → Developers → My Access Tokens.')
  process.exit(1)
}

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
)

// ── Monday ──────────────────────────────────────────────────────────────────
async function monday(query, variables = {}) {
  const res = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: MONDAY_TOKEN,
      'API-Version': '2024-10',
    },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) throw new Error(JSON.stringify(json.errors))
  return json.data
}

/** Every item on a board, with its files, following the cursor to the end. */
async function fetchItems(boardId, columnIds) {
  const q = `
    query ($board: [ID!], $cols: [String!], $cursor: String) {
      boards(ids: $board) {
        items_page(limit: 100, cursor: $cursor) {
          cursor
          items {
            id
            name
            assets { id name file_extension public_url }
            column_values(ids: $cols) { id value }
          }
        }
      }
    }`

  const items = []
  let cursor = null
  do {
    const d = await monday(q, { board: [boardId], cols: columnIds, cursor })
    const page = d.boards[0].items_page
    items.push(...page.items)
    cursor = page.cursor
  } while (cursor)
  return items
}

// ── Matching ────────────────────────────────────────────────────────────────
// Names are compared loosely (case, spacing, punctuation) because "Veerapandi-
// Home" and "Veerapandi Home" are the same thing to you. They are NOT compared
// fuzzily beyond that: a near-miss is reported, not assumed.
const norm = s => (s ?? '')
  .toLowerCase()
  .replace(/[\u2018\u2019\u201c\u201d]/g, "'")   // curly quotes → straight: "Mom’s" and "Mom's" are the same thing
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()

/**
 * Hand-written overrides, for the ones a name match can never get: an item called
 * "Veerapandi Site" that lives in Vaultr as "Veerapandi land". Edit
 * scripts/monday-name-map.json — { "monday item name": "vaultr asset name" } —
 * and re-run. Nothing is guessed on your behalf.
 */
let NAME_MAP = {}
try {
  NAME_MAP = JSON.parse(readFileSync(new URL('./monday-name-map.json', import.meta.url), 'utf8'))
} catch { /* no map yet — fine */ }

/** How alike are two names? Used ONLY to suggest, never to decide. */
function similarity(a, b) {
  const A = new Set(norm(a).split(' ').filter(Boolean))
  const B = new Set(norm(b).split(' ').filter(Boolean))
  if (!A.size || !B.size) return 0
  let hits = 0
  for (const w of A) if (B.has(w)) hits++
  return hits / Math.max(A.size, B.size)
}

function indexAssets(rows) {
  const byName = new Map()
  for (const a of rows) {
    const k = norm(a.name)
    if (!byName.has(k)) byName.set(k, [])
    byName.get(k).push(a)
  }
  return byName
}

// ── Storage ─────────────────────────────────────────────────────────────────
async function upload(userId, mondayAssetId, fileName, url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`download failed (HTTP ${res.status})`)
  const buf = Buffer.from(await res.arrayBuffer())

  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
  // The Monday asset id is IN the path, so re-running overwrites the same object
  // instead of piling up copies.
  const path = `${userId}/assets/monday-${mondayAssetId}-${safe}`

  const { error } = await supabase.storage.from(BUCKET).upload(path, buf, {
    upsert: true,
    contentType: res.headers.get('content-type') || undefined,
  })
  if (error) throw new Error(`upload failed: ${error.message}`)

  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

// ── Preflight: is the token any good? ───────────────────────────────────────
// Ask Monday who we are before asking it for anything else. A bad token failing
// here says "bad token"; a bad token failing four calls later says "Not
// authenticated" halfway through a board and looks like a bug in the query.
try {
  const who = await monday('query { me { name email } }')
  console.log(`Monday: signed in as ${who.me.name} <${who.me.email}>`)
} catch {
  console.error(`
Monday rejected the token.

MONDAY_TOKEN is currently: ${MONDAY_TOKEN.slice(0, 8)}…${MONDAY_TOKEN.length < 40 ? `  (only ${MONDAY_TOKEN.length} chars — a real token is much longer)` : ''}

Get a fresh one:
  monday.com → click your avatar (bottom-left) → Developers
            → My Access Tokens → Show / Copy

Then, in the SAME terminal you run the script in:
  export MONDAY_TOKEN='paste-the-token-here'
  node scripts/import-monday-attachments.mjs

(The quotes matter — tokens contain characters the shell will otherwise eat.)
`)
  process.exit(1)
}

// ── Main ────────────────────────────────────────────────────────────────────
const { data: assetRows, error: assetErr } = await supabase
  .from('assets')
  .select('id, user_id, name, category, subcategory, photo_url, details')
if (assetErr) { console.error('Could not read assets:', assetErr.message); process.exit(1) }

console.log(`${assetRows.length} assets in Vaultr.\n`)

let planned = 0, skipped = 0, done = 0, failed = 0
const unmatched = [], ambiguous = []

for (const [key, board] of Object.entries(boards)) {
  const columnIds = Object.keys(board.columns)
  const items = await fetchItems(board.id, columnIds)
  const byName = indexAssets(assetRows)

  console.log(`── ${board.label} — ${items.length} items ──────────────────────────`)

  for (const item of items) {
    // Which column each file came from: that's what decides where it lands.
    const columnOf = new Map()
    for (const cv of item.column_values) {
      if (!cv.value) continue
      let files = []
      try { files = JSON.parse(cv.value).files ?? [] } catch { continue }
      for (const f of files) columnOf.set(String(f.assetId), cv.id)
    }

    const files = item.assets.filter(a => columnOf.has(String(a.id)))
    if (files.length === 0) continue

    // A manual override wins over the name, always.
    const mapped = NAME_MAP[item.name]
    const matches = byName.get(norm(mapped ?? item.name)) ?? []

    if (matches.length === 0) {
      // Say what it ALMOST matched, so the fix is obvious rather than a hunt.
      const near = assetRows
        .map(a => ({ name: a.name, score: similarity(item.name, a.name) }))
        .filter(x => x.score >= 0.34)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map(x => x.name)
      unmatched.push({ item: item.name, files: files.length, near, mapped })
      continue
    }
    if (matches.length > 1) { ambiguous.push(`${item.name} → ${matches.length} assets with that name`); continue }

    const asset = matches[0]
    const details = { ...(asset.details ?? {}) }
    const documents = Array.isArray(details.documents) ? [...details.documents] : []
    const patch = {}
    const actions = []

    // EVERY file is imported, exactly as Monday has it. An item may carry two
    // photos and one invoice, or no photo and three invoices — all of it lands in
    // the asset's documents, tagged Photo or Invoice, and nothing is dropped to
    // make it fit a single-slot field.
    //
    // photo_url / invoice_url are set to the FIRST of each. They aren't storage —
    // they're just which photo goes on the card and which invoice the form field
    // points at. The files themselves live in documents either way.
    for (const f of files) {
      const spec = board.columns[columnOf.get(String(f.id))]
      const docType = spec.target === 'photo' ? 'Photo'
        : spec.target === 'invoice' ? 'Invoice'
        : (spec.type ?? 'Other')

      if (!APPLY) { actions.push(`${docType}: ${f.name}`); planned++; continue }

      try {
        const url = await upload(asset.user_id, f.id, f.name, f.public_url)

        // Same file already on this asset (you've run this before) — don't add a
        // second copy of it. The URL is deterministic, so this is exact.
        if (!documents.some(d => d.url === url)) {
          documents.push({ type: docType, url, name: f.name })
        }

        // First photo becomes the cover; first invoice fills the invoice field.
        if (docType === 'Photo' && (!asset.photo_url || OVERWRITE) && !patch.photo_url) {
          patch.photo_url = url
        }
        if (docType === 'Invoice' && (!details.invoice_url || OVERWRITE)) {
          details.invoice_url = url
        }

        actions.push(`${docType}: ${f.name}`)
        done++
      } catch (e) {
        console.log(`   ✗ ${item.name} — ${f.name}: ${e.message}`)
        failed++
      }
    }

    if (actions.length === 0) continue
    console.log(`  ${APPLY ? '✓' : '·'} ${item.name}  →  ${asset.name}`)
    for (const a of actions) console.log(`      ${a}`)

    if (APPLY) {
      if (documents.length) details.documents = documents
      patch.details = details
      const { error } = await supabase.from('assets').update(patch).eq('id', asset.id)
      if (error) { console.log(`   ✗ save failed: ${error.message}`); failed++ }
    }
  }
  console.log('')
}

// ── The report ──────────────────────────────────────────────────────────────
// Unmatched and ambiguous items are the whole point of the dry run. They are the
// ones a machine would get wrong and you would get right in two seconds.
if (unmatched.length) {
  console.log(`No Vaultr asset with a matching name (${unmatched.length}):`)
  for (const u of unmatched) {
    console.log(`   – "${u.item}" — ${u.files} file(s)${u.mapped ? `  [mapped to "${u.mapped}", which also doesn't exist]` : ''}`)
    if (u.near.length) console.log(`       did you mean: ${u.near.map(n => `"${n}"`).join('  ·  ')}`)
  }
  console.log(`
   To link these, create scripts/monday-name-map.json:
   {${unmatched.map(u => `\n     "${u.item}": "${u.near[0] ?? 'EXACT VAULTR ASSET NAME'}"`).join(',')}
   }
   …then re-run the dry run. Delete a line to skip that item entirely.
`)
}
if (ambiguous.length) {
  console.log(`Several assets share the name — I won't guess (${ambiguous.length}):`)
  for (const a of ambiguous) console.log(`   – ${a}`)
  console.log('')
}

if (APPLY) {
  console.log(`Imported ${done} file(s). ${skipped} already present. ${failed} failed.`)
} else {
  console.log(`DRY RUN — nothing written. ${planned} file(s) would be imported, ${skipped} already present.`)
  console.log('Re-run with --apply once the matches above look right.')
}
