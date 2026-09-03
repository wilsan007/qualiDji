import createMiddleware from 'next-intl/middleware'
import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { routing } from '@/i18n/routing'

const intlMiddleware = createMiddleware(routing)

export async function middleware(request: NextRequest) {
  // Run next-intl middleware first to handle locale routing
  const intlResponse = intlMiddleware(request)

  // Then handle Supabase session refresh
  const supabaseResponse = intlResponse || NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(
          cookiesToSet: { name: string; value: string; options: Record<string, unknown> }[],
        ) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname

  // Extract locale from path
  const segments = pathname.split('/')
  const locale =
    segments[1] && routing.locales.includes(segments[1] as never) ? segments[1] : null

  // Protected routes: /{locale}/tenant/*
  const isTenantRoute = pathname.includes('/tenant') && !pathname.includes('/auth')
  const isAuthLoginRoute = pathname.includes('/auth/login')

  if (!user && isTenantRoute) {
    const url = request.nextUrl.clone()
    url.pathname = `/${locale || routing.defaultLocale}/auth/login`
    url.searchParams.set('redirect', pathname)
    return NextResponse.redirect(url)
  }

  // Redirect to tenant dashboard if logged in and on login page
  if (user && isAuthLoginRoute) {
    const url = request.nextUrl.clone()
    url.pathname = `/${locale || routing.defaultLocale}/tenant`
    url.searchParams.delete('redirect')
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
