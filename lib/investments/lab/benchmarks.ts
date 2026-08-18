// Benchmark accounting (brief §9). A hypothetical ₹10L invested in the index on
// the Lab's start date, marked to the index level. Price return (dividends
// excluded) — a documented, conservative assumption, and consistent because
// Nifty 50 / Nifty 500 are price indices. Null when a level is missing (never
// faked).

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export function benchmarkValue(startLevel: number | null, currentLevel: number | null, startingCapital: number): number | null {
  if (startLevel == null || currentLevel == null || startLevel <= 0) return null
  return round2(startingCapital * (currentLevel / startLevel))
}

/** Total return % of a benchmark between two levels. Null if not computable. */
export function benchmarkReturnPct(startLevel: number | null, currentLevel: number | null): number | null {
  if (startLevel == null || currentLevel == null || startLevel <= 0) return null
  return round2(((currentLevel - startLevel) / startLevel) * 100)
}
