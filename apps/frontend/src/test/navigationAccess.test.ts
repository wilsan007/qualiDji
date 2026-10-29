import { describe, it, expect } from 'vitest'
import { NAV_ITEMS } from '@/lib/navigation'

/**
 * Droits d'accès des écrans du menu. Cette table est la copie, côté interface, de SCREEN_ACCESS
 * (apps/backend/src/lib/guide.ts) : le serveur refuse le guide d'un écran fermé au rôle, avec
 * exactement les mêmes permissions que celles qui masquent l'entrée du menu. Si ce test échoue,
 * mettre à jour les DEUX côtés (navigation.ts ET SCREEN_ACCESS) et le test du backend (scripts/test_guide.ts).
 */
const EXPECTED: Record<string, { perm?: string; anyPerm?: string[] }> = {
  dashboard: {},
  workflow: {},
  nc: {},
  audit: { perm: 'audit.export' },
  matrice: {},
  workflows: { perm: 'workflow.read' },
  users: { perm: 'user.manage' },
  reports: { perm: 'action.approve' },
  documents: { perm: 'document.read' },
  audits: { anyPerm: ['internal_audit.manage', 'internal_audit.respond'] },
  reviews: { perm: 'management_review.manage' },
}

describe('droits d’accès des écrans (menu ↔ guide du serveur)', () => {
  it('chaque entrée du menu a les mêmes permissions que la règle du serveur', () => {
    for (const item of NAV_ITEMS) {
      expect({ perm: item.perm, anyPerm: item.anyPerm }, `écran ${item.screen}`).toEqual({
        perm: EXPECTED[item.screen]?.perm,
        anyPerm: EXPECTED[item.screen]?.anyPerm,
      })
    }
  })

  it('aucun écran du menu n’est absent de la table (ni l’inverse)', () => {
    expect(NAV_ITEMS.map((i) => i.screen).sort()).toEqual(Object.keys(EXPECTED).sort())
  })
})
