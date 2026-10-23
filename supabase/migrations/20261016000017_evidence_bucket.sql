-- ============================================================================
-- Migration 0017 : stockage des preuves (constat C3 de
-- docs/AUDIT_ANALYSE_APPROFONDIE.md, spec §7.1 « buckets privés »)
--   Jusqu'ici aucun bucket n'existait et le fichier n'était jamais envoyé :
--   seules des métadonnées étaient enregistrées.
--   - bucket `evidence` PRIVÉ ; aucune politique sur storage.objects : ni anon
--     ni authenticated n'y accèdent directement. Dépôt et lecture passent par
--     le backend (service_role), qui calcule/vérifie le SHA-256 et délivre des
--     URL signées de courte durée.
--   - limites alignées sur le serveur (25 Mio, types autorisés) en défense en
--     profondeur ; le backend les applique aussi.
-- Idempotent.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'evidence', 'evidence', false, 26214400,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'application/pdf',
    'text/plain', 'text/csv',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Garde-fou : le bucket doit exister et rester privé
do $$
begin
  if not exists (select 1 from storage.buckets where id = 'evidence' and public = false) then
    raise exception '0017 : bucket evidence absent ou public';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and (qual ilike '%evidence%' or with_check ilike '%evidence%')
  ) then
    raise exception '0017 : une politique storage.objects référence déjà le bucket evidence';
  end if;
end $$;
