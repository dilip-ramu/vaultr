// Connecting a spreadsheet's columns to our fields. The old importer guessed
// in secret and dropped what it could not match; these are the rules that
// replaced it.

import { describe, it, expect } from 'vitest'
import {
  detectHeaderRow, bestSheet, headerLabels, columnLetter, guessMapping,
  sampleValues, missingRequired, applyMapping, tally, cellToText,
} from '@/lib/chit/importSheet'

const SHEET = [
  ['Member Number', 'Name', 'Phone', 'Address'],
  ['UC00001', 'Suresh Balan', '9876543210', '12 Kongu Nagar'],
  ['UC00002', 'Meena R', '9876500000', ''],
]

describe('finding the header row', () => {
  it('uses the first row when that is where the headers are', () => {
    expect(detectHeaderRow(SHEET)).toBe(0)
  })

  it('looks past a title and a blank line, which is how people make sheets', () => {
    const withTitle = [
      ['UNYRA CAPITAL — MEMBER LIST'],
      [],
      ['Member Number', 'Name', 'Phone'],
      ['UC00001', 'Suresh Balan', '9876543210'],
    ]
    expect(detectHeaderRow(withTitle)).toBe(2)
  })

  it('picks the row that matches the most known columns', () => {
    const odd = [
      ['Name'],                                   // one match
      ['Member Number', 'Name', 'Phone', 'PAN'],  // four
    ]
    expect(detectHeaderRow(odd)).toBe(1)
  })

  it('falls back to the first row with real content when nothing matches', () => {
    expect(detectHeaderRow([[], [''], ['Col1', 'Col2'], ['a', 'b']])).toBe(2)
  })

  it('does not fall over on an empty sheet', () => {
    expect(detectHeaderRow([])).toBe(0)
  })
})

describe('naming the columns', () => {
  it('uses the header text', () => {
    expect(headerLabels(SHEET, 0)).toEqual(['Member Number', 'Name', 'Phone', 'Address'])
  })

  it('names a blank header by its spreadsheet letter rather than showing nothing', () => {
    expect(headerLabels([['Name', '', 'Phone']], 0)).toEqual(['Name', 'Column B', 'Phone'])
  })

  it('covers columns that only the data rows reach', () => {
    expect(headerLabels([['Name'], ['Suresh', 'extra']], 0)).toEqual(['Name', 'Column B'])
  })

  it('counts columns the way a spreadsheet does', () => {
    expect(columnLetter(0)).toBe('A')
    expect(columnLetter(25)).toBe('Z')
    expect(columnLetter(26)).toBe('AA')
    expect(columnLetter(27)).toBe('AB')
  })
})

describe('the opening guess', () => {
  it('matches the obvious headers', () => {
    const m = guessMapping(['Member Number', 'Name', 'Phone', 'Address'])
    expect(m.member_code).toBe(0)
    expect(m.name).toBe(1)
    expect(m.phone).toBe(2)
    expect(m.address).toBe(3)
  })

  it('ignores case, spacing and punctuation', () => {
    const m = guessMapping(['  MEMBER_NO ', 'full name', 'Mobile'])
    expect(m.member_code).toBe(0)
    expect(m.name).toBe(1)
    expect(m.phone).toBe(2)
  })

  it('matches a header that merely contains a known spelling', () => {
    const m = guessMapping(['Mobile No.', 'Member Name'])
    expect(m.phone).toBe(0)
    expect(m.name).toBe(1)
  })

  it('does not let Name steal the Account Name column', () => {
    // The bug this rule exists for: a loose "contains name" match would give
    // "Account Name" to `name`, and the member list would fill with bank
    // account holders.
    const m = guessMapping(['Account Name', 'Name'])
    expect(m.bank_account_name).toBe(0)
    expect(m.name).toBe(1)
  })

  it('never gives one file column to two fields', () => {
    const m = guessMapping(['Name'])
    const used = Object.values(m).filter(v => v !== null)
    expect(new Set(used).size).toBe(used.length)
  })

  it('leaves what it cannot place unmapped rather than guessing wildly', () => {
    const m = guessMapping(['Serial', 'Name', 'Something Else'])
    expect(m.name).toBe(1)
    expect(m.pan).toBe(null)
  })

  it('maps nothing at all on a sheet with no usable headers', () => {
    const m = guessMapping(['', '', ''])
    expect(Object.values(m).every(v => v === null)).toBe(true)
  })
})

describe('showing what a column holds', () => {
  it('gives a few real values so the mapping can be checked by eye', () => {
    expect(sampleValues(SHEET, 0, 1)).toEqual(['Suresh Balan', 'Meena R'])
  })

  it('skips the blanks', () => {
    expect(sampleValues(SHEET, 0, 3)).toEqual(['12 Kongu Nagar'])
  })

  it('has nothing to show for a column that is not mapped', () => {
    expect(sampleValues(SHEET, 0, null)).toEqual([])
  })
})

describe('what must be mapped', () => {
  it('only insists on the name', () => {
    expect(missingRequired(guessMapping(['Name']))).toEqual([])
  })

  it('says so, in the words on screen, when the name is missing', () => {
    expect(missingRequired(guessMapping(['Phone']))).toEqual(['Name'])
  })
})

