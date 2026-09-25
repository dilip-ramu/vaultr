import { describe, it, expect } from 'vitest'
import { isPortalPath } from '@/lib/chit/portalPath'

describe('isPortalPath', () => {
  it('claims the portal root and everything under it', () => {
    for (const p of ['/m', '/m/', '/m/pin', '/m/closed', '/m/health', '/m/g/abc-123']) {
      expect(isPortalPath(p)).toBe(true)
    }
  })

  it('does not claim app paths that merely start with the letter m', () => {
    for (const p of ['/members', '/m-portal', '/money', '/chit/members', '/mx/1', '/', '/login']) {
      expect(isPortalPath(p)).toBe(false)
    }
  })
})
