import { fixedRoute } from '@/lib/page-factory.tsx'

const r = fixedRoute('ar', 'insights')
export const generateMetadata = r.generateMetadata
export default r.Page
