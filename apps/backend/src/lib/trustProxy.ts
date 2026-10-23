/**
 * Configuration « trust proxy » d'Express depuis la variable TRUST_PROXY.
 *
 * Derrière un reverse proxy (nginx, Cloudflare…) `req.ip` vaut l'adresse du proxy :
 * tous les utilisateurs partageraient alors le même quota de limitation de débit.
 * À l'inverse, faire confiance à X-Forwarded-For sans proxy permet à n'importe qui
 * d'usurper son IP et de contourner la limite. On n'accepte donc que des valeurs
 * explicites ; `true` (confiance totale) est refusé.
 *
 *   (vide)                       → false : aucun proxy, req.ip = adresse TCP
 *   "1", "2"…                    → nombre de proxys de confiance devant le backend
 *   "loopback", "linklocal", "uniquelocal" ou liste CSV d'IP/CIDR → plages de confiance
 */
export type TrustProxySetting = false | number | string

const KEYWORDS = new Set(['loopback', 'linklocal', 'uniquelocal'])
const ADDR = /^[0-9a-fA-F:.]+(\/\d{1,3})?$/

export function parseTrustProxy(raw: string | undefined): TrustProxySetting {
  const v = (raw ?? '').trim()
  if (v === '' || v === 'false' || v === '0') return false
  if (/^\d+$/.test(v)) {
    const n = Number(v)
    if (n > 10) throw new Error(`TRUST_PROXY=${v} : nombre de proxys invraisemblable (max 10)`)
    return n
  }
  if (v === 'true') {
    throw new Error("TRUST_PROXY=true refusé : confiance totale dans X-Forwarded-For (usurpation d'IP). Indiquez le nombre de proxys (ex. 1) ou leurs adresses.")
  }
  const parts = v.split(',').map((p) => p.trim()).filter(Boolean)
  if (parts.every((p) => KEYWORDS.has(p) || ADDR.test(p))) return parts.join(',')
  throw new Error(`TRUST_PROXY=${v} invalide : attendu un entier, loopback/linklocal/uniquelocal ou des IP/CIDR séparées par des virgules`)
}
