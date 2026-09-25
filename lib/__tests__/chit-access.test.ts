// Who may do what inside someone else's chit books.
//
// This is the first time Inex has had more than one person in it. Every table
// was built on "a row is yours because your id is on it", so the rules below
// are the only thing standing between a chit collector and a payroll run —
// together with the database policies in v120, which enforce the same grant
// independently.
//
// The permission table is pure, so it can be tested exhaustively. That matters
// more than usual: a role check that is wrong in one direction is an annoyance,
// and wrong in the other is a stranger in your ledger.

import { describe, it, expect } from 'vitest'
import { CAN, forbidden, type ChitRole } from '@/lib/chit/permissions'

const ROLES: ChitRole[] = ['owner', 'manager', 'collector', 'viewer']

describe('what each role may do', () => {
  it('lets everyone read — that is the point of the grant', () => {
    for (const r of ROLES) expect(CAN.read(r)).toBe(true)
  })

  it('lets the owner do everything', () => {
    for (const can of Object.values(CAN)) expect(can('owner')).toBe(true)
  })

  it('lets a manager run the chit day to day', () => {
    expect(CAN.recordCollection('manager')).toBe(true)
    expect(CAN.manageMembers('manager')).toBe(true)
    expect(CAN.runAuction('manager')).toBe(true)
    expect(CAN.manageGroups('manager')).toBe(true)
  })

  it('stops a manager destroying a group or rewriting its terms', () => {
    // Deleting a group takes its auctions and collections with it; changing the
    // pot after money has moved rewrites what every past month meant.
    expect(CAN.deleteGroup('manager')).toBe(false)
    expect(CAN.changeChitTerms('manager')).toBe(false)
  })

  it('limits a collector to taking payments', () => {
    expect(CAN.recordCollection('collector')).toBe(true)
    expect(CAN.manageMembers('collector')).toBe(false)
    expect(CAN.runAuction('collector')).toBe(false)
    expect(CAN.manageGroups('collector')).toBe(false)
    expect(CAN.deleteGroup('collector')).toBe(false)
  })

  it('lets a viewer change nothing at all', () => {
    for (const [name, can] of Object.entries(CAN)) {
      if (name === 'read') continue
      expect(can('viewer')).toBe(false)
    }
  })

  it('never lets staff of any kind manage other staff', () => {
    // Otherwise a manager could promote themselves, or add their own second
    // account, and the grant would no longer be the owner's decision.
    for (const r of ROLES) {
      expect(CAN.manageStaff(r)).toBe(r === 'owner')
    }
  })

  it('never lets staff of any kind delete a group', () => {
    for (const r of ROLES) expect(CAN.deleteGroup(r)).toBe(r === 'owner')
  })

  it('has no permission that a collector holds but a manager does not', () => {
    // A guard against the table drifting into nonsense as it grows.
    for (const can of Object.values(CAN)) {
      if (can('collector')) expect(can('manager')).toBe(true)
    }
  })

  it('has no permission that a viewer holds but a collector does not', () => {
    for (const can of Object.values(CAN)) {
      if (can('viewer')) expect(can('collector')).toBe(true)
    }
  })
})

describe('the refusal message', () => {
  it('tells staff who to ask', () => {
    expect(forbidden('conduct auctions', 'collector')).toContain('account owner')
    expect(forbidden('conduct auctions', 'collector')).toContain('conduct auctions')
  })

  it('does not tell the owner to ask themselves', () => {
    expect(forbidden('delete a chit group', 'owner')).not.toContain('owner')
  })
})
