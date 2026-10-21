import { describe, it, expect } from 'vitest'
import {
  statusLabel,
  statusBadge,
  ncStatusBadge,
  severityBadge,
  severityLabel,
  roleLabel,
  spaceForRole,
  spaceBadge,
  spaceLabel,
  gapStatusLabel,
  gapStatusBadge,
  formatDate,
  formatDateTime,
  errorMessage,
} from '@/lib/format'

describe('lib/format — libellés et badges', () => {
  it('traduit les statuts d action connus et laisse passer les inconnus', () => {
    expect(statusLabel('assigned')).toBe('Assignée')
    expect(statusLabel('in_progress')).toBe('En cours')
    expect(statusLabel('submitted')).toBe('Soumise')
    expect(statusLabel('approved')).toBe('Approuvée')
    expect(statusLabel('mystere')).toBe('mystere')
  })

  it('associe une classe Tailwind par statut', () => {
    expect(statusBadge('closed')).toContain('bg-slate-200')
    expect(statusBadge('inconnu')).toBe('badge bg-slate-100 text-slate-700')
    expect(ncStatusBadge('open')).toContain('bg-red-100')
    expect(severityBadge('critical')).toBe('badge bg-red-600 text-white')
    expect(severityBadge('minor')).toContain('bg-amber-100')
  })

  it('traduit les gravités', () => {
    expect(severityLabel('critical')).toBe('Critique')
    expect(severityLabel('major')).toBe('Majeure')
    expect(severityLabel('minor')).toBe('Mineure')
    expect(severityLabel('inconnu')).toBe('inconnu')
  })

  it('traduit les rôles et gère le rôle absent', () => {
    expect(roleLabel('quality_manager')).toBe('Responsable qualité')
    expect(roleLabel('operator')).toBe('Opérateur')
    expect(roleLabel('internal_auditor')).toBe('Auditeur interne')
    expect(roleLabel(undefined)).toBe('—')
    expect(roleLabel('role_inconnu')).toBe('role_inconnu')
  })

  it('déduit l espace d usage selon le rôle (annexe N.8 / L.2)', () => {
    expect(spaceForRole('external_auditor').code).toBe('AE')
    expect(spaceForRole('consultant').code).toBe('C')
    expect(spaceForRole('operator').code).toBe('P')
    expect(spaceForRole('quality_manager').code).toBe('P')
    expect(spaceForRole(undefined).code).toBe('P')
    expect(spaceLabel('AE')).toBe('Auditeur externe')
    expect(spaceBadge('C')).toContain('bg-violet-100')
  })

  it('traduit les statuts de couverture de la matrice (§L.4)', () => {
    expect(gapStatusLabel('tested')).toBe('Testé conforme')
    expect(gapStatusLabel('not_covered')).toBe('Non couvert')
    expect(gapStatusBadge('tested')).toContain('bg-emerald-100')
    expect(gapStatusBadge('inconnu')).toBe('badge bg-slate-100 text-slate-700')
  })

  it('formate les dates et tolère les valeurs absentes', () => {
    expect(formatDate(null)).toBe('—')
    expect(formatDate(undefined)).toBe('—')
    expect(formatDateTime(null)).toBe('—')
    expect(formatDate('2026-03-15T10:00:00Z')).toContain('2026')
  })

  it('convertit les exceptions en message lisible', () => {
    expect(errorMessage(new Error('échec serveur'))).toBe('échec serveur')
    expect(errorMessage('chaîne')).toContain('Une erreur est survenue')
    expect(errorMessage(undefined)).toContain('Une erreur est survenue')
  })
})
