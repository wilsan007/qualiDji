'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  LayoutDashboard,
  FileText,
  CheckSquare,
  AlertTriangle,
  Users,
  Settings,
  ShieldCheck,
  BookOpen,
  Factory,
  ClipboardCheck,
  ExternalLink,
  Stethoscope,
  Gauge,
  ListChecks,
  Bell,
  ShieldAlert,
  Clock,
  Target,
  GitBranch,
  Wrench,
  ClipboardList,
  GraduationCap,
  Sparkles,
  FlaskConical,
  Package,
  Boxes,
  AlertTriangle as DeviationIcon,
  Sparkles as HygieneIcon,
  ShieldCheck as PrpIcon,
  CreditCard,
  Key,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export function TenantSidebar({
  tenantName,
  role,
}: {
  tenantName: string
  role: string
}) {
  const pathname = usePathname()
  const t = useTranslations('Nav')

  const navItems = [
    { href: '/tenant', label: t('dashboard'), icon: LayoutDashboard },
    { href: '/tenant/diagnostic', label: t('diagnostic'), icon: Stethoscope },
    { href: '/tenant/compliance', label: t('compliance'), icon: Gauge },
    { href: '/tenant/requirements', label: t('requirements'), icon: ListChecks },
    { href: '/tenant/tasks', label: t('tasks'), icon: CheckSquare },
    { href: '/tenant/documents', label: t('documents'), icon: FileText },
    { href: '/tenant/audits', label: t('audits'), icon: ClipboardCheck },
    { href: '/tenant/nonconformities', label: t('nonconformities'), icon: AlertTriangle },
    { href: '/tenant/risks', label: t('risks'), icon: ShieldAlert },
    { href: '/tenant/processes', label: t('processes'), icon: GitBranch },
    { href: '/tenant/objectives', label: t('objectives'), icon: Target },
    { href: '/tenant/anomalies', label: t('anomalies'), icon: ShieldAlert },
    { href: '/tenant/expirations', label: t('expirations'), icon: Clock },
    { href: '/tenant/training', label: t('training'), icon: GraduationCap },
    { href: '/tenant/suppliers', label: t('suppliers'), icon: Factory },
    { href: '/tenant/equipment', label: t('equipment'), icon: Wrench },
    { href: '/tenant/management-review', label: t('managementReview'), icon: ClipboardList },
    { href: '/tenant/prp', label: t('prp'), icon: PrpIcon },
    { href: '/tenant/haccp', label: t('haccp'), icon: FlaskConical },
    { href: '/tenant/products', label: t('products'), icon: Package },
    { href: '/tenant/traceability', label: t('traceability'), icon: Boxes },
    { href: '/tenant/deviations', label: t('deviations'), icon: DeviationIcon },
    { href: '/tenant/hygiene', label: t('hygiene'), icon: HygieneIcon },
    { href: '/tenant/learning', label: t('learning'), icon: GraduationCap },
    { href: '/tenant/assistant', label: t('assistant'), icon: Sparkles },
    { href: '/tenant/external-audit', label: t('externalAudit'), icon: ExternalLink },
    { href: '/tenant/billing', label: t('billing'), icon: CreditCard },
    { href: '/tenant/api-keys', label: t('apiKeys'), icon: Key },
    { href: '/tenant/notifications', label: t('notifications'), icon: Bell },
    { href: '/tenant/team', label: t('team'), icon: Users },
    { href: '/tenant/settings', label: t('settings'), icon: Settings },
  ]

  return (
    <aside className="hidden w-64 flex-col border-r bg-card md:flex">
      <div className="flex h-16 items-center gap-2 border-b px-6">
        <ShieldCheck className="h-6 w-6 text-primary" />
        <span className="font-bold">{tenantName}</span>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {navItems.map((item) => {
          const isActive =
            item.href === '/tenant'
              ? pathname.endsWith('/tenant')
              : pathname.includes(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          )
        })}
        {role === 'tenant_admin' || role === 'quality_manager' ? (
          <Link
            href="/tenant/external-auditor"
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ExternalLink className="h-4 w-4" />
            {t('externalAuditor')}
          </Link>
        ) : null}
      </nav>
    </aside>
  )
}
