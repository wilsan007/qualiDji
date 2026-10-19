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
