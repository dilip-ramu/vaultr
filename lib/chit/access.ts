// WHOSE CHIT BOOKS AM I IN? SERVER ONLY.
//
// Inex was built for one person: every row carries your user id, and every
// query asks "what belongs to me". Chit admins break that assumption — they sign
// in as themselves and work inside YOUR books. So chit code cannot ask "what is
// mine"; it has to ask "whose books am I working in, and may I write here".
//
// That question is answered here, once, and every chit page and route starts
// with it. The rule is deliberately narrow:
//
//   • The owner is always the owner.
//   • An admin is granted access to exactly one owner's chit data, by a
//     row in chit_admins that only that owner can create.
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
  /** An admin whose first password is still the one the owner typed. */
  mustChangePassword: boolean
  adminName: string | null
  /**
   * Who to write against anything this person records.
   *
   * Copied onto the row at the time, not looked up later: when an admin's
   * access is removed a year from now, the collections they took must still
   * say they took them.
   */
  actorName: string
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

  // An admin grant, if there is one. RLS lets a user read only their own row.
  const { data } = await supabase.from('chit_admins')
    .select('owner_user_id, role, is_active, must_change_password, name, email')
    .eq('admin_user_id', user.id).eq('is_active', true).limit(1)
  const grant = data?.[0] as any

  if (grant) {
    return {
      ownerId: grant.owner_user_id,
      actorId: user.id,
      role: (grant.role ?? 'viewer') as ChitRole,
      isOwner: false,
      mustChangePassword: grant.must_change_password === true,
      adminName: grant.name ?? null,
      actorName: (grant.name ?? '').trim() || grant.email || 'An admin',
    }
  }

  // No grant: they are working in their own books, which is the original and
  // still the common case.
  // The owner's own name, so their rows read like a person rather than "Owner".
  const { data: profile } = await supabase.from('profiles')
    .select('full_name, nickname').eq('id', user.id).maybeSingle()
  const p = profile as { full_name?: string | null; nickname?: string | null } | null

  return {
    ownerId: user.id, actorId: user.id, role: 'owner', isOwner: true,
    mustChangePassword: false, adminName: null,
    actorName: (p?.nickname || p?.full_name || '').trim()
      || user.email?.split('@')[0]
      || 'Owner',
  }
}

/**
 * A client for writing to the GENERAL LEDGER on the owner's behalf.
 *
 * transactions, categories and accounts keep their owner-only policies — a
 * admin's own session cannot touch them, and that is the point. A
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

