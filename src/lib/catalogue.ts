import config from '@payload-config'
import { getPayload } from 'payload'

import type { Product } from '@/payload-types.ts'

// Public view of the catalogue. overrideAccess: false applies the collection rules as for an
// anonymous visitor: published products only, and the private fields (sources, internal
// notes) are stripped by field access before anything reaches a page.
export type PublicProduct = Pick<Product, 'name' | 'slug' | 'category' | 'productClass' | 'otherNames' | 'cas' | 'ciNumber' | 'grades' | 'updatedAt'>

export const CATEGORY_LABEL: Record<Product['category'], string> = {
  api: 'Active pharmaceutical ingredients',
  excipient: 'Excipients',
  colour: 'Pharmaceutical colours',
}

export const CATEGORY_SINGULAR: Record<Product['category'], string> = {
  api: 'Active pharmaceutical ingredient',
  excipient: 'Excipient',
  colour: 'Pharmaceutical colour',
}

function strip(p: Product): PublicProduct {
  const { name, slug, category, productClass, otherNames, cas, ciNumber, grades, updatedAt } = p
  return { name, slug, category, productClass, otherNames, cas, ciNumber, grades, updatedAt }
}

export async function publishedProducts(): Promise<PublicProduct[]> {
  const payload = await getPayload({ config })
  const res = await payload.find({ collection: 'products', overrideAccess: false, limit: 2000, sort: 'name', depth: 0, pagination: false })
  return res.docs.map(strip)
}

export async function productBySlug(slug: string): Promise<PublicProduct | null> {
  const payload = await getPayload({ config })
  const res = await payload.find({ collection: 'products', overrideAccess: false, where: { slug: { equals: slug } }, limit: 1, depth: 0 })
  return res.docs[0] ? strip(res.docs[0]) : null
}

export function matches(p: PublicProduct, q: string): boolean {
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  return [p.name, p.otherNames, p.cas, p.ciNumber, p.productClass].some((v) => v?.toLowerCase().includes(needle))
}
