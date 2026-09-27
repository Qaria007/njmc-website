import { contentRoute } from '@/lib/page-factory.tsx'

const r = contentRoute('ar', '')
export const dynamicParams = false
export const generateStaticParams = r.generateStaticParams
export const generateMetadata = r.generateMetadata
export default r.Page
