-- ============================================================================
-- Migration 0013: AI Assistant — pgvector, conversation, roles, logging
-- ============================================================================
-- Sprint 16: Assistant IA
-- Tables: ai_conversations, ai_messages, ai_embeddings, ai_usage_log,
--         ai_prompts
-- Requires: pgvector extension
-- ============================================================================

-- ============================================================================
-- EXTENSION
-- ============================================================================

create extension if not exists vector;

-- ============================================================================
-- ENUMS
-- ============================================================================

create type ai_role as enum (
  'writer',           -- rédacteur de documents
  'gap_analyst',      -- analyste d'écarts
  'rca_coach',        -- coach analyse causes racines
  'explainer',        -- explicateur de clauses
  'translator',       -- traducteur
  'audit_preparer',   -- préparateur d'audit
  'haccp_assistant',  -- assistant HACCP (future)
  'general'           -- assistant général
);

create type ai_message_role as enum ('user', 'assistant', 'system');

-- ============================================================================
-- TABLES
-- ============================================================================

create table public.ai_conversations (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role ai_role not null default 'general',
  context_type text,               -- 'task', 'nc', 'audit', 'document', 'requirement'
  context_id uuid,                 -- ID of the related entity
  title text not null default 'New conversation',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ai_messages (
  id uuid primary key default uuid_generate_v4(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  role ai_message_role not null,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,  -- tokens, model, latency, etc.
  -- Human validation: no AI output is saved without validation
  validated_by uuid references auth.users(id) on delete set null,
  validated_at timestamptz,
  is_validated boolean not null default false,
  -- For assistant messages that were used/adopted
  adopted boolean not null default false,
  adopted_into text,               -- where it was adopted (e.g. 'document_123', 'nc_456')
  created_at timestamptz not null default now()
);

create table public.ai_embeddings (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid references public.tenants(id) on delete cascade,  -- null = global
  source_type text not null,       -- 'requirement', 'document', 'capsule', 'help'
  source_id uuid,
  content text not null,
  content_hash text not null,      -- for deduplication
  embedding vector(1536),          -- OpenAI ada-002 / text-embedding-3-small dimensions
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.ai_usage_log (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid references public.ai_conversations(id) on delete set null,
  role ai_role not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  total_tokens integer not null default 0,
  cost_usd numeric(10,6) not null default 0,
  model text not null,
  latency_ms integer,
  success boolean not null default true,
  error_message text,
  created_at timestamptz not null default now()
);

create table public.ai_prompts (
  id uuid primary key default uuid_generate_v4(),
  role ai_role not null,
  version text not null,           -- semantic versioning
  system_prompt text not null,
  description text,
  is_active boolean not null default true,
  max_tokens integer not null default 2000,
  temperature numeric not null default 0.7,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

create index idx_ai_conversations_tenant on public.ai_conversations(tenant_id);
create index idx_ai_conversations_user on public.ai_conversations(user_id);
create index idx_ai_conversations_context on public.ai_conversations(context_type, context_id);
create index idx_ai_messages_conversation on public.ai_messages(conversation_id);
create index idx_ai_messages_validated on public.ai_messages(is_validated);
create index idx_ai_embeddings_tenant on public.ai_embeddings(tenant_id);
create index idx_ai_embeddings_source on public.ai_embeddings(source_type, source_id);
create index idx_ai_embeddings_hash on public.ai_embeddings(content_hash);
create index idx_ai_usage_log_tenant on public.ai_usage_log(tenant_id);
create index idx_ai_usage_log_user on public.ai_usage_log(user_id);
create index idx_ai_usage_log_created on public.ai_usage_log(created_at);
create index idx_ai_prompts_role on public.ai_prompts(role, is_active);

-- Vector similarity index (IVFFlat for pgvector)
create index idx_ai_embeddings_vector on public.ai_embeddings
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- ============================================================================
-- RLS
-- ============================================================================

alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_embeddings enable row level security;
alter table public.ai_usage_log enable row level security;
alter table public.ai_prompts enable row level security;

-- AI conversations: users see their own
create policy ai_conversations_select on public.ai_conversations
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      user_id = (select auth.uid())
      or public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
    )
  );

create policy ai_conversations_insert on public.ai_conversations
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and user_id = (select auth.uid())
  );

create policy ai_conversations_update on public.ai_conversations
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and user_id = (select auth.uid())
  )
  with check (tenant_id = public.current_tenant_id());

create policy ai_conversations_delete on public.ai_conversations
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      user_id = (select auth.uid())
      or public.has_role(array['tenant_admin', 'super_admin'])
    )
  );

-- AI messages: via conversation access
create policy ai_messages_select on public.ai_messages
  for select to authenticated
  using (
    exists (
      select 1 from public.ai_conversations c
      where c.id = ai_messages.conversation_id
        and c.tenant_id = public.current_tenant_id()
        and (
          c.user_id = (select auth.uid())
          or public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
        )
    )
  );

