import { createHash } from 'crypto'

/**
 * Règles de dépôt d'un fichier de preuve (spec §6, §7.1).
 * Le serveur n'accepte qu'une liste fermée de types, vérifie la signature
 * (« magic bytes ») des formats binaires courants et ne laisse JAMAIS le
 * client choisir le chemin de stockage. Les formats actifs (HTML, SVG, scripts)
 * sont exclus : une URL signée les servirait comme du contenu exécutable.
 */

export const DEFAULT_MAX_BYTES = 25 * 1024 * 1024

export const ALLOWED_MIME: Record<string, { magic?: (b: Buffer) => boolean; text?: boolean }> = {
  'image/jpeg': { magic: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/png': { magic: (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  'image/gif': { magic: (b) => b.length > 6 && ['GIF87a', 'GIF89a'].includes(b.subarray(0, 6).toString('latin1')) },
  'image/webp': { magic: (b) => b.length > 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
  'application/pdf': { magic: (b) => b.length > 5 && b.subarray(0, 5).toString('latin1') === '%PDF-' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { magic: (b) => b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04 },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { magic: (b) => b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04 },
  'text/plain': { text: true },
  'text/csv': { text: true },
}

export type FileCheck = { ok: true; mime: string } | { ok: false; status: number; code: string; message: string }

/** Type MIME normalisé depuis l'en-tête Content-Type (sans paramètres, minuscules). */
export function normalizeMime(contentType: string | undefined): string {
  return (contentType ?? '').split(';')[0].trim().toLowerCase()
}

export function checkFile(contentType: string | undefined, body: Buffer, maxBytes: number): FileCheck {
  const mime = normalizeMime(contentType)
  const rule = ALLOWED_MIME[mime]
  if (!rule) {
    return { ok: false, status: 415, code: 'ERR_EVIDENCE_TYPE', message: `type non autorisé : ${mime || '(absent)'}` }
  }
  if (body.length === 0) return { ok: false, status: 400, code: 'ERR_EVIDENCE_EMPTY', message: 'fichier vide' }
  if (body.length > maxBytes) {
    return { ok: false, status: 413, code: 'ERR_EVIDENCE_SIZE', message: `fichier trop volumineux (max ${maxBytes} octets)` }
  }
  if (rule.magic && !rule.magic(body)) {
    return { ok: false, status: 422, code: 'ERR_EVIDENCE_CONTENT', message: `le contenu ne correspond pas au type déclaré (${mime})` }
  }
  if (rule.text && body.subarray(0, Math.min(body.length, 4096)).includes(0)) {
    return { ok: false, status: 422, code: 'ERR_EVIDENCE_CONTENT', message: 'contenu binaire déclaré comme texte' }
  }
  return { ok: true, mime }
}

/** Nom de fichier sûr : basename, caractères restreints, longueur bornée. */
export function sanitizeFilename(raw: string | undefined): string {
  const base = String(raw ?? '').split(/[\\/]/).pop() ?? ''
  const cleaned = base
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^[._]+/, '')
    .slice(-120)
  return cleaned || 'fichier'
}

/** Chemin de stockage décidé par le serveur : <tenant>/<action>/<preuve>/<nom>. */
export function buildStoragePath(tenantId: string, actionId: string, evidenceId: string, filename: string): string {
  return `${tenantId}/${actionId}/${evidenceId}/${filename}`
}

export function sha256Hex(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}

export function isSha256Hex(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f]{64}$/i.test(v)
}
