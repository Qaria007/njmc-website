import { type NextRequest, NextResponse } from 'next/server'

// "Order desk only" installations (another company using the order software without the NJMC
// website): ORDER_DESK_ONLY=1 sends every public page to the admin. The supplier price pages, the
// client portal and the private document links keep working.
const KEEP = /^\/(admin|api|portal|quote|d|_next)(\/|$)|^\/(favicon|robots\.txt)/

export function proxy(req: NextRequest) {
  if (process.env.ORDER_DESK_ONLY !== '1' || KEEP.test(req.nextUrl.pathname)) return NextResponse.next()
  return NextResponse.redirect(new URL('/admin/', req.url))
}

export const config = { matcher: ['/((?!_next/static|_next/image).*)'] }
