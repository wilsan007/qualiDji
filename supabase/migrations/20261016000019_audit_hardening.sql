-- ============================================================================
-- Migration 0019 : H2 (contrôle documentaire), H3 (séparation des tâches),
-- H4 (piste d'audit non modifiable), H7 (quota IA), M3 (atomicité), M7 (revues)
-- — constats de docs/AUDIT_ANALYSE_APPROFONDIE.md
--
-- Règle commune : les contraintes d'intégrité sont posées dans la BASE (pas
-- seulement dans Express) — un défaut de route ne doit pas suffire à les lever.
-- Les suppressions/mises à jour en CASCADE (suppression d'un tenant, d'une
-- action…) restent permises : elles s'exécutent dans un trigger d'intégrité
-- référentielle (pg_trigger_depth() > 1). Une écriture directe a profondeur 1.
-- Idempotent.
-- ============================================================================

-- 1) H4 — journaux non modifiables ------------------------------------------
create or replace function public.forbid_mutation() returns trigger
language plpgsql as $$
begin
  -- Cascade référentielle (ex. suppression d'un tenant) : autorisée.
  if pg_trigger_depth() > 1 then
    return case tg_op when 'DELETE' then old else new end;
  end if;
  raise exception '% interdit sur % : table en ajout seul (piste d''audit)', tg_op, tg_table_name
    using errcode = '42501';
end $$;

drop trigger if exists audit_log_append_only on public.audit_log;
create trigger audit_log_append_only before update or delete on public.audit_log
  for each row execute function public.forbid_mutation();

drop trigger if exists ai_interventions_append_only on public.ai_interventions;
create trigger ai_interventions_append_only before update or delete on public.ai_interventions
  for each row execute function public.forbid_mutation();

-- Preuves : jamais modifiées après dépôt (empreinte, chemin, auteur, horodatage).
-- La suppression reste possible côté backend (route journalisée, refusée une fois l'action approuvée).
create or replace function public.forbid_update() returns trigger
language plpgsql as $$
begin
  if pg_trigger_depth() > 1 then return new; end if;
  raise exception 'UPDATE interdit sur % : enregistrement immuable', tg_table_name using errcode = '42501';
end $$;

drop trigger if exists evidence_immutable on public.evidence;
create trigger evidence_immutable before update on public.evidence
  for each row execute function public.forbid_update();

-- Défense en profondeur : même service_role ne peut plus modifier ces tables.
revoke update, delete, truncate on public.audit_log from anon, authenticated, service_role;
revoke update, delete, truncate on public.ai_interventions from anon, authenticated, service_role;
revoke update, truncate on public.evidence from anon, authenticated, service_role;

-- 2) H2 — documents ----------------------------------------------------------
-- Une seule version publiée par (tenant, doc_key). Rattrapage : les anciennes
-- versions publiées simultanées sont dépréciées avant de poser l'index.
update public.documents d
set status = 'deprecated', updated_at = now(),
    change_reason = coalesce(d.change_reason, 'Remplacé automatiquement (migration 0019)')
where d.status = 'published'
  and exists (
    select 1 from public.documents n
    where n.tenant_id = d.tenant_id and n.doc_key = d.doc_key
      and n.status = 'published' and n.version > d.version
  );

create unique index if not exists documents_one_published_idx
  on public.documents (tenant_id, doc_key) where status = 'published';

alter table public.documents
  add column if not exists submitted_by uuid,
  add column if not exists contributor_ids uuid[] not null default '{}';

-- Un document publié/déprécié/archivé n'est ni supprimé ni réécrit.
create or replace function public.documents_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if pg_trigger_depth() > 1 then return old; end if;
    if old.status not in ('draft', 'in_review') then
      raise exception 'suppression interdite : un document % n''est jamais supprimé (§8.5)', old.status using errcode = '42501';
    end if;
    return old;
  end if;
  if old.status <> 'draft' and (
       new.doc_key, new.title, new.doc_type, new.classification, new.owner_role,
       new.version, new.excerpt, new.content_sha256, new.tenant_id
     ) is distinct from (
       old.doc_key, old.title, old.doc_type, old.classification, old.owner_role,
       old.version, old.excerpt, old.content_sha256, old.tenant_id
     ) then
    raise exception 'contenu d''un document % non modifiable : créez une nouvelle version (§8.6)', old.status using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists documents_guard_trg on public.documents;
create trigger documents_guard_trg before update or delete on public.documents
  for each row execute function public.documents_guard();

-- Lecture directe (PostgREST) : seuls les documents publiés non confidentiels.
drop policy if exists documents_published_select on public.documents;
create policy documents_published_select on public.documents for select to authenticated using (
  status = 'published'
  and classification in ('public', 'internal')
  and tenant_id in (select tenant_id from public.user_profiles where id = auth.uid())
);

-- Approbation atomique : publie la version ET déprécie la précédente publiée, en
-- une transaction, avec séparation des tâches (H3) imposée par la base.
create or replace function public.document_approve(p_id uuid, p_tenant uuid, p_actor uuid)
returns public.documents
language plpgsql security definer set search_path = public as $$
declare
  d public.documents;
  ts timestamptz := now();
begin
  select * into d from public.documents where id = p_id and tenant_id = p_tenant for update;
  if not found then return null; end if;
  if d.status <> 'in_review' then
    raise exception 'ERR_BAD_STATE:%', d.status using errcode = 'P0001';
  end if;
  if p_actor = d.created_by or p_actor = d.submitted_by or p_actor = any (d.contributor_ids) then
    raise exception 'ERR_SEGREGATION_OF_DUTIES' using errcode = 'P0001';
  end if;
  update public.documents
     set status = 'deprecated', updated_by = p_actor, updated_at = ts,
         change_reason = 'Remplacé par la version ' || d.version
   where tenant_id = p_tenant and doc_key = d.doc_key and id <> d.id and status = 'published';
  update public.documents
     set status = 'published', effective_from = ts, approved_by = p_actor, approved_at = ts,
         updated_by = p_actor, updated_at = ts
   where id = d.id
   returning * into d;
  return d;
end $$;
revoke all on function public.document_approve(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.document_approve(uuid, uuid, uuid) to service_role;

-- 3) H3 — séparation des tâches sur les workflows ----------------------------
alter table public.workflow_definitions
  add column if not exists submitted_by uuid,
  add column if not exists contributor_ids uuid[] not null default '{}';

-- 4) H3 — non-applicabilité (K.4) : approuvée par une AUTRE personne, identifiée par le serveur
alter table public.requirement_assessments
  add column if not exists na_requested_by uuid,
  add column if not exists na_approved_user_id uuid;

