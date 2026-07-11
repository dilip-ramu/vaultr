import { redirect } from 'next/navigation'

// Templates hub — lands on the first tab.
export default function TemplatesIndex() {
  redirect('/templates/cheque')
}
