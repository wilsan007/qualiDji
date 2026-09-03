import { setRequestLocale } from 'next-intl/server'
import { InviteContent } from './invite-content'

export default async function InvitePage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>
}) {
  const { locale, token } = await params
  setRequestLocale(locale)

  return <InviteContent token={token} />
}
