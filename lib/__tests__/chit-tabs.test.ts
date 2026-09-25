import { describe, it, expect } from 'vitest'
import { CHIT_TABS, isActiveTab, visibleTabs } from '@/lib/chit/tabs'

describe('which chit tab is lit', () => {
  it('lights Overview only on the chit home page', () => {
    expect(isActiveTab('/chit', '/chit')).toBe(true)
    expect(isActiveTab('/chit', '/chit/groups')).toBe(false)
    expect(isActiveTab('/chit', '/chit/members/abc')).toBe(false)
  })

  it('keeps a tab lit on its own detail pages', () => {
    expect(isActiveTab('/chit/groups', '/chit/groups/7f3a')).toBe(true)
    expect(isActiveTab('/chit/members', '/chit/members/7f3a')).toBe(true)
  })

  it('does not light a tab whose href is merely a prefix of the path', () => {
    // /chit/membership would otherwise light Members.
    expect(isActiveTab('/chit/members', '/chit/membership')).toBe(false)
    expect(isActiveTab('/chit/groups', '/chit/groupsettings')).toBe(false)
  })

  it('lights exactly one tab on every real chit page', () => {
    for (const path of ['/chit', '/chit/groups', '/chit/groups/1', '/chit/members', '/chit/members/1', '/chit/admins']) {
      const lit = CHIT_TABS.filter(t => isActiveTab(t.href, path))
      expect(lit.length).toBe(1)
    }
  })
})

describe('which chit tabs are shown', () => {
  it('shows the owner all four', () => {
    expect(visibleTabs('/chit', true).map(t => t.label))
      .toEqual(['Overview', 'Groups', 'Members', 'Admins'])
  })

  it('never shows Admins to a chit admin', () => {
    for (const path of ['/chit', '/chit/groups', '/chit/members', '/chit/admins']) {
      expect(visibleTabs(path, false).some(t => t.label === 'Admins')).toBe(false)
    }
  })

  it('shows nothing while a first password is being set', () => {
    expect(visibleTabs('/chit/password', true)).toEqual([])
    expect(visibleTabs('/chit/password', false)).toEqual([])
  })
})
