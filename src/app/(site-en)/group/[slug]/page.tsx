import { contentRoute } from '@/lib/page-factory.tsx'

const r = contentRoute('en', 'group')
export const dynamicParams = false
export const generateStaticParams = r.generateStaticParams
export const generateMetadata = r.generateMetadata
export default r.Page
