/**
 * Carte exigences ↔ workflows PAR ENTREPRISE (docs/ETUDE_CARTE_PAR_ENTREPRISE.md, option A).
 *
 *   carte effective = suggestions globales − exclusions de l'entreprise + liens de l'entreprise
 *
 * Fonctions pures, testées hors ligne par scripts/test_requirement_links.ts. La carte n'a AUCUN effet
 * sur le statut de couverture (computeState) : un lien manquant ne produit qu'un avertissement.
 */

export const LINK_MODULES = ['audits', 'reviews', 'nonconformities', 'documents'] as const
export type LinkModule = (typeof LINK_MODULES)[number]

export const MODULE_LABELS: Record<LinkModule, string> = {
  audits: 'Audits internes',
  reviews: 'Revues de direction',
  nonconformities: 'Non-conformités et CAPA',
  documents: 'Documents contrôlés',
}

/** Racine d'un identifiant de workflow : retire le suffixe tenant (`__ab12cd34`) puis la version (`_V2`). */
export function baseCode(id: string): string {
  return id.replace(/__[0-9a-f]{8}$/, '').replace(/_V\d+$/, '')
}

export type WorkflowStatus = 'draft' | 'in_review' | 'published' | 'deprecated'
/** État d'une cible de lien : un workflow (publié, brouillon…, non défini) ou un module. */
export type LinkState = WorkflowStatus | 'missing' | 'module'

export interface TenantLinkRow {
  id: string
  requirement_id: string
  kind: 'workflow' | 'module' | 'exclusion'
  workflow_family: string | null
  module: string | null
  coverage_type: 'primary' | 'supporting'
  reason: string
  created_at: string
}

/** Une définition de workflow visible de l'entreprise (bibliothèque globale + propres workflows). */
export interface WorkflowDef {
  id: string
  name: string
  status: WorkflowStatus
}

export interface FamilyInfo {
  name: string
  state: WorkflowStatus
}

export interface EffectiveLink {
  /** Identifiant du lien de l'entreprise ; null pour une suggestion du catalogue. */
  id: string | null
  origin: 'suggestion' | 'tenant'
  kind: 'workflow' | 'module'
  /** Famille de workflow (code racine) ou identifiant de module. */
  target: string
  label: string
  coverage_type: 'primary' | 'supporting'
  state: LinkState
  reason: string | null
  created_at: string | null
}

export interface ExcludedSuggestion {
  id: string
  target: string
  reason: string
  created_at: string
}

/** Ordre de préférence quand plusieurs versions d'une même famille existent : publié d'abord. */
const STATE_RANK: Record<WorkflowStatus, number> = { published: 0, in_review: 1, draft: 2, deprecated: 3 }

/** Regroupe les définitions par famille et garde, pour chacune, l'état le plus avancé (publié > revue > brouillon > déprécié). */
export function familiesFromDefinitions(defs: WorkflowDef[]): Map<string, FamilyInfo> {
  const out = new Map<string, FamilyInfo>()
  for (const d of defs) {
    const family = baseCode(d.id)
    const cur = out.get(family)
    if (!cur || STATE_RANK[d.status] < STATE_RANK[cur.state]) out.set(family, { name: d.name, state: d.status })
  }
  return out
}

function workflowTarget(family: string, families: Map<string, FamilyInfo>): { state: LinkState; label: string } {
  const info = families.get(family)
  return info ? { state: info.state, label: info.name } : { state: 'missing', label: family }
}

/**
 * Carte effective d'UNE exigence.
 * @param suggestions codes de la carte globale pour cette exigence
 * @param rows        liens ACTIFS de l'entreprise pour cette exigence (déjà filtrés removed_at is null)
 */
export function buildEffectiveLinks(
  suggestions: string[],
  rows: TenantLinkRow[],
  families: Map<string, FamilyInfo>,
): { links: EffectiveLink[]; excluded: ExcludedSuggestion[] } {
  const excludedRows = rows.filter((r) => r.kind === 'exclusion' && r.workflow_family)
  const excludedFamilies = new Set(excludedRows.map((r) => r.workflow_family as string))
  const links: EffectiveLink[] = []
  const seen = new Set<string>()

  // Les liens de l'entreprise priment sur une suggestion de même famille
  for (const r of rows) {
    if (r.kind === 'workflow' && r.workflow_family) {
      const key = `workflow:${r.workflow_family}`
      if (seen.has(key)) continue
      seen.add(key)
      const t = workflowTarget(r.workflow_family, families)
      links.push({ id: r.id, origin: 'tenant', kind: 'workflow', target: r.workflow_family, label: t.label, coverage_type: r.coverage_type, state: t.state, reason: r.reason, created_at: r.created_at })
    } else if (r.kind === 'module' && r.module) {
      const key = `module:${r.module}`
      if (seen.has(key)) continue
      seen.add(key)
      const label = MODULE_LABELS[r.module as LinkModule] ?? r.module
      links.push({ id: r.id, origin: 'tenant', kind: 'module', target: r.module, label, coverage_type: r.coverage_type, state: 'module', reason: r.reason, created_at: r.created_at })
    }
  }

  for (const family of suggestions) {
    const key = `workflow:${family}`
    if (excludedFamilies.has(family) || seen.has(key)) continue
    seen.add(key)
    const t = workflowTarget(family, families)
    links.push({ id: null, origin: 'suggestion', kind: 'workflow', target: family, label: t.label, coverage_type: 'primary', state: t.state, reason: null, created_at: null })
  }

  const excluded = excludedRows.map((r) => ({ id: r.id, target: r.workflow_family as string, reason: r.reason, created_at: r.created_at }))
  return { links, excluded }
}

/** Un lien « couvre » l'exigence s'il pointe un workflow PUBLIÉ ou un module (un brouillon ou un workflow non défini ne couvre pas). */
export function coversRequirement(links: EffectiveLink[]): boolean {
  return links.some((l) => l.state === 'published' || l.state === 'module')
}

export const NO_COVERAGE_WARNING =
  'Aucun workflow publié ni module ne couvre cette exigence (avertissement : ne change pas le statut de couverture).'

/**
 * Avertissements NON bloquants d'une ligne de matrice. Jamais ajoutés aux raisons de blocage :
 * seule la saisie (responsable, preuve, méthode) et les tests décident d'une lacune bloquante.
 */
export function linkWarnings(
  line: { requirement_type: string },
  applicability: 'applicable' | 'not_applicable' | 'to_review' | null | undefined,
  links: EffectiveLink[],
): string[] {
  if (line.requirement_type !== 'requirement') return []
  if (applicability === 'not_applicable') return []
  return coversRequirement(links) ? [] : [NO_COVERAGE_WARNING]
}
