import { fixedRoute } from '@/lib/page-factory.tsx'

const r = fixedRoute('en', 'group')
export const generateMetadata = r.generateMetadata
export default r.Page
