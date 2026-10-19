/// <reference types="vite/client" />

import { supabase } from './supabase'

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1'

async function getToken() {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token
}

export async function apiFetch(path: string, options: RequestInit = {}) {
  const token = await getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `API error ${res.status}`)
  }
  if (res.status === 204) return null
  return res.json()
}

// Actions
export const actionsApi = {
  list: (params?: { status?: string }) =>
    apiFetch('/actions/assigned' + (params?.status ? `?status=${params.status}` : '')),
  get: (id: string) => apiFetch(`/actions/${id}`),
  start: (id: string) => apiFetch(`/actions/${id}/start`, { method: 'POST' }),
  submit: (id: string) => apiFetch(`/actions/${id}/submit`, { method: 'POST' }),
  block: (id: string) => apiFetch(`/actions/${id}/block`, { method: 'POST' }),
  exception: (id: string, body: { reason: string; severity?: string }) =>
    apiFetch(`/actions/${id}/exception`, { method: 'POST', body: JSON.stringify(body) }),
}

// Steps
export const stepsApi = {
  submit: (actionId: string, stepId: string, value: any) =>
    apiFetch(`/steps/${actionId}/steps/${stepId}/submit`, {
      method: 'POST',
      body: JSON.stringify({ value }),
    }),
  addEvidence: (actionId: string, stepId: string, body: { kind: string; storage_path: string; checksum?: string; value?: any }) =>
    apiFetch(`/steps/${actionId}/steps/${stepId}/evidence`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
}

// AI
export const aiApi = {
  guidance: (actionId: string, stepId?: string, context?: Record<string, any>) =>
    apiFetch('/ai/guidance', {
      method: 'POST',
      body: JSON.stringify({ actionId, stepId, context }),
    }),
}

// Evidence
export const evidenceApi = {
  create: (body: { action_id: string; kind: string; storage_path: string; checksum?: string; value?: any }) =>
    apiFetch('/evidence', { method: 'POST', body: JSON.stringify(body) }),
  get: (id: string) => apiFetch(`/evidence/${id}`),
  remove: (id: string) => apiFetch(`/evidence/${id}`, { method: 'DELETE' }),
}

// NC / CAPA
export const ncApi = {
  list: () => apiFetch('/nonconformities'),
  create: (body: { title: string; severity?: string; action_id?: string }) =>
    apiFetch('/nonconformities', { method: 'POST', body: JSON.stringify(body) }),
  capa: (id: string, body: { root_cause?: string; corrective_action?: string; responsible?: string; due_date?: string }) =>
    apiFetch(`/nonconformities/${id}/capa`, { method: 'POST', body: JSON.stringify(body) }),
  effectiveness: (id: string, body: { effective: boolean; comments?: string }) =>
    apiFetch(`/capas/${id}/effectiveness-check`, { method: 'POST', body: JSON.stringify(body) }),
}

// Dashboard
export const dashboardApi = {
  employee: () => apiFetch('/dashboard/employee'),
  manager: () => apiFetch('/dashboard/manager'),
  quality: () => apiFetch('/dashboard/quality'),
  auditReadiness: () => apiFetch('/dashboard/audit-readiness'),
}

// Audit
export const auditApi = {
  list: () => apiFetch('/audit-log'),
  trace: (evidenceId: string) => apiFetch(`/audit-log/trace/${evidenceId}`),
}

// Tenants
export const tenantsApi = {
  me: () => apiFetch('/tenants/me'),
}

// Session courante + permissions RBAC (V5 §3.3) — source de vérité pour le gating UI
export const sessionApi = {
  me: () =>
    apiFetch('/me') as Promise<{
      user: { id: string; email?: string; tenant_id?: string; role?: string }
      permissions: string[]
    }>,
}

// Matrice de traçabilité ISO 9001:2026 (V4 — annexes K & L)
export const matrixApi = {
  requirements: (params?: { clause?: string; space?: string; status?: string }) => {
    const qs = new URLSearchParams()
    if (params?.clause) qs.set('clause', params.clause)
    if (params?.space) qs.set('space', params.space)
    if (params?.status) qs.set('status', params.status)
    const query = qs.toString()
    return apiFetch('/matrix/requirements' + (query ? `?${query}` : ''))
  },
  coverage: () => apiFetch('/matrix/coverage'),
  update: (
    id: string,
    body: {
      reason: string
      applicability?: string
      na_justification?: string
      na_approved_by?: string
      process_owner?: string
      objective_evidence?: string
      software_control?: string
      verification_method?: string
    }
  ) => apiFetch(`/matrix/requirements/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  recordTest: (
    id: string,
    body: { kind: 'positive' | 'negative'; status: 'todo' | 'passed' | 'failed'; notes?: string }
  ) => apiFetch(`/matrix/requirements/${id}/tests`, { method: 'POST', body: JSON.stringify(body) }),
  naRegister: () => apiFetch('/matrix/na-register'),
  validations: () => apiFetch('/matrix/validations'),

  /** Télécharge l'export CSV (L.1: remise en format éditable). */
  exportCsv: async () => {
    const token = await getToken()
    const res = await fetch(`${API_BASE}/matrix/export`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error ?? `API error ${res.status}`)
    }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `matrice_tracabilite_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  },
}

// Module B — Bibliothèque de workflows (V5 §5.2)
export interface WorkflowSummary {
  id: string
  name: string
  standard_clause: string
  version: number
  owner_role: string
  frequency: string
  is_active: boolean
  status: 'draft' | 'in_review' | 'published' | 'deprecated'
  change_reason?: string | null
  review_comment?: string | null
  effective_from?: string | null
  approved_at?: string | null
  created_at: string
}

export interface WorkflowStepForm {
  id?: string
  sequence: number
  title: string
  instruction: string
  step_type: string
  required: boolean
  validation_rule?: string | null
  evidence_requirement?: string
  approver_role?: string | null
  segregation_of_duties?: boolean
  ai_guidance_enabled?: boolean
  ai_prompt_template?: string | null
  guardrails?: unknown[]
  choices?: unknown[] | null
}

export interface WorkflowActionForm {
  id?: string
  title: string
  objective: string
  assigned_role: string
  sort_order?: number
  steps: WorkflowStepForm[]
}

export interface WorkflowPayload {
  code?: string
  name: string
  standard_clause: string
  owner_role: string
  frequency: string
  actions: WorkflowActionForm[]
}

export const workflowsApi = {
  list: (includeAll = false) => apiFetch('/workflows' + (includeAll ? '?include_all=1' : '')),
  get: (id: string) => apiFetch(`/workflows/${id}`),
  create: (body: WorkflowPayload) =>
    apiFetch('/workflows', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: WorkflowPayload) =>
    apiFetch(`/workflows/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  submit: (id: string) => apiFetch(`/workflows/${id}/submit`, { method: 'POST' }),
  approve: (id: string) => apiFetch(`/workflows/${id}/approve`, { method: 'POST' }),
  reject: (id: string, comment: string) =>
    apiFetch(`/workflows/${id}/reject`, { method: 'POST', body: JSON.stringify({ comment }) }),
  duplicate: (id: string, change_reason: string) =>
    apiFetch(`/workflows/${id}/duplicate`, { method: 'POST', body: JSON.stringify({ change_reason }) }),
  deprecate: (id: string, change_reason: string) =>
    apiFetch(`/workflows/${id}/deprecate`, { method: 'POST', body: JSON.stringify({ change_reason }) }),
  remove: (id: string) => apiFetch(`/workflows/${id}`, { method: 'DELETE' }),
}

// §3.4 Gestion des utilisateurs (user.manage)
export interface TenantUser {
  id: string
  email: string | null
  display_name: string | null
  role: string
  is_active: boolean
  suspended_at: string | null
  last_sign_in_at: string | null
  created_at: string
}

export const usersApi = {
  list: () => apiFetch('/users'),
  get: (id: string) => apiFetch(`/users/${id}`),
  invite: (body: { email: string; role: string; display_name?: string }) =>
    apiFetch('/users/invite', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: { role?: string; display_name?: string; reason?: string }) =>
    apiFetch(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deactivate: (id: string) => apiFetch(`/users/${id}/deactivate`, { method: 'POST' }),
  activate: (id: string) => apiFetch(`/users/${id}/activate`, { method: 'POST' }),
}

// Module G — Notifications internes (V5 §5.7)
export interface NotificationItem {
  id: string
  kind: string
  title: string
  body: string | null
  entity: string | null
  entity_id: string | null
  link: string | null
  read_at: string | null
  created_at: string
}

export const notificationsApi = {
  list: () => apiFetch('/notifications?limit=30'),
  markRead: (id: string) => apiFetch(`/notifications/${id}/read`, { method: 'POST' }),
  markAllRead: () => apiFetch('/notifications/read-all', { method: 'POST' }),
}

// Module H — Rapports et préparation d'audit (V5 §5.8)
export interface ReportsFilters {
  status?: string
  from?: string
  to?: string
}

function qsOf(params?: ReportsFilters): string {
  if (!params) return ''
  const parts: string[] = []
  if (params.status) parts.push(`status=${encodeURIComponent(params.status)}`)
  if (params.from) parts.push(`from=${encodeURIComponent(params.from)}`)
  if (params.to) parts.push(`to=${encodeURIComponent(params.to)}`)
  return parts.length ? `?${parts.join('&')}` : ''
}

async function downloadCsv(path: string, filename: string) {
  const token = await getToken()
  const res = await fetch(`${API_BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `API error ${res.status}`)
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export const reportsApi = {
  actions: (params?: ReportsFilters) => apiFetch('/reports/actions' + qsOf(params)),
  ncCapa: () => apiFetch('/reports/nc-capa'),
  auditPack: () => apiFetch('/reports/audit-pack'),
  exportActions: (params?: ReportsFilters) =>
    downloadCsv('/reports/actions.csv' + qsOf(params), `rapport_actions_${new Date().toISOString().slice(0, 10)}.csv`),
  exportNcCapa: () =>
    downloadCsv('/reports/nc-capa.csv', `registre_nc_capa_${new Date().toISOString().slice(0, 10)}.csv`),
}
