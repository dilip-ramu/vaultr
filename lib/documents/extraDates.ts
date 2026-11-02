// Extra dates that only some document types carry.
//
// A purchase order needs two dates the other documents do not: the CUT-OFF
// DATE (the last day the vendor may accept the order / the last day for
// changes) and the ETD (estimated date of despatch). They are not the document
// date and they are not the reference, so they get their own fields rather
// than being typed into the notes where nothing can read them back.
//
// Which type gets which field lives here, in one list, so adding ETD to sales
// orders later is one line and the form, the PDF and the template designer all
// pick it up without being touched again.

export type ExtraDateKey = 'cutoff_date' | 'etd'

export interface ExtraDateField {
  key: ExtraDateKey
  /** What the field is called on the form and on the document. */
  label: string
  /** One line under the input, so nobody has to guess what it means. */
  hint: string
}

/** Keyed by document type id (see lib/documents/config.ts). */
export const DOC_EXTRA_DATES: Readonly<Record<string, readonly ExtraDateField[]>> = {
  purchase_order: [
    { key: 'cutoff_date', label: 'Cut-off date', hint: 'Last date this order can be accepted or changed' },
    { key: 'etd',         label: 'ETD',          hint: 'Estimated date of despatch' },
  ],
}

/** The extra dates this document type carries — empty for most types. */
export function extraDateFields(docType: string): readonly ExtraDateField[] {
  return DOC_EXTRA_DATES[docType] ?? []
}

/** Does this type carry any? (Lets a form skip the whole row.) */
export function hasExtraDates(docType: string): boolean {
  return extraDateFields(docType).length > 0
}

/** Every key any type can carry — what a SELECT or an UPDATE must cover. */
export const ALL_EXTRA_DATE_KEYS: readonly ExtraDateKey[] =
  Array.from(new Set(Object.values(DOC_EXTRA_DATES).flatMap(f => f.map(x => x.key))))

type Row = Partial<Record<ExtraDateKey, string | null | undefined>>

/**
 * Pull the stored values for a type, as form strings (`''` when unset, which
 * is what an `<input type="date">` wants — `null` makes React complain).
 * Only the keys the type actually carries, so a stray column on another type's
 * row cannot leak onto the document.
 */
export function extraDatesToForm(docType: string, row: Row | null | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const f of extraDateFields(docType)) {
    const v = row?.[f.key]
    out[f.key] = typeof v === 'string' ? v.slice(0, 10) : ''
  }
  return out
}

/**
 * What to save. A blank field must be stored as NULL, not `''` — an empty
 * string is not a date and Postgres rejects it. Keys the type does not carry
 * are set to null too, so switching a document's type cannot leave a stale
 * ETD behind.
 */
export function extraDatesToSave(docType: string, form: Record<string, string>): Record<ExtraDateKey, string | null> {
  const carried = new Set(extraDateFields(docType).map(f => f.key))
  const out = {} as Record<ExtraDateKey, string | null>
  for (const k of ALL_EXTRA_DATE_KEYS) {
    const v = carried.has(k) ? (form[k] ?? '').trim() : ''
    out[k] = v ? v : null
  }
  return out
}

/** Formats one date for printing. Injected so this module stays pure. */
export type DateFmt = (iso: string) => string

/**
 * Header chips for the document, in the order the fields are declared, with
 * the blanks dropped — an empty "ETD:" line on a PDF reads like a mistake.
 */
export function extraDateChips(docType: string, row: Row | null | undefined, fmt: DateFmt): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = []
  for (const f of extraDateFields(docType)) {
    const raw = row?.[f.key]
    const v = typeof raw === 'string' ? raw.trim() : ''
    if (!v) continue
    out.push({ label: f.label, value: fmt(v) })
  }
  return out
}

/**
 * The same values as flat `doc.*` keys for the coordinate template engine.
 * Always present (blank when unset) so a placed field renders as empty rather
 * than printing the literal key.
 */
export function extraDateFieldValues(docType: string, row: Row | null | undefined, fmt: DateFmt): Record<string, string> {
  const out: Record<string, string> = {}
  for (const f of extraDateFields(docType)) {
    const raw = row?.[f.key]
    const v = typeof raw === 'string' ? raw.trim() : ''
    out[`doc.${f.key}`] = v ? fmt(v) : ''
  }
  return out
}
