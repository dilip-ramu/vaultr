// The three ways an invoice gets made.
//
// This replaces a tab bar where the tabs did not match the work — one tab was
// a queue of expenses that were not invoices, another was a list, and making a
// reimbursement invoice meant visiting three screens with no thread between
// them. The rules below are what keep the replacement from becoming a wizard
// that holds somebody hostage.

import { describe, it, expect } from 'vitest'
import {
  FLOWS, FLOW_ORDER, isFlowId, firstStep, resolveStep, stepIndex,
  nextStep, prevStep, backHref, stepHref, reachableSteps, canGoTo, progressWords,
} from '@/lib/customers/invoiceFlows'

describe('the choices on offer', () => {
  it('offers exactly the three kinds of invoice that get made', () => {
    expect(FLOW_ORDER).toEqual(['courier', 'reimbursable', 'direct'])
  })

  it('says which one can mix courier, expense and typed lines', () => {
    // Picking wrong and getting stranded is most of what was wrong before.
    expect(FLOWS.reimbursable.blurb.toLowerCase()).toContain('courier')
    expect(FLOWS.reimbursable.when.toLowerCase()).toContain('mix everything')
  })

  it('says the courier invoice does NOT mix', () => {
    expect(FLOWS.courier.when.toLowerCase()).toContain('nothing else')
  })

  it('every flow ends at an invoice, not at a list or a queue', () => {
    for (const id of FLOW_ORDER) {
      const steps = FLOWS[id].steps
      expect(steps[steps.length - 1].key, id).toBe('build')
    }
  })

  it('recognises only real flows', () => {
    expect(isFlowId('courier')).toBe(true)
    expect(isFlowId('list')).toBe(false)
    expect(isFlowId(null)).toBe(false)
  })
})

describe('where a flow opens', () => {
  it('starts at its first step', () => {
    expect(firstStep('courier')).toBe('import')
    expect(firstStep('reimbursable')).toBe('sort')
    expect(firstStep('direct')).toBe('build')
  })

  it('falls back to the first step when the URL asks for nonsense', () => {
    // A stale bookmark must land somewhere usable, not on a blank screen.
    expect(resolveStep('courier', 'banana')).toBe('import')
    expect(resolveStep('courier', null)).toBe('import')
    expect(resolveStep('courier', 'build')).toBe('build')
  })
})

describe('going back', () => {
  it('goes to the previous step', () => {
    expect(prevStep('reimbursable', 'build')).toBe('sort')
  })

  it('leaves the flow at the first step instead of doing nothing', () => {
    // A dead Back button at the top of a wizard is how somebody gets stuck in
    // a flow they picked by mistake.
    expect(backHref('reimbursable', 'sort')).toBe('/customers/invoices')
    expect(backHref('direct', 'build')).toBe('/customers/invoices')
  })

  it('keeps the customer when stepping back, so nothing has to be re-picked', () => {
    expect(backHref('reimbursable', 'build', { customer: 'c1' }))
      .toBe('/customers/invoices/reimbursable?customer=c1')
  })
})

describe('the step URLs', () => {
  it('leaves ?step off the first step, so the flow has a short address', () => {
    expect(stepHref('courier', 'import')).toBe('/customers/invoices/courier')
  })

  it('names later steps explicitly', () => {
    expect(stepHref('courier', 'build')).toBe('/customers/invoices/courier?step=build')
  })

  it('carries context and drops empties', () => {
    expect(stepHref('courier', 'build', { customer: 'Acme', batch: '', step: '' }))
      .toBe('/customers/invoices/courier?customer=Acme&step=build')
  })
})

describe('which steps you may jump to', () => {
  it('always lets you go back to anything already reached', () => {
    expect(reachableSteps('courier', 'build')).toContain('import')
  })

  it('lets you move one step forward', () => {
    expect(canGoTo('courier', 'import', 'build')).toBe(true)
  })

  it('lets you step over a skippable step', () => {
    // One CSV is billed to several customers; the second invoice must not
    // demand the file again.
    expect(canGoTo('courier', 'import', 'build')).toBe(true)
    expect(FLOWS.courier.steps[0].skippable).toBe(true)
  })

  it('never leaves you on a step with no way out', () => {
    for (const id of FLOW_ORDER) {
      for (const s of FLOWS[id].steps) {
        expect(reachableSteps(id, s.key).length, `${id}/${s.key}`).toBeGreaterThan(0)
      }
    }
  })

  it('copes with a step name that is not in the flow', () => {
    expect(reachableSteps('direct', 'nonsense')).toEqual(['build'])
  })
})

describe('how far through you are', () => {
  it('counts the steps for a flow that has more than one', () => {
    expect(progressWords('reimbursable', 'sort')).toBe('Step 1 of 2')
    expect(progressWords('reimbursable', 'build')).toBe('Step 2 of 2')
  })

  it('says nothing for a single-step flow, rather than "Step 1 of 1"', () => {
    expect(progressWords('direct', 'build')).toBe('')
  })
})
