import { redirect } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { TenantSidebar } from '@/components/tenant/sidebar'
import { TenantHeader } from '@/components/tenant/header'

export default async function TenantLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/${locale}/auth/login`)
  }

  const { data: memberships } = await supabase
    .from('memberships')
    .select(`id, role, site_ids, process_ids, tenants(id, name, slug, plan, settings)`)
    .eq('user_id', user.id)

  if (!memberships || memberships.length === 0) {
    redirect(`/${locale}/auth/no-tenant`)
  }

  const membership = memberships[0]
  const tenant = membership.tenants as unknown as {
    id: string
    name: string
    slug: string
    plan: string
    settings: Record<string, unknown>
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return (
    <div className="flex min-h-screen">
      <TenantSidebar tenantName={tenant.name} role={membership.role} />
      <div className="flex flex-1 flex-col">
        <TenantHeader
          userName={profile?.full_name || user.email || ''}
          tenantName={tenant.name}
        />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  )
}
