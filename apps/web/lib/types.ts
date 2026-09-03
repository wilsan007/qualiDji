// Database types — mirrors the Supabase schema

export type Plan = 'free' | 'tpe' | 'pme' | 'ge'
export type TenantStatus = 'trial' | 'active' | 'suspended' | 'cancelled'
export type UIMode = 'guided' | 'assisted' | 'expert'
export type StandardMode = 'implementation' | 'maintenance'

export type UserRole =
  | 'super_admin'
  | 'tenant_admin'
  | 'director'
  | 'quality_manager'
  | 'internal_auditor'
  | 'process_owner'
  | 'operator'
  | 'external_auditor'
  | 'supplier'

export type TaskStatus =
  | 'pending'
  | 'in_progress'
  | 'done'
  | 'verified'
  | 'rejected'
  | 'missed'
  | 'late'

export type EvidenceLevel = 0 | 1 | 2 | 3 | 4 | 5

export type EvidenceType = 'photo' | 'video' | 'audio' | 'signature' | 'sensor' | 'file'

export type DocumentStatus = 'draft' | 'review' | 'approved' | 'published' | 'obsolete'

export type NonConformitySeverity = 'minor' | 'major' | 'critical'
export type NonConformitySource = 'task' | 'audit' | 'complaint' | 'ccp' | 'supplier'

export type AuditFindingType = 'conform' | 'observation' | 'nc_minor' | 'nc_major'

// Database row types
export interface Tenant {
  id: string
  name: string
  slug: string
  plan: Plan
  status: TenantStatus
  settings: TenantSettings
  country: string
  created_at: string
}

export interface TenantSettings {
  branding?: {
    logo_url?: string
    primary_color?: string
  }
  vocabulary?: Record<string, string>
  languages?: string[]
  default_evidence_level?: EvidenceLevel
}

export interface Site {
  id: string
  tenant_id: string
  name: string
  address: string | null
  geo: { lat: number; lng: number } | null
  timezone: string
  is_active: boolean
}

export interface Profile {
  id: string
  tenant_id: string | null
  full_name: string
  phone: string | null
  lang: string
  competence: Record<string, number>
  ui_mode: UIMode
  is_active: boolean
}

export interface Membership {
  id: string
  tenant_id: string
  user_id: string
  role: UserRole
  site_ids: string[]
  process_ids: string[]
}

export interface Invitation {
  id: string
  tenant_id: string
  email: string
  role: UserRole
  token: string
  expires_at: string
  accepted_at: string | null
}

export interface AuditLogEntry {
  id: number
  tenant_id: string
  actor_id: string | null
  action: string
  entity: string
  entity_id: string | null
  payload: Record<string, unknown>
  ip: string | null
  user_agent: string | null
  prev_hash: string | null
  hash: string
  created_at: string
}
