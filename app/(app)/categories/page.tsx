import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/** Categories index moved into Setup. /categories/[id] still resolves
 *  (category detail page) — only the index is a redirect. */
export default function CategoriesRedirect() {
  redirect('/setup/categories')
}
