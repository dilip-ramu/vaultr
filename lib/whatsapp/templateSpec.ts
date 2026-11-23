// Writing a WhatsApp template, and catching what Meta would reject.
//
// WHY THIS EXISTS
//
// A template is submitted to Meta, reviewed for up to 24 hours, and only then
// can be sent. Get a brace wrong and you find out tomorrow. Worse, an APPROVED
// template may be edited only 10 times in 30 days and once in 24 hours, so a
// careless submission is not freely fixable — you spend one of your edits.
//
// So every rule Meta publishes as a rejection reason is checked here, before
// anything is submitted:
//
//   • a body may not start or end with a variable (Meta: 'dangling parameters')
//   • variables must be sequential: {{1}}, {{2}}, {{5}}, {{4}} is rejected
//   • braces must match
//   • a variable's sample may not contain # $ or %
//   • too many variables for the length of the body is rejected
//   • the name may only be lowercase letters, digits and underscores
//
// Pure. No network. The one thing it cannot check is whether another template
// already has the same body and footer — only Meta knows that.

export type TemplateCategory = 'UTILITY' | 'MARKETING' | 'AUTHENTICATION'
export type TemplateStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAUSED' | 'DISABLED'

export interface TemplateDraft {
  /** Meta's name for it: lowercase, digits, underscores. */
  name: string
  language: string
  category: TemplateCategory
  /** The body, with {{1}}, {{2}}… where the figures go. */
  body: string
  /** Optional one-line footer. No variables allowed in it. */
  footer?: string
  /**
   * What each variable means, in order. Used for the example values Meta asks
   * for and for the labels on screen.
   */
  variables: readonly { label: string; sample: string }[]
}

/** The {{n}} numbers used in a body, in the order they appear. */
export function variableNumbers(body: string): number[] {
  return [...body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map(m => Number(m[1]))
}

/** Body with each {{n}} replaced by its sample, for the preview. */
export function preview(d: TemplateDraft): string {
  return d.body.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => {
    const v = d.variables[Number(n) - 1]
    return v ? v.sample : `{{${n}}}`
  })
}

export interface Problem {
  /** Which part of the draft it is about, for highlighting. */
  field: 'name' | 'body' | 'footer' | 'variables' | 'category'
  message: string
}

const NAME_RE = /^[a-z0-9_]+$/

/**
 * Everything Meta would reject, found before submitting.
 *
 * Returned as a list rather than the first problem, because fixing one at a
 * time across a 24-hour review cycle is how a week disappears.
 */
