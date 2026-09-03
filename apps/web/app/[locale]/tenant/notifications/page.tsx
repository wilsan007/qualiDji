import { setRequestLocale } from 'next-intl/server'
import { NotificationList } from './notification-list'

export default async function NotificationsPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)

  return <NotificationList />
}
