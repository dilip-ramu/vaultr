// When a chit group starts, when it finishes, and whether it is still running.
//
// Neither date is stored. A chit's life is implied by three things it already
// has — the start date, the day of the month it auctions on, and how many
// months it runs — and deriving them is better than storing them, because a
// stored end date goes stale the moment somebody corrects the start.
//
// "Started" means the first auction, and "ends" means the last one. Not the
// date the row was created, and not the month after the final payout: the
// group exists, for the people in it, between the first auction and the last.
//
// Pure, and tested, because the month arithmetic is the part that quietly goes
// wrong — a chit starting on the 31st does not auction on the 31st of February.

import { numberOfMonths, type CommissionModel } from './auction'
import { scheduledAuctionDate } from './messages'

export type GroupPhase = 'upcoming' | 'running' | 'past' | 'undated'

export interface ScheduleInput {
  start_date: string | null
  auction_day: number | null
  members: number
  commission_model: CommissionModel
  status: string
}

export interface GroupSchedule {
  /** The first auction. ISO, or null when the group has no start date yet. */
  firstAuction: string | null
  /** The last auction. */
  lastAuction: string | null
  months: number
  phase: GroupPhase
  /** Auctions that should have happened by `today`, capped at the tenure. */
  monthsElapsed: number
}

export function groupSchedule(g: ScheduleInput, today: string): GroupSchedule {
  const months = numberOfMonths({ members: g.members, model: g.commission_model })
  const firstAuction = scheduledAuctionDate(g.start_date, g.auction_day, 1)
  const lastAuction = scheduledAuctionDate(g.start_date, g.auction_day, months)

  // What the owner says beats what the calendar says. A group marked completed
  // is finished even if its dates run on, and a cancelled one is not running
  // whatever the dates claim.
  if (g.status === 'completed' || g.status === 'cancelled') {
    return { firstAuction, lastAuction, months, phase: 'past', monthsElapsed: months }
  }

  if (!firstAuction || !lastAuction) {
    // No start date: there is nothing to place it on a calendar with. Saying
    // "running" would be a guess, so it gets its own answer.
    return { firstAuction, lastAuction, months, phase: 'undated', monthsElapsed: 0 }
  }

  const phase: GroupPhase =
    today < firstAuction ? 'upcoming'
    : today > lastAuction ? 'past'
    : 'running'

  let monthsElapsed = 0
  for (let m = 1; m <= months; m++) {
    const d = scheduledAuctionDate(g.start_date, g.auction_day, m)
    if (d && d <= today) monthsElapsed = m
    else break
  }

  return { firstAuction, lastAuction, months, phase, monthsElapsed }
}

/** Running and upcoming above, finished below. Undated sits with the living. */
export function isPast(phase: GroupPhase): boolean {
  return phase === 'past'
}