export function problems(d: TemplateDraft): Problem[] {
  const out: Problem[] = []
  const body = d.body.trim()

  // ── Name ────────────────────────────────────────────────────────────────
  if (!d.name.trim()) out.push({ field: 'name', message: 'Give it a name.' })
  else if (!NAME_RE.test(d.name)) out.push({ field: 'name', message: 'Only lowercase letters, digits and underscores — no spaces or capitals.' })
  else if (d.name.length > 512) out.push({ field: 'name', message: 'The name is too long.' })

  if (!d.language.trim()) out.push({ field: 'name', message: 'Pick a language.' })

  // ── Body ────────────────────────────────────────────────────────────────
  if (!body) {
    out.push({ field: 'body', message: 'Write the message.' })
    return out
  }

  // Unmatched braces: '{{1}' and '{1}}' both fail at Meta.
  const opens = (body.match(/\{\{/g) ?? []).length
  const closes = (body.match(/\}\}/g) ?? []).length
  if (opens !== closes) out.push({ field: 'body', message: 'A {{ or }} is missing its pair.' })

  const nums = variableNumbers(body)

  // Meta calls these dangling parameters and rejects them outright.
  if (/^\s*\{\{\s*\d+\s*\}\}/.test(body)) {
    out.push({ field: 'body', message: 'It cannot START with a variable — put a word before it.' })
  }
  if (/\{\{\s*\d+\s*\}\}\s*$/.test(body)) {
    out.push({ field: 'body', message: 'It cannot END with a variable — put a word or a full stop after it.' })
  }

  // Sequential from 1, no gaps, no repeats out of order.
  const expected = nums.map((_, i) => i + 1)
  if (nums.length > 0 && nums.join(',') !== expected.join(',')) {
    out.push({
      field: 'body',
      message: `Variables must run 1, 2, 3… in order. This has ${nums.map(n => `{{${n}}}`).join(', ')}.`,
    })
  }

  if (nums.length !== d.variables.length) {
    out.push({
      field: 'variables',
      message: `The body uses ${nums.length} variable${nums.length === 1 ? '' : 's'} but ${d.variables.length} ${d.variables.length === 1 ? 'is' : 'are'} described.`,
    })
  }

  // Meta rejects a body that is mostly variables. Its own guidance is to
  // 'decrease the number of variable parameters or increase the message
  // length'; the ratio below is the app's reading of that, kept deliberately
  // generous so it warns rather than blocks good messages.
  const words = body.replace(/\{\{\s*\d+\s*\}\}/g, '').split(/\s+/).filter(Boolean).length
  if (nums.length > 0 && words < nums.length * 3) {
    out.push({
      field: 'body',
      message: 'Too many variables for the length of the message — add more wording, or use fewer.',
    })
  }

  // ── Variable samples ────────────────────────────────────────────────────
  d.variables.forEach((v, i) => {
    if (!v.sample.trim()) out.push({ field: 'variables', message: `Variable ${i + 1} needs an example value — Meta asks for one.` })
    else if (/[#$%]/.test(v.sample)) out.push({ field: 'variables', message: `Variable ${i + 1}: Meta rejects # $ and % in an example value.` })
    else if (/[\n\r\t]/.test(v.sample)) out.push({ field: 'variables', message: `Variable ${i + 1}: no line breaks.` })
  })

  // ── Footer ──────────────────────────────────────────────────────────────
  if (d.footer && variableNumbers(d.footer).length > 0) {
    out.push({ field: 'footer', message: 'A footer cannot contain variables.' })
  }
  if (d.footer && d.footer.length > 60) {
    out.push({ field: 'footer', message: 'Keep the footer under 60 characters.' })
  }

  return out
}

export function canSubmit(d: TemplateDraft): boolean {
  return problems(d).length === 0
}

/** The body Meta expects for a create request. */
export function createPayload(d: TemplateDraft): Record<string, unknown> {
  const components: Record<string, unknown>[] = [{
    type: 'BODY',
    text: d.body.trim(),
    ...(d.variables.length
      ? { example: { body_text: [d.variables.map(v => v.sample)] } }
      : {}),
  }]
  if (d.footer?.trim()) components.push({ type: 'FOOTER', text: d.footer.trim() })

  return {
    name: d.name.trim(),
    language: d.language,
    category: d.category,
    components,
  }
}

export function createUrl(wabaId: string, version = 'v21.0'): string {
  return `https://graph.facebook.com/${version}/${wabaId}/message_templates`
}

/** What the status means, said plainly. */
export function statusWords(status: TemplateStatus, category?: string | null, asked?: TemplateCategory): string {
  switch (status) {
    case 'DRAFT': return 'Not submitted yet.'
    case 'PENDING': return 'With Meta for review — up to 24 hours.'
    case 'APPROVED':
      // Meta assigns the category, and the business is responsible for
      // checking what it was given: marketing costs about 7.5x utility.
      return category && asked && category !== asked
        ? `Approved, but Meta classified it as ${category.toLowerCase()}, not ${asked.toLowerCase()} — that costs more per message.`
        : 'Approved and ready to send.'
    case 'REJECTED': return 'Rejected by Meta. Fix it and submit again.'
    case 'PAUSED': return 'Paused by Meta, usually after members marked it as spam.'
    case 'DISABLED': return 'Disabled by Meta. It cannot be sent.'
  }
}

/**
 * How many edits are left on an approved template.
 *
 * Meta allows 10 in a 30-day window and 1 in a 24-hour window. Running out
 * matters: a template that cannot be edited and cannot be deleted without
 * losing its name for 30 days is a corner worth seeing before you are in it.
 */
export function editsLeft(editTimes: readonly string[], now: Date = new Date()): { in24h: number; in30d: number } {
  const t = now.getTime()
  const day = 24 * 60 * 60 * 1000
  const recent = editTimes.map(s => new Date(s).getTime()).filter(n => Number.isFinite(n))
  return {
    in24h: Math.max(0, 1 - recent.filter(n => t - n < day).length),
    in30d: Math.max(0, 10 - recent.filter(n => t - n < 30 * day).length),
  }
}
