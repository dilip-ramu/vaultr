// WHOSE CHIT BOOKS AM I IN? SERVER ONLY.
//
// Inex was built for one person: every row carries your user id, and every
// query asks "what belongs to me". Chit staff break that assumption — they sign
// in as themselves and work inside YOUR books. So chit code cannot ask "what is
// mine"; it has to ask "whose books am I working in, and may I write here".
//
// That question is answered here, once, and every chit page and route starts
// with it. The rule is deliberately narrow:
//
//   • The owner is always the owner.
//   • A staff member is granted access to exactly one owner's chit data, by a
//     row in chit_staff that only that owner can create.
//   • Nothing here grants anything outside the chit module. The general ledger
//     keeps its owner-only policies; when a collection has to post income, the
//     route does it with the service role AFTER checking the grant — see
//     ledgerClient below.
//
// If this file says no, the database says no too: the same grant drives the
// chit tables' row-level policies (migration v120). Two independent nets, and
// the app's own answer is the one with the readable error message.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { CAN, forbidden, type ChitRole } from './permissions'

// The permission table lives in ./permissions.ts so it can be tested without a
// request or a database. Re-exported so callers still import one module.
export { CAN, forbidden }
export type { ChitRole }

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ChitAccess {
  /** Whose chit books these are. Every chit query filters on THIS, not on the
   *  signed-in user — they are the same person only when the owner is working. */
  ownerId: string
  /** Who is actually doing it. Recorded where an action deserves an author. */
  actorId: string
  role: ChitRole
  isOwner: boolean
  /** Staff whose first password is still the one the owner typed. */
  mustChangePassword: boolean
  staffName: string | null
}


/**
 * Resolve the caller. Returns null when they are not signed in, or are signed
 * in but have no chit access at all — the two are deliberately indistinguishable
 * to the caller, because a stranger should not learn that an owner exists.
 */
export async function resolveChitAccess(): Promise<ChitAccess | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // A staff grant, if there is one. RLS lets a user read only their own row.
  const { data } = await supabase.from('chit_staff')
    .select('owner_user_id, role, is_active, must_change_password, name')
    .eq('staff_user_id', user.id).eq('is_active', true).limit(1)
  const grant = data?.[0] as any

  if (grant) {
    return {
      ownerId: grant.owner_user_id,
      actorId: user.id,
      role: (grant.role ?? 'viewer') as ChitRole,
      isOwner: false,
      mustChangePassword: grant.must_change_password === true,
      staffName: grant.name ?? null,
    }
  }

  // No grant: they are working in their own books, which is the original and
  // still the common case.
  return {
    ownerId: user.id, actorId: user.id, role: 'owner', isOwner: true,
    mustChangePassword: false, staffName: null,
  }
}

/**
 * A client for writing to the GENERAL LEDGER on the owner's behalf.
 *
 * transactions, categories and accounts keep their owner-only policies — a
 * staff member's own session cannot touch them, and that is the point. A
 * collection still has to post income, so the route does it with the service
 * role, scoped to access.ownerId, only after resolveChitAccess has said yes and
 * the role has been checked.
 *
 * For the owner this returns their ordinary session client, so their own work
 * keeps running under RLS exactly as before. The elevated path exists only for
 * the case that genuinely needs it.
 */
export async function ledgerClient(access: ChitAccess) {
  if (access.isOwner) return createClient()
  return createAdminClient()
}

