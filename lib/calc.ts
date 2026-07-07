// Shared amount-calculator helpers (used by the in-app keypad).

export const OP_CHARS = '+-*/'

/** Safely evaluate an amount expression (digits + + − × ÷) with normal
 *  precedence — no eval(). A trailing operator is ignored; ÷0 yields 0.
 *  Result is rounded to paise. */
export function evalExpr(expr: string): number {
  const tokens = expr.match(/(\d+\.?\d*|\.\d+|[+\-*/])/g) ?? []
  while (tokens.length && OP_CHARS.includes(tokens[tokens.length - 1])) tokens.pop()
  if (tokens.length === 0) return 0
  const prec: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2 }
  const out: string[] = []; const ops: string[] = []
  for (const t of tokens) {
    if (t in prec) {
      while (ops.length && prec[ops[ops.length - 1]] >= prec[t]) out.push(ops.pop() as string)
      ops.push(t)
    } else out.push(t)
  }
  while (ops.length) out.push(ops.pop() as string)
  const st: number[] = []
  for (const t of out) {
    if (t in prec) {
      const b = st.pop() ?? 0, a = st.pop() ?? 0
      st.push(t === '+' ? a + b : t === '-' ? a - b : t === '*' ? a * b : (b === 0 ? 0 : a / b))
    } else st.push(parseFloat(t))
  }
  return Math.round((st.pop() ?? 0) * 100) / 100
}

/** True if the expression contains an operator (beyond a leading sign). */
export function hasOperator(expr: string): boolean {
  return /[+\-*/]/.test(expr.slice(1))
}

/** Pretty version of an expression for display (× ÷ − +). */
export function prettyExpr(expr: string): string {
  return expr.replace(/\*/g, ' × ').replace(/\//g, ' ÷ ').replace(/-/g, ' − ').replace(/\+/g, ' + ').trim()
}
