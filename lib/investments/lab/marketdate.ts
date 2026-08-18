// Re-export of the shared India market-date authority so Lab code can import it
// locally. The implementation lives one level up because the macro provider and
// the Phase-1 routes need the same trading-date rules (item 8: ONE authoritative
// approach, not one per module).
export * from '../marketdate'
