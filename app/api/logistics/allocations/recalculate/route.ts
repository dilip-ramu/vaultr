import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { calculateAWBAllocation } from '@/lib/logistics/calculations'
import type { AllocationInput } from '@/lib/logistics/types'

interface AllocationInputWithId extends AllocationInput {
  id: string
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { awbId, allocations: rawAllocations } = body as {
      awbId: string
      allocations: AllocationInputWithId[]
    }

    if (!awbId) return NextResponse.json({ error: 'awbId required' }, { status: 400 })

    if (!rawAllocations?.length) {
      await supabase
        .from('awbs')
        .update({ per_piece_base_cost: null, allocated_pieces: 0 })
        .eq('id', awbId)
        .eq('user_id', user.id)
      return NextResponse.json({ calc: null })
    }

    const { data: awb, error: awbErr } = await supabase
      .from('awbs')
      .select('id, awb_number, total_charge, total_pieces')
      .eq('id', awbId)
      .eq('user_id', user.id)
      .single()

    if (awbErr || !awb) {
      return NextResponse.json({ error: 'AWB not found' }, { status: 404 })
    }

    const inputs: AllocationInput[] = rawAllocations.map(a => ({
      customerId: a.customerId,
      customerName: a.customerName,
      pieces: a.pieces,
      markupType: a.markupType,
      markupValue: a.markupValue,
      minimumAmount: a.minimumAmount,
      overrideAmount: a.overrideAmount,
    }))

    const calc = calculateAWBAllocation(awb.total_charge, inputs)
    calc.awbId = awb.id
    calc.awbNumber = awb.awb_number

    // Batch update each allocation row with computed values
    await Promise.all(
      rawAllocations.map((raw, i) => {
        const result = calc.allocations[i]
        return supabase
          .from('awb_allocations')
          .update({
            pieces: raw.pieces,
            markup_type: raw.markupType,
            markup_value: raw.markupValue,
            minimum_amount: raw.minimumAmount ?? null,
            override_amount: raw.overrideAmount ?? null,
            base_cost: result.baseCost,
            markup_amount: result.markupAmount,
            billed_amount: result.billedAmount,
          })
          .eq('id', raw.id)
          .eq('user_id', user.id)
      })
    )

    const totalAllocated = rawAllocations.reduce((s, a) => s + a.pieces, 0)
    await supabase
      .from('awbs')
      .update({
        per_piece_base_cost: calc.perPieceBaseCost,
        allocated_pieces: totalAllocated,
      })
      .eq('id', awbId)
      .eq('user_id', user.id)

    return NextResponse.json({ calc })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    )
  }
}
