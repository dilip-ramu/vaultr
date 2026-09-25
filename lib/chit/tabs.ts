// Which chit tab is the current one.
//
// Pure, and in its own file, so the rule can be tested. Getting it wrong is not
// dangerous, but it is the kind of thing that quietly breaks when a page is
// added: /chit/members/UC00031 must keep Members lit, and /chit must not light
// everything.

export interface ChitTab {
  href: string
  label: string
  /** Hidden from chit admins. The page redirects them anyway. */
  ownerOnly: boolean
}

export const CHIT_TABS: ChitTab[] = [
  { href: '/chit',         label: 'Overview', ownerOnly: false },
  { href: '/chit/groups',  label: 'Groups',   ownerOnly: false },
  { href: '/chit/members', label: 'Members',  ownerOnly: false },
  { href: '/chit/admins',  label: 'Admins',   ownerOnly: true  },
]

/** Overview matches only itself; the rest match their whole subtree. */
export function isActiveTab(href: string, pathname: string): boolean {
  if (href === '/chit') return pathname === '/chit' || pathname === '/chit/'
  return pathname === href || pathname.startsWith(href + '/')
}

/** The tabs to show. One page — the forced password change — shows none. */
export function visibleTabs(pathname: string, isOwner: boolean): ChitTab[] {
  if (pathname.startsWith('/chit/password')) return []
  return CHIT_TABS.filter(t => isOwner || !t.ownerOnly)
}
