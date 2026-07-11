import { redirect } from 'next/navigation'

// Employment contract templates moved to the Templates hub.
export default function ContractsMoved() {
  redirect('/templates/contract')
}
