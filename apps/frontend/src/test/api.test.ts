import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Couche API frontend (§9.2 / §9.3) : construction des appels, propagation
 * du token et remontée des erreurs serveur.
 * Le client Supabase et fetch sont mockés — aucun réseau requis.
 */
const { mockGetSession } = vi.hoisted(() => ({
  mockGetSession: vi.fn(async () => ({ data: { session: { access_token: 'tok-123' } } })),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: mockGetSession } },
}))

import { auditsApi, reviewsApi, actionsApi, ncApi, evidenceApi, apiFetch } from '@/lib/api'

describe('lib/api — audits internes (§9.2)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mockGetSession.mockClear()
  })

  it('list interroge GET /audits avec le token de session', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ audits: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const res = await auditsApi.list()
    expect(res).toEqual({ audits: [] })
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/audits')
    expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer tok-123')
  })

  it('create envoie un POST JSON avec le corps du plan', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ audit: { id: 'a1' } }), { status: 201, headers: { 'Content-Type': 'application/json' } }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const res = await auditsApi.create({ title: 'Audit 2026', scope: 'Processus', criteria: 'ISO 9001', auditor_id: 'u2' })
    expect(res).toEqual({ audit: { id: 'a1' } })
    const [, init] = fetchMock.mock.calls[0]
    expect(init!.method).toBe('POST')
    expect(JSON.parse(init!.body as string)).toEqual({
      title: 'Audit 2026',
      scope: 'Processus',
      criteria: 'ISO 9001',
      auditor_id: 'u2',
    })
  })

  it('respond et verify ciblent les routes de constat', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await auditsApi.respond('f1', { response: 'Cause identifiée', corrective_action: 'Plan' })
    await auditsApi.verify('f1', { effective: true, comment: 'OK' })

    expect(String(fetchMock.mock.calls[0][0])).toContain('/audits/findings/f1/respond')
    expect(String(fetchMock.mock.calls[1][0])).toContain('/audits/findings/f1/verify')
  })

  it('remonte le message d erreur serveur (ex. ERR_AUTO_AUDIT)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ error: 'auto-audit interdit (§F.4)', code: 'ERR_AUTO_AUDIT' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )

    await expect(auditsApi.create({ title: 'x', scope: 'y', criteria: 'z', auditor_id: 'u' })).rejects.toThrow(
      /auto-audit interdit/,
    )
  })

  it('retourne null sur une réponse 204', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 204 })))
    await expect(apiFetch('/x', { method: 'DELETE' })).resolves.toBeNull()
  })
})

describe('lib/api — revues de direction (§9.3)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mockGetSession.mockClear()
  })

  it('list interroge GET /reviews', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ reviews: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const res = await reviewsApi.list()
    expect(res).toEqual({ reviews: [] })
    expect(String(fetchMock.mock.calls[0][0])).toContain('/reviews')
  })

  it('create envoie le titre de la revue', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('{}', { status: 201, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await reviewsApi.create({ title: 'Revue direction T1' })
    const [, init] = fetchMock.mock.calls[0]
    expect(init!.method).toBe('POST')
    expect(JSON.parse(init!.body as string)).toEqual({ title: 'Revue direction T1' })
  })

  it('prefill, update et hold utilisent les bonnes routes/méthodes', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await reviewsApi.prefill('r1')
    await reviewsApi.update('r1', { decisions: [{ decision: 'D1' }] })
    await reviewsApi.hold('r1')

    expect(String(fetchMock.mock.calls[0][0])).toContain('/reviews/r1/prefill')
    expect(fetchMock.mock.calls[0][1]!.method).toBe('POST')
    expect(String(fetchMock.mock.calls[1][0])).toContain('/reviews/r1')
    expect(fetchMock.mock.calls[1][1]!.method).toBe('PUT')
    expect(String(fetchMock.mock.calls[2][0])).toContain('/reviews/r1/hold')
    expect(fetchMock.mock.calls[2][1]!.method).toBe('POST')
  })

  it('remonte l erreur de tenue bloquée (409 sans entrées ni décisions)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ error: 'tenue impossible : entrées et décisions requises' }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )
    await expect(reviewsApi.hold('r1')).rejects.toThrow(/entrées et décisions/)
  })
})