-- 5) M3 — remplacement atomique des actions/étapes d'un brouillon -------------
create or replace function public.workflow_replace_children(p_workflow text, p_actions jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  st text;
  a jsonb; s jsonb;
  ai int := 0; si int;
  v_action_id text;
begin
  select status into st from public.workflow_definitions where id = p_workflow for update;
  if not found then raise exception 'workflow introuvable : %', p_workflow; end if;
  if st <> 'draft' then raise exception 'ERR_BAD_STATE:%', st using errcode = 'P0001'; end if;

  delete from public.workflow_steps
   where action_id in (select id from public.workflow_actions where workflow_id = p_workflow);
  delete from public.workflow_actions where workflow_id = p_workflow;

  for a in select * from jsonb_array_elements(p_actions) loop
    ai := ai + 1;
    v_action_id := p_workflow || '__A' || ai;
    insert into public.workflow_actions (id, workflow_id, title, objective, assigned_role, sort_order)
    values (v_action_id, p_workflow, a->>'title', a->>'objective', a->>'assigned_role',
            case when coalesce((a->>'sort_order')::int, 0) > 0 then (a->>'sort_order')::int else ai end);
    si := 0;
    for s in select * from jsonb_array_elements(a->'steps') loop
      si := si + 1;
      insert into public.workflow_steps (
        id, action_id, sequence, title, instruction, step_type, required, validation_rule,
        evidence_requirement, approver_role, segregation_of_duties, ai_guidance_enabled,
        ai_prompt_template, guardrails, choices
      ) values (
        v_action_id || '__S' || si, v_action_id, (s->>'sequence')::int, s->>'title', s->>'instruction',
        s->>'step_type', coalesce((s->>'required')::boolean, true), nullif(s->>'validation_rule', ''),
        coalesce(s->>'evidence_requirement', 'auto_save'), nullif(s->>'approver_role', ''),
        coalesce((s->>'segregation_of_duties')::boolean, false),
        coalesce((s->>'ai_guidance_enabled')::boolean, true), nullif(s->>'ai_prompt_template', ''),
        coalesce(s->'guardrails', '[]'::jsonb),
        case when s->'choices' is null or s->'choices' = 'null'::jsonb then null else s->'choices' end
      );
    end loop;
  end loop;
end $$;
revoke all on function public.workflow_replace_children(text, jsonb) from public, anon, authenticated;
grant execute on function public.workflow_replace_children(text, jsonb) to service_role;

-- 6) H7 — quota IA par utilisateur / tenant -----------------------------------
alter table public.ai_interventions add column if not exists user_id uuid;
create index if not exists ai_interventions_quota_idx
  on public.ai_interventions (tenant_id, user_id, created_at desc);

-- 7) M7 — revue de direction : entrées consolidées par le serveur, scellées ----
alter table public.management_reviews
  add column if not exists inputs_sha256 text,
  add column if not exists prefilled_at timestamptz,
  add column if not exists prefilled_by uuid;

-- 8) Garde-fous finaux -----------------------------------------------------------
do $$
begin
  if has_table_privilege('service_role', 'public.audit_log', 'UPDATE,DELETE') then
    raise exception '0019 : audit_log encore modifiable par service_role';
  end if;
  if (select count(*) from pg_trigger where tgname in ('audit_log_append_only', 'ai_interventions_append_only', 'evidence_immutable', 'documents_guard_trg') and not tgisinternal) <> 4 then
    raise exception '0019 : triggers d''immuabilité manquants';
  end if;
end $$;
