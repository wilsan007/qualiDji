/**
 * Tests unitaires — règles de dépôt d'un fichier de preuve (C3).
 * Exécution : npm run test:evidence
 */
import { checkFile, sanitizeFilename, buildStoragePath, sha256Hex, isSha256Hex, normalizeMime } from '../src/lib/evidenceFile'

let passed = 0
let failed = 0
function assert(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`) } else { failed++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const MAX = 1024
const pdf = Buffer.from('%PDF-1.7\n% test')
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(20)])
const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0])
const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')])
const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0])
const st = (r: ReturnType<typeof checkFile>) => (r.ok ? 'OK' : `${r.status}:${r.code}`)

console.log('— types et signatures —')
assert('PDF valide', st(checkFile('application/pdf', pdf, MAX)) === 'OK')
assert('PNG / JPEG / WebP / DOCX valides', ['image/png', 'image/jpeg', 'image/webp', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].every((m, i) => st(checkFile(m, [png, jpg, webp, zip][i], MAX)) === 'OK'))
assert('paramètres du Content-Type ignorés', st(checkFile('Application/PDF; charset=binary', pdf, MAX)) === 'OK' && normalizeMime('Text/CSV; charset=utf-8') === 'text/csv')
assert('HTML refusé (415)', st(checkFile('text/html', Buffer.from('<script>1</script>'), MAX)) === '415:ERR_EVIDENCE_TYPE')
assert('SVG refusé (contenu actif)', st(checkFile('image/svg+xml', Buffer.from('<svg/>'), MAX)) === '415:ERR_EVIDENCE_TYPE')
assert('exécutable / octet-stream refusés', st(checkFile('application/octet-stream', Buffer.from('MZ'), MAX)) === '415:ERR_EVIDENCE_TYPE' && st(checkFile(undefined, pdf, MAX)) === '415:ERR_EVIDENCE_TYPE')
assert('PDF déclaré mais contenu texte → 422', st(checkFile('application/pdf', Buffer.from('hello world'), MAX)) === '422:ERR_EVIDENCE_CONTENT')
assert('JPEG déclaré, contenu PNG → 422', st(checkFile('image/jpeg', png, MAX)) === '422:ERR_EVIDENCE_CONTENT')
assert('texte avec octet nul → 422', st(checkFile('text/plain', Buffer.from([0x61, 0x00, 0x62]), MAX)) === '422:ERR_EVIDENCE_CONTENT')
assert('texte et CSV valides', st(checkFile('text/plain', Buffer.from('relevé 21 °C'), MAX)) === 'OK' && st(checkFile('text/csv', Buffer.from('a,b\n1,2'), MAX)) === 'OK')
console.log('— taille —')
assert('fichier vide → 400', st(checkFile('application/pdf', Buffer.alloc(0), MAX)) === '400:ERR_EVIDENCE_EMPTY')
assert('trop gros → 413', st(checkFile('text/plain', Buffer.alloc(MAX + 1, 0x61), MAX)) === '413:ERR_EVIDENCE_SIZE')
assert('exactement la limite → OK', st(checkFile('text/plain', Buffer.alloc(MAX, 0x61), MAX)) === 'OK')
console.log('— nom et chemin —')
assert('traversée de répertoire neutralisée', sanitizeFilename('../../etc/passwd') === 'passwd' && sanitizeFilename('C:\\Users\\a\\rapport.pdf') === 'rapport.pdf')
assert('caractères spéciaux et accents', sanitizeFilename('relevé température (1).pdf') === 'releve_temperature_1_.pdf')
assert('fichiers cachés / vides / trop longs', sanitizeFilename('.htaccess') === 'htaccess' && sanitizeFilename('') === 'fichier' && sanitizeFilename(undefined) === 'fichier' && sanitizeFilename('a'.repeat(300) + '.pdf').length <= 120)
assert('chemin = tenant/action/preuve/nom, jamais fourni par le client', buildStoragePath('t', 'a', 'e', 'f.pdf') === 't/a/e/f.pdf')
console.log('— empreinte —')
assert('SHA-256 connu', sha256Hex(Buffer.from('abc')) === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
assert('format hexadécimal 64 attendu', isSha256Hex('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad') && !isSha256Hex('deadbeef') && !isSha256Hex(42))

console.log(`\nRésultat preuves : ${passed} réussis, ${failed} échec(s).`)
if (failed > 0) process.exit(1)
