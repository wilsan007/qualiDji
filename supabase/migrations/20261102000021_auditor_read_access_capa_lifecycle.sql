-- ============================================================================
-- Migration 0021 : accès en lecture seule des auditeurs + cycle de vie CAPA
--
-- 1) Un auditeur externe (certification, client) doit pouvoir VÉRIFIER, sans rien
--    modifier : actions et preuves de l'entreprise, journal d'audit, audits internes,
--    revues de direction, rapports. Jusqu'ici il ne voyait que ses propres actions
--    (aucune) et n'avait ni journal, ni audits internes, ni revues, ni rapports.
--      - action.read_all          : lire TOUTES les actions et preuves du tenant (lecture)
--      - internal_audit.read      : consulter les audits internes et leurs constats
--      - management_review.read   : consulter les revues de direction
--      - audit.export (existant)  : journal d'audit, rapports, paquet d'audit, exports CSV
--    Aucune de ces permissions n'autorise une écriture : toutes les routes de
--    modification restent gardées par leurs permissions propres.
--    L'auditeur interne reçoit aussi action.read_all et management_review.read :
--    il ne peut pas auditer des processus dont il ne voit pas les enregistrements.
--
-- 2) CAPA : la vérification d'efficacité garde son commentaire dans une colonne dédiée
--    (effectiveness_result ne porte plus que 'effective' / 'ineffective', ce que les
--    rapports comptent), et la NC reçoit sa date de clôture.
-- Idempotent.
-- ============================================================================

insert into public.permissions (code, description) values
('action.read_all', 'Lire toutes les actions et preuves du tenant (lecture seule)'),
('internal_audit.read', 'Consulter les audits internes et leurs constats (lecture seule)'),
('management_review.read', 'Consulter les revues de direction (lecture seule)')
on conflict (code) do nothing;

-- Auditeur externe : audit.export + les trois lectures
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.code = 'external_auditor'
  and p.code in ('audit.export', 'action.read_all', 'internal_audit.read', 'management_review.read')
on conflict do nothing;

-- Auditeur interne : lecture de toutes les actions et des revues de direction
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.code = 'internal_auditor'
  and p.code in ('action.read_all', 'management_review.read')
on conflict do nothing;

alter table public.capas
  add column if not exists effectiveness_comments text;

alter table public.nonconformities
  add column if not exists closed_at timestamptz;