describe('lib/api — moteur d\'exécution (C4) et CAPA (C6)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  const ok = () =>
    vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )

  it('create / assign / approve / reject ciblent les routes d\'action avec le bon corps', async () => {
    const fetchMock = ok()
    vi.stubGlobal('fetch', fetchMock)
    await actionsApi.create({ action_def_id: 'ACT_CTX_001', assigned_to: 'u1' })
    await actionsApi.assign('a1', 'u2')
    await actionsApi.approve('a1', 'conforme')
    await actionsApi.reject('a1', 'à préciser')
    const calls = fetchMock.mock.calls.map(([u, i]) => [String(u).replace(/^.*\/api\/v1/, ''), i!.method, i!.body])
    expect(calls).toEqual([
      ['/actions', 'POST', JSON.stringify({ action_def_id: 'ACT_CTX_001', assigned_to: 'u1' })],
      ['/actions/a1/assign', 'POST', JSON.stringify({ assigned_to: 'u2' })],
      ['/actions/a1/approve', 'POST', JSON.stringify({ comment: 'conforme' })],
      ['/actions/a1/reject', 'POST', JSON.stringify({ comment: 'à préciser' })],
    ])
  })

  it('l\'efficacité d\'une CAPA vise /nonconformities/capas/:id (la route n\'existe pas ailleurs)', async () => {
    const fetchMock = ok()
    vi.stubGlobal('fetch', fetchMock)
    await ncApi.effectiveness('c1', { effective: true })
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/nonconformities\/capas\/c1\/effectiveness-check$/)
  })

  it('remonte le code et le message d\'une ségrégation des tâches refusée', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ error: 'ségrégation des tâches', code: 'ERR_SEGREGATION_OF_DUTIES' }), { status: 403, headers: { 'Content-Type': 'application/json' } }),
    ))
    await expect(actionsApi.approve('a1')).rejects.toThrow('ségrégation des tâches')
  })
})

describe('lib/api — preuves (C3)', () => {
  it('upload envoie le fichier lui-même (corps binaire), son type, son empreinte et le jeton', async () => {
    vi.restoreAllMocks()
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ evidence: { id: 'e1' } }), { status: 201, headers: { 'Content-Type': 'application/json' } }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const file = new File(['%PDF-1.7 x'], 'relevé température.pdf', { type: 'application/pdf' })
    await evidenceApi.upload('a1', 'S1', file, 'ab'.repeat(32))

    const [url, init] = fetchMock.mock.calls[0]
    const u = new URL(String(url))
    expect(u.pathname).toMatch(/\/evidence\/upload$/)
    expect(u.searchParams.get('action_id')).toBe('a1')
    expect(u.searchParams.get('step_id')).toBe('S1')
    expect(u.searchParams.get('filename')).toBe('relevé température.pdf')
    expect(init!.method).toBe('POST')
    expect(init!.body).toBe(file)
    const h = init!.headers as Record<string, string>
    expect(h['Content-Type']).toBe('application/pdf')
    expect(h['X-Checksum-SHA256']).toBe('ab'.repeat(32))
    expect(h.Authorization).toBe('Bearer tok-123')
  })

  it('upload remonte le refus du serveur', async () => {
    vi.restoreAllMocks()
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ error: 'type non autorisé : text/html' }), { status: 415, headers: { 'Content-Type': 'application/json' } }),
    ))
    await expect(evidenceApi.upload('a1', undefined, new File(['<b>'], 'x.html', { type: 'text/html' }))).rejects.toThrow('type non autorisé')
  })
})

describe('lib/api — recalcul du guide contextuel', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
  })

  it('une écriture métier réussie déclenche le recalcul ; la lecture d’une notification et le guide lui-même non', async () => {
    const onChange = vi.fn()
    window.addEventListener('qualidji:data-changed', onChange)
    try {
      await apiFetch('/actions/a1/submit', { method: 'POST' })
      expect(onChange).toHaveBeenCalledTimes(1)
      await apiFetch('/notifications/n1/read', { method: 'POST' })
      await apiFetch('/notifications/read-all', { method: 'POST' })
      await apiFetch('/guide/ask', { method: 'POST' })
      await apiFetch('/actions/a1')
      expect(onChange).toHaveBeenCalledTimes(1)
    } finally {
      window.removeEventListener('qualidji:data-changed', onChange)
    }
  })
})
