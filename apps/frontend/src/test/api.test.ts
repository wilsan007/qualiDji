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

import { auditsApi, reviewsApi, apiFetch } from '@/lib/api'

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