create policy ai_messages_insert on public.ai_messages
  for insert to authenticated
  with check (
    exists (
      select 1 from public.ai_conversations c
      where c.id = ai_messages.conversation_id
        and c.tenant_id = public.current_tenant_id()
        and c.user_id = (select auth.uid())
    )
  );

create policy ai_messages_update on public.ai_messages
  for update to authenticated
  using (
    exists (
      select 1 from public.ai_conversations c
      where c.id = ai_messages.conversation_id
        and c.tenant_id = public.current_tenant_id()
        and c.user_id = (select auth.uid())
    )
  );

-- AI embeddings: all tenant users can search
create policy ai_embeddings_select on public.ai_embeddings
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    or tenant_id is null
  );

create policy ai_embeddings_insert on public.ai_embeddings
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    or tenant_id is null
  );

create policy ai_embeddings_delete on public.ai_embeddings
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

-- AI usage log: users see their own, admins see all
create policy ai_usage_log_select on public.ai_usage_log
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      user_id = (select auth.uid())
      or public.has_role(array['tenant_admin', 'super_admin'])
    )
  );

create policy ai_usage_log_insert on public.ai_usage_log
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
  );

-- AI prompts: all can see active; admins manage
create policy ai_prompts_select on public.ai_prompts
  for select to authenticated
  using (is_active = true);

create policy ai_prompts_insert on public.ai_prompts
  for insert to authenticated
  with check (public.has_role(array['super_admin']));

create policy ai_prompts_update on public.ai_prompts
  for update to authenticated
  using (public.has_role(array['super_admin']));

-- ============================================================================
-- TRIGGERS
-- ============================================================================

create trigger trg_ai_conversations_updated_at
  before update on public.ai_conversations
  for each row execute function public.set_updated_at();

-- ============================================================================
-- FUNCTION: Semantic search for context retrieval
-- ============================================================================

