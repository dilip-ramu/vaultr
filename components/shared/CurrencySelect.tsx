'use client'

// One currency picker, used everywhere.
//
// Several forms used to carry their own hardcoded shortlist — six codes here,
// five there — so the currency you actually held simply wasn't in the list, with
// nothing on screen to say why. Every picker now offers the SAME full list, with
// the flag and the full name, because "MYR" is not a thing most people can pick
// out of a column of three-letter codes.
//
// The currencies you already track (INR + anything on the Currencies page) float
// to the top, since those are the ones you'll reach for 95% of the time. The rest
// are still right there underneath — nothing is hidden, only ordered.

import { CURRENCIES, getCurrencyMeta } from '@/lib/currencies'

interface Props {
  value: string
  onChange: (code: string) => void
  /** Codes to float into a "Frequently used" group at the top. */
  preferred?: string[]
  /** Leave a currency out entirely (e.g. INR in a *foreign* currency picker). */
  exclude?: string[]
  className?: string
  style?: React.CSSProperties
  id?: string
  disabled?: boolean
  placeholder?: string
}

export const currencyLabel = (code: string) => {
  const m = getCurrencyMeta(code)
  return `${m.flag}  ${m.code} — ${m.name}`
}

export default function CurrencySelect({
  value, onChange, preferred = [], exclude = [],
  className, style, id, disabled, placeholder,
}: Props) {
  const skip = new Set(exclude.map(c => c.toUpperCase()))
  const top = new Set(preferred.map(c => c.toUpperCase()).filter(c => !skip.has(c)))

  const all = CURRENCIES.filter(c => !skip.has(c.code))
  const favourites = all.filter(c => top.has(c.code))
  const rest = all.filter(c => !top.has(c.code))

  // A saved value that isn't in the master list must still show — otherwise
  // opening an old record would silently rewrite its currency to whatever
  // happens to be first in the dropdown.
  const known = new Set(all.map(c => c.code))
  const orphan = value && !known.has(value.toUpperCase()) ? value.toUpperCase() : null

  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
      onChange={e => onChange(e.target.value)}
      className={className ?? 'w-full px-3 py-2.5 rounded-xl text-sm'}
      style={style ?? { border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {orphan && <option value={orphan}>{currencyLabel(orphan)}</option>}

      {favourites.length > 0 && (
        <optgroup label="Frequently used">
          {favourites.map(c => (
            <option key={c.code} value={c.code}>{currencyLabel(c.code)}</option>
          ))}
        </optgroup>
      )}

      <optgroup label={favourites.length > 0 ? 'All currencies' : 'Currencies'}>
        {rest.map(c => (
          <option key={c.code} value={c.code}>{currencyLabel(c.code)}</option>
        ))}
      </optgroup>
    </select>
  )
}
