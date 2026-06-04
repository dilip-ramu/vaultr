'use client'

import dynamic from 'next/dynamic'
import type { CommissionOrder, Customer, Account } from '@/lib/types'

const CommissionClient = dynamic(() => import('./CommissionClient'), { ssr: false })

interface Props {
  initialOrders: CommissionOrder[]
  customers: Customer[]
  accounts: Account[]
}

export default function CommissionWrapper(props: Props) {
  return <CommissionClient {...props} />
}