create or replace function public.semantic_search(
  p_tenant_id uuid,
  p_query_embedding vector(1536),
  p_match_count integer default 5,
  p_source_type text default null
)
returns table(
  id uuid,
  source_type text,
  source_id uuid,
  content text,
  similarity float
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    e.id,
    e.source_type,
    e.source_id,
    e.content,
    1 - (e.embedding <=> p_query_embedding) as similarity
  from public.ai_embeddings e
  where (e.tenant_id = p_tenant_id or e.tenant_id is null)
    and (p_source_type is null or e.source_type = p_source_type)
  order by e.embedding <=> p_query_embedding
  limit p_match_count;
end;
$$;

-- ============================================================================
-- FUNCTION: Get tenant AI usage stats (for cost control)
-- ============================================================================

create or replace function public.get_tenant_ai_usage(
  p_tenant_id uuid,
  p_period_start date default current_date - interval '30 days',
  p_period_end date default current_date
)
returns table(
  total_requests integer,
  total_tokens integer,
  total_cost_usd numeric,
  by_role jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    count(*)::integer as total_requests,
    coalesce(sum(total_tokens), 0)::integer as total_tokens,
    coalesce(sum(cost_usd), 0)::numeric as total_cost_usd,
    (
      select jsonb_object_agg(role, cnt)
      from (
        select role::text, count(*) as cnt
        from public.ai_usage_log
        where tenant_id = p_tenant_id
          and created_at::date between p_period_start and p_period_end
        group by role
      ) r
    ) as by_role
  from public.ai_usage_log
  where tenant_id = p_tenant_id
    and created_at::date between p_period_start and p_period_end;
end;
$$;

-- ============================================================================
-- SEED: Default AI prompts for each role
-- ============================================================================

insert into public.ai_prompts (role, version, system_prompt, description, max_tokens, temperature) values
(
  'general',
  '1.0.0',
  'You are QualiDji, an AI assistant for ISO 9001 and ISO 22000 quality management. You help users understand requirements, write documents, analyze nonconformities, and prepare for audits. Always respond in the user''s language. Be concise, practical, and reference specific ISO clauses when relevant. Never fabricate information. If you are unsure, say so.',
  'Assistant général pour les questions qualité',
  2000, 0.7
),
(
  'writer',
  '1.0.0',
  'You are a quality document writer. Help the user draft procedures, policies, instructions, and forms that comply with ISO 9001 or ISO 22000. Use clear, simple language. Structure documents with numbered sections. Include purpose, scope, responsibilities, procedure, records, and references. Always respond in the user''s language.',
  'Rédacteur de documents qualité',
  3000, 0.6
),
(
  'gap_analyst',
  '1.0.0',
  'You are a gap analyst. Compare the user''s current practices against ISO requirements and identify gaps. For each gap, provide: the requirement, the current state, the gap, and a recommended action. Prioritize by risk. Always respond in the user''s language.',
  'Analyste d''écarts de conformité',
  2000, 0.5
),
(
  'rca_coach',
  '1.0.0',
  'You are a root cause analysis coach. Guide the user through 5 Whys and Ishikawa (fishbone) analysis. Ask probing questions one at a time. Help identify the true root cause, not symptoms. Suggest corrective actions. Always respond in the user''s language.',
  'Coach d''analyse des causes racines',
  1500, 0.8
),
(
  'explainer',
  '1.0.0',
  'You are an ISO standards explainer. Explain ISO 9001 and ISO 22000 clauses in simple terms adapted to the user''s proficiency level (novice, intermediate, expert). Use analogies and examples relevant to the user''s industry and context (Djibouti, East Africa). Always respond in the user''s language.',
  'Explicateur de clauses ISO',
  1500, 0.7
),
(
  'translator',
  '1.0.0',
  'You are a quality management translator. Translate quality-related text between French, English, Arabic, and Somali. Preserve technical accuracy and ISO terminology. For Arabic, ensure RTL compatibility. Always respond in the user''s language.',
  'Traducteur qualité multilingue',
  2000, 0.3
),
(
  'audit_preparer',
  '1.0.0',
  'You are an audit preparation assistant. Help the user prepare for internal or external audits. Generate checklist questions based on ISO clauses, identify likely audit findings, suggest evidence to prepare, and rehearse common auditor questions. Always respond in the user''s language.',
  'Préparateur d''audit',
  2500, 0.6
);

-- ============================================================================
-- SEED: Sample learning capsules
-- ============================================================================

insert into public.learning_capsules (tenant_id, title, title_en, title_ar, title_so, description, type, lang, duration_minutes, content, is_mandatory, target_level, is_active)
values
(
  null,
  'Bienvenue dans QualiDji',
  'Welcome to QualiDji',
  'مرحبا بك في QualiDji',
  'Soo dhawow QualiDji',
  'Introduction à la plateforme et au management de la qualité',
  'video',
  'fr',
  3,
  '{"module": "onboarding"}'::jsonb,
  true,
  'novice',
  true
),
(
  null,
  'Comprendre une exigence ISO',
  'Understanding an ISO requirement',
  'فهم متطلب ISO',
  'Garashada baahinta ISO',
  'Comment lire et appliquer une exigence de la norme',
  'video',
  'fr',
  5,
  '{"module": "requirements"}'::jsonb,
  false,
  'novice',
  true
),
(
  null,
  'Capturer une preuve efficace',
  'Capturing effective evidence',
  'التقاط دليل فعال',
  'Qabashada caddayn wax ku ool leh',
  'Bonnes pratiques pour les photos, documents et signatures',
  'video',
  'fr',
  4,
  '{"module": "evidence"}'::jsonb,
  true,
  'novice',
  true
),
(
  null,
  'Analyse des causes racines : 5 Pourquoi',
  'Root cause analysis: 5 Whys',
  'تحليل الأسباب الجذرية: 5 لماذا',
  'Falanqeynta sababta asalka ah: 5 Sababta',
  'Méthode des 5 Pourquoi avec exemples pratiques',
  'interactive',
  'fr',
  7,
  '{"module": "rca", "steps": 5}'::jsonb,
  false,
  'intermediate',
  true
),
(
  null,
  'Préparer un audit interne',
  'Preparing for an internal audit',
  'التحضير لتدقيق داخلي',
  'Diyaarinta baaro gudaha',
  'Check-list et bonnes pratiques pour réussir votre audit',
  'video',
  'fr',
  8,
  '{"module": "audit"}'::jsonb,
  false,
  'intermediate',
  true
);

-- ============================================================================
-- SEED: Contextual help entries
-- ============================================================================

insert into public.contextual_help (help_key, level, lang, title, content, sort_order) values
('task.submit', 'novice', 'fr', 'Comment soumettre une tâche', '1. Complétez l''action demandée. 2. Prenez une photo ou téléversez un document comme preuve. 3. Cliquez sur "Soumettre". Votre responsable vérifiera.', 0),
('task.submit', 'intermediate', 'fr', 'Soumission de tâche', 'Complétez, joignez la preuve (niveau minimum indiqué), puis soumettez. La vérification est indépendante.', 0),
('evidence.upload', 'novice', 'fr', 'Comment ajouter une preuve', 'Cliquez sur "Ajouter une preuve". Vous pouvez prendre une photo, téléverser un fichier, ou scanner un code-barres. La preuve est horodatée automatiquement.', 0),
('evidence.upload', 'intermediate', 'fr', 'Ajout de preuve', 'Photo, document, ou signature. Niveau N0 à N5 selon l''exigence. Hash SHA-256 calculé côté client.', 0),
('nc.create', 'novice', 'fr', 'Créer une non-conformité', 'Décrivez ce qui ne va pas. Soyez précis : quoi, où, quand. La plateforme vous guidera pour l''analyse des causes.', 0),
('nc.create', 'intermediate', 'fr', 'Création de NC', 'Description, sévérité, source. Action immédiate de containment recommandée. Analyse causes racines après.', 0),
('diagnostic.start', 'novice', 'fr', 'Démarrer le diagnostic', 'Le diagnostic évalue votre niveau de conformité en 20 questions. Répondez honnêtement pour obtenir un score utile.', 0),
('document.acknowledge', 'novice', 'fr', 'Accuser la lecture d''un document', 'Lisez le document, puis cliquez sur "Accuser lecture". Pour les documents critiques, un quiz de compréhension peut être requis.', 0);