describe('reading the rows', () => {
  const mapping = guessMapping(SHEET[0])

  it('pulls the mapped columns out', () => {
    const rows = applyMapping(SHEET, 0, mapping)
    expect(rows).toHaveLength(2)
    expect(rows[0].values).toEqual({ member_code: 'UC00001', name: 'Suresh Balan', phone: '9876543210', address: '12 Kongu Nagar' })
  })

  it('numbers rows the way the spreadsheet does, so a problem can be found', () => {
    const withTitle = [['TITLE'], [], ['Name'], ['Suresh'], ['Meena']]
    const rows = applyMapping(withTitle, 2, guessMapping(['Name']))
    expect(rows.map(r => r.row)).toEqual([4, 5])
  })

  it('leaves a missing optional value out instead of writing an empty string', () => {
    const rows = applyMapping(SHEET, 0, mapping)
    expect('address' in rows[1].values).toBe(false)
  })

  it('skips a spacer row rather than reporting it as broken', () => {
    const withGap = [['Name', 'Phone'], ['Suresh', '1'], ['', ''], ['Meena', '2']]
    const rows = applyMapping(withGap, 0, guessMapping(['Name', 'Phone']))
    expect(rows.map(r => r.values.name)).toEqual(['Suresh', 'Meena'])
  })

  it('flags a row that has data but no name', () => {
    const noName = [['Name', 'Phone'], ['', '9876543210']]
    const rows = applyMapping(noName, 0, guessMapping(['Name', 'Phone']))
    expect(rows[0].error).toBe('No name in this row')
  })

  it('ignores a field the user set to Do not import', () => {
    const rows = applyMapping(SHEET, 0, { ...mapping, phone: null })
    expect('phone' in rows[0].values).toBe(false)
  })

  it('trims what the spreadsheet carried', () => {
    const padded = [['Name'], ['  Suresh Balan  ']]
    expect(applyMapping(padded, 0, { name: 0 })[0].values.name).toBe('Suresh Balan')
  })
})

describe('the counts on the review step', () => {
  it('separates the rows that will go in from the ones that will not', () => {
    const rows = applyMapping([['Name', 'Phone'], ['Suresh', '1'], ['', '2']], 0, { name: 0, phone: 1 })
    expect(tally(rows)).toEqual({ total: 2, ready: 1, problems: 1 })
  })

  it('counts an empty file as nothing rather than failing', () => {
    expect(tally([])).toEqual({ total: 0, ready: 0, problems: 0 })
  })
})

describe('which sheet of a workbook to open', () => {
  const cover = [['(cover sheet)']]
  const members = [
    ['UNYRA CAPITAL — MEMBER LIST'],
    [],
    ['S.No', 'Member No', 'Member Name', 'Mobile No.'],
    ['1', 'UC00001', 'Suresh Balan', '9876543210'],
  ]

  it('skips a cover sheet and opens on the list', () => {
    // The bug this exists for: "first sheet with anything in it" opened the
    // cover, and the mapping screen then had no columns to offer.
    expect(bestSheet([cover, members])).toBe(1)
  })

  it('opens on the only sheet when there is one', () => {
    expect(bestSheet([members])).toBe(0)
  })

  it('prefers the sheet that looks most like a member list', () => {
    const thin = [['Name']]
    expect(bestSheet([thin, members])).toBe(1)
  })

  it('takes the earlier sheet when two look the same', () => {
    expect(bestSheet([members, members])).toBe(0)
  })

  it('falls back to the first sheet with real content when none look like a list', () => {
    expect(bestSheet([[['x']], [['a', 'b'], ['c', 'd']]])).toBe(1)
  })

  it('does not fall over on an empty workbook', () => {
    expect(bestSheet([])).toBe(0)
  })
})

describe('reading one cell', () => {
  it('writes a long account number in full, not in exponent notation', () => {
    // The bug: asking the spreadsheet for its displayed text gave
    // "5.01001E+13" for this, and that is what got imported.
    expect(cellToText(50100123456789)).toBe('50100123456789')
  })

  it('leaves a phone number alone', () => {
    expect(cellToText(9876543210)).toBe('9876543210')
  })

  it('keeps the decimals on a number that has them', () => {
    expect(cellToText(1234.56)).toBe('1234.56')
  })

  it('writes a date the way the rest of the app does', () => {
    expect(cellToText(new Date(2026, 7, 18))).toBe('2026-08-18')
  })

  it('turns an empty cell into an empty string, not "null"', () => {
    expect(cellToText(null)).toBe('')
    expect(cellToText(undefined)).toBe('')
  })

  it('says Yes and No rather than true and false', () => {
    expect(cellToText(true)).toBe('Yes')
    expect(cellToText(false)).toBe('No')
  })

  it('passes text straight through', () => {
    expect(cellToText('UC00001')).toBe('UC00001')
  })

  it('does not write Infinity into a member record', () => {
    expect(cellToText(Infinity)).toBe('')
    expect(cellToText(NaN)).toBe('')
  })
})
