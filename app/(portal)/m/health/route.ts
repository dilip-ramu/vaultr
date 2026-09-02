// A public, read-only self-check for the member portal.
//
// It exists because "the link goes to the login page" is a symptom with several
// possible causes, and asking a person to reproduce each one is a poor use of
// their evening. Opening this URL answers all of them at once:
//
//   • Does this deployment contain the portal at all? (If you get a 404 or the
//     login page instead of JSON, it does not — the build is older than the
//     portal, or it failed.)
//   • Is SUPABASE_SERVICE_ROLE_KEY configured? Without it no portal page can
//     read anything.
//   • Do the v115/v116 tables exist?
//   • What address does the server think it is serving from? A link is built
//     from this, so if it says localhost, that is the bug.
//
// It reveals NO member data: counts and booleans only, never a name, a number,
// a token or a hash.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
  const proto = req.headers.get('x-forwarded-proto') ?? 'https'

  const out: Record<string, unknown> = {
    portalDeployed: true,
    servingFrom: host ? `${proto}://${host}` : null,
    nextUrlOrigin: req.nextUrl.origin,
    siteUrlEnv: process.env.NEXT_PUBLIC_SITE_URL ?? null,
    serviceRoleKeySet: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    supabaseUrlSet: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    tables: {} as Record<string, string>,
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    out.verdict = 'SUPABASE_SERVICE_ROLE_KEY is not set on this deployment. No portal page can work until it is.'
    return NextResponse.json(out)
  }

  try {
    const db = createAdminClient()
    for (const table of ['chit_members', 'chit_portal_invites', 'chit_portal_sessions', 'chit_member_pins', 'chit_bid_windows', 'chit_bids']) {
      const { error } = await db.from(table).select('id').limit(1)
      ;(out.tables as Record<string, string>)[table] = error ? `ERROR: ${error.message}` : 'ok'
    }
    const bad = Object.values(out.tables as Record<string, string>).filter(v => v !== 'ok')
    out.verdict = bad.length
      ? 'The portal is deployed but some tables are missing — run the migrations.'
      : 'The portal is deployed and can reach its tables. If a link still fails, compare the address in the link with "servingFrom" above.'
  } catch (e) {
    out.verdict = `Could not reach the database: ${e instanceof Error ? e.message : String(e)}`
  }

  return NextResponse.json(out)
}
