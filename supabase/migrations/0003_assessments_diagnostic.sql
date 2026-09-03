-- ============================================================================
-- Migration 0003: Assessments, diagnostic, and compliance score
-- ============================================================================
-- Tables: assessments, assessment_items, diagnostic_questions, diagnostic_responses
-- Functions: compute_compliance(tenant_id, standard_id)
-- ============================================================================

-- ============================================================================
-- ENUMS
-- ============================================================================

create type assessment_score as enum ('0', '1', '2', '3', '4');
-- 0 = non couvert, 1 = initié, 2 = partiel, 3 = largement, 4 = pleinement

-- ============================================================================
-- TABLES — Self-assessment campaigns
-- ============================================================================

create table public.assessments (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  standard_id uuid not null references public.standards(id),
  name text not null,
  type text not null default 'self',  -- 'self', 'diagnostic', 'pre_audit'
  started_at timestamptz not null default now(),
  closed_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.assessment_items (
  id uuid primary key default uuid_generate_v4(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  requirement_id uuid not null references public.requirements(id),
  score assessment_score,
  comment text,
  evidence_ids uuid[] not null default '{}'::uuid[],
  assessed_by uuid references auth.users(id),
  assessed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(assessment_id, requirement_id)
);

-- ============================================================================
-- TABLES — Diagnostic questionnaire (Guided mode)
-- ============================================================================

-- Diagnostic questions (editor data, filtered by sector/size)
create table public.diagnostic_questions (
  id text primary key,
  standard_id uuid not null references public.standards(id),
  requirement_id uuid references public.requirements(id),
  question text not null,
  question_en text,
  question_ar text,
  question_so text,
  help_text text,
  help_text_en text,
  help_text_ar text,
  help_text_so text,
  sector_filter text[],     -- null = all sectors
  size_filter text[],       -- null = all sizes
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- Diagnostic responses (per tenant, per diagnostic campaign)
create table public.diagnostic_responses (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  question_id text not null references public.diagnostic_questions(id),
  assessment_id uuid references public.assessments(id) on delete cascade,
  response assessment_score not null,
  comment text,
  responded_by uuid references auth.users(id),
  responded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(tenant_id, question_id, assessment_id)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

create index idx_assessments_tenant on public.assessments(tenant_id);
create index idx_assessments_standard on public.assessments(standard_id);
create index idx_assessment_items_assessment on public.assessment_items(assessment_id);
create index idx_assessment_items_requirement on public.assessment_items(requirement_id);
create index idx_diagnostic_questions_standard on public.diagnostic_questions(standard_id);
create index idx_diagnostic_responses_tenant on public.diagnostic_responses(tenant_id);
create index idx_diagnostic_responses_question on public.diagnostic_responses(question_id);

-- ============================================================================
-- RLS
-- ============================================================================

alter table public.assessments enable row level security;
alter table public.assessment_items enable row level security;
alter table public.diagnostic_questions enable row level security;
alter table public.diagnostic_responses enable row level security;

-- Diagnostic questions: editor data, readable by all
create policy diagnostic_questions_select on public.diagnostic_questions
  for select to authenticated using (true);

-- Assessments: filtered by tenant
create policy assessments_select on public.assessments
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy assessments_insert on public.assessments
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'director', 'super_admin'])
  );

create policy assessments_update on public.assessments
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
  );

create policy assessments_delete on public.assessments
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

-- Assessment items: filtered by tenant (through assessment)
create policy assessment_items_select on public.assessment_items
  for select to authenticated
  using (
    exists (
      select 1 from public.assessments a
      where a.id = assessment_items.assessment_id
        and a.tenant_id = public.current_tenant_id()
    )
  );

create policy assessment_items_insert on public.assessment_items
  for insert to authenticated
  with check (
    exists (
      select 1 from public.assessments a
      where a.id = assessment_items.assessment_id
        and a.tenant_id = public.current_tenant_id()
    )
  );

create policy assessment_items_update on public.assessment_items
  for update to authenticated
  using (
    exists (
      select 1 from public.assessments a
      where a.id = assessment_items.assessment_id
        and a.tenant_id = public.current_tenant_id()
    )
  )
  with check (
    exists (
      select 1 from public.assessments a
      where a.id = assessment_items.assessment_id
        and a.tenant_id = public.current_tenant_id()
    )
  );

create policy assessment_items_delete on public.assessment_items
  for delete to authenticated
  using (
    exists (
      select 1 from public.assessments a
      where a.id = assessment_items.assessment_id
        and a.tenant_id = public.current_tenant_id()
    )
  );

-- Diagnostic responses: filtered by tenant
create policy diagnostic_responses_select on public.diagnostic_responses
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy diagnostic_responses_insert on public.diagnostic_responses
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id());

create policy diagnostic_responses_update on public.diagnostic_responses
  for update to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

create policy diagnostic_responses_delete on public.diagnostic_responses
  for delete to authenticated
  using (tenant_id = public.current_tenant_id());

-- ============================================================================
-- FUNCTION: compute_compliance
-- ============================================================================
-- For each applicable requirement, aggregates the links (documents, records,
-- tasks, audits, actions) weighted by evidence level, returns a score 0-100
-- per requirement, clause, and chapter.
-- ============================================================================

create or replace function public.compute_compliance(
  p_tenant_id uuid,
  p_standard_id uuid
)
returns table(
  requirement_id uuid,
  clause_number text,
  clause_title text,
  chapter text,
  score integer,
  evidence_count integer,
  has_assessment boolean,
  assessment_score integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assessment_id uuid;
begin
  -- Get the latest assessment for this tenant + standard
  select id into v_assessment_id
  from public.assessments
  where tenant_id = p_tenant_id
    and standard_id = p_standard_id
    and closed_at is not null
  order by closed_at desc
  limit 1;

  return query
  with applicable_reqs as (
    select
      r.id as requirement_id,
      r.clause_id,
      c.number as clause_number,
      c.title as clause_title,
      left(c.number, position('.' in c.number) - 1) as chapter,
      tr.evidence_level_min
    from public.requirements r
    join public.clauses c on c.id = r.clause_id
    left join public.tenant_requirements tr
      on tr.requirement_id = r.id and tr.tenant_id = p_tenant_id
    where c.standard_id = p_standard_id
      and (tr.applicable is null or tr.applicable = true)
  ),
  evidence_counts as (
    select
      ar.requirement_id,
      count(rl.id) as evidence_count
    from applicable_reqs ar
    left join public.requirement_links rl
      on rl.requirement_id = ar.requirement_id
      and rl.tenant_id = p_tenant_id
    group by ar.requirement_id
  ),
  assessment_scores as (
    select
      ai.requirement_id,
      (ai.score::text::integer) as assessment_score
    from public.assessment_items ai
    where ai.assessment_id = v_assessment_id
  )
  select
    ar.requirement_id,
    ar.clause_number,
    ar.clause_title,
    ar.chapter,
    case
      when asp.assessment_score is not null then
        round((asp.assessment_score::float / 4.0 * 100)::integer)
      when ec.evidence_count > 0 then
        least(60 + ec.evidence_count * 10, 100)
      else 0
    end as score,
    coalesce(ec.evidence_count, 0) as evidence_count,
    (asp.assessment_score is not null) as has_assessment,
    coalesce(asp.assessment_score, 0) as assessment_score
  from applicable_reqs ar
  left join evidence_counts ec on ec.requirement_id = ar.requirement_id
  left join assessment_scores asp on asp.requirement_id = ar.requirement_id
  order by ar.clause_number;
end;
$$;

-- ============================================================================
-- FUNCTION: compute_compliance_summary
-- ============================================================================
-- Returns aggregated scores per chapter and overall
-- ============================================================================

create or replace function public.compute_compliance_summary(
  p_tenant_id uuid,
  p_standard_id uuid
)
returns table(
  chapter text,
  chapter_title text,
  avg_score numeric,
  requirement_count integer,
  covered_count integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with compliance as (
    select * from public.compute_compliance(p_tenant_id, p_standard_id)
  )
  select
    c.chapter,
    max(c.clause_title) as chapter_title,
    round(avg(c.score), 1) as avg_score,
    count(*) as requirement_count,
    count(*) filter (where c.score >= 60) as covered_count
  from compliance c
  group by c.chapter
  order by c.chapter;
end;
$$;

-- ============================================================================
-- SEED: Diagnostic questions for ISO 9001 (subset, ~30 key questions)
-- ============================================================================

insert into public.diagnostic_questions (id, standard_id, requirement_id, question, question_en, question_ar, question_so, help_text, help_text_en, sort_order) values
-- Context
('dq-001', '90000000-0000-0000-0000-000000000001', null,
 'Avez-vous identifié les enjeux internes et externes qui influencent votre capacité à fournir un produit/service conforme ?',
 'Have you identified internal and external issues that affect your ability to deliver conforming products/services?',
 'هل حددت القضايا الداخلية والخارجية التي تؤثر على قدرتك على تقديم منتج/خدمة مطابقة؟',
 'Ma qabtaa arrimaha gudaha iyo dibadda ee saameynaya awoodaada in aad bixiso alaab/adeeg la mid ah?',
 'Pensez à la concurrence, la réglementation, le climat économique, la technologie.', 'Think about competition, regulations, economy, technology.', 1),

('dq-002', '90000000-0000-0000-0000-000000000001', null,
 'Avez-vous identifié les parties intéressées (clients, employés, fournisseurs, autorités) et leurs attentes ?',
 'Have you identified interested parties and their expectations?',
 'هل حددت الأطراف المعنية وتوقعاتها؟',
 'Ma qabtaa dhinacyada xiisaynaya iyo rajadooda?',
 'Listez tous ceux qui ont un intérêt dans votre entreprise.', 'List everyone with an interest in your company.', 2),

('dq-003', '90000000-0000-0000-0000-000000000001', null,
 'Avez-vous un document écrit qui définit le périmètre de votre système de management de la qualité ?',
 'Do you have a written document defining the scope of your QMS?',
 'هل لديك وثيقة مكتوبة تحدد نطاق نظام إدارة الجودة؟',
 'Ma haysaa warqad qoran oo ujeedada nidaamka tayada qabta?',
 'Le périmètre décrit quels produits/services et quels sites sont concernés.', 'Scope describes which products/services and sites are covered.', 3),

-- Leadership
('dq-004', '90000000-0000-0000-0000-000000000001', null,
 'Votre direction s''engage-t-elle activement dans la gestion de la qualité ?',
 'Does your top management actively commit to quality management?',
 'هل تلتزم إدارتك بنشاط بإدارة الجودة؟',
 'Ma maamulkaagu ma xilsaaranayaa maamulka tayada si firfircoon?',
 'La direction participe aux revues, alloue des ressources, communique sur la qualité.', 'Management participates in reviews, allocates resources, communicates on quality.', 4),

('dq-005', '90000000-0000-0000-0000-000000000001', null,
 'Avez-vous une politique qualité écrite et communiquée à tout le personnel ?',
 'Do you have a written quality policy communicated to all staff?',
 'هل لديك سياسة جودة مكتوبة ومتواصلة لجميع الموظفين؟',
 'Ma haysaa siyaasadda tayada qoran oo la gudbiyay dhamaan shaqaalaha?',
 'La politique est une déclaration courte de vos engagements qualité.', 'The policy is a short statement of your quality commitments.', 5),

-- Planning
('dq-006', '90000000-0000-0000-0000-000000000001', null,
 'Avez-vous identifié les risques et opportunités pour votre entreprise ?',
 'Have you identified risks and opportunities for your company?',
 'هل حددت المخاطر والفرص لشركتك؟',
 'Ma qabtaa khataraha iyo fursadaha ee shirkaddaada?',
 'Pensez à ce qui pourrait mal se passer et à ce qui pourrait vous aider.', 'Think about what could go wrong and what could help you.', 6),

('dq-007', '90000000-0000-0000-0000-000000000001', null,
 'Avez-vous des objectifs qualité mesurables (ex: réduire les erreurs de 20%) ?',
 'Do you have measurable quality objectives?',
 'هل لديك أهداف جودة قابلة للقياس؟',
 'Ma haysaa hadda tayada la cabiri karo?',
 'Les objectifs doivent être SMART: Spécifiques, Mesurables, Atteignables, Réalistes, Temporels.', 'Objectives should be SMART: Specific, Measurable, Achievable, Realistic, Time-bound.', 7),

-- Support
('dq-008', '90000000-0000-0000-0000-000000000001', null,
 'Avez-vous un système de gestion documentaire (procédures, instructions, enregistrements) ?',
 'Do you have a document management system?',
 'هل لديك نظام إدارة الوثائق؟',
 'Ma haysaa nidaam maamulka dukumiintiga?',
 'Vos documents sont-ils versionnés, validés et diffusés ?', 'Are your documents versioned, approved and distributed?', 8),

('dq-009', '90000000-0000-0000-0000-000000000001', null,
 'Avez-vous une matrice de compétences pour votre personnel ?',
 'Do you have a competence matrix for your staff?',
 'هل لديك مصفوفة كفاءات لموظفيك؟',
 'Ma haysaa matriis xirfadaha shaqaalahaaga?',
 'Pour chaque poste, quelles compétences sont nécessaires et qui les a ?', 'For each position, what skills are needed and who has them?', 9),

('dq-010', '90000000-0000-0000-0000-000000000001', null,
 'Vos équipements de mesure sont-ils étalonnés régulièrement ?',
 'Are your measuring equipment calibrated regularly?',
 'هل تم معايرة معدات القياس بانتظام؟',
 'Ma qalabkaaga cabirka ma cabbiro la sameeyay si joogto ah?',
 'Thermomètres, balances, instruments de mesure doivent être vérifiés.', 'Thermometers, scales, measuring instruments must be checked.', 10),

-- Operations
('dq-011', '90000000-0000-0000-0000-000000000001', null,
 'Vérifiez-vous les exigences du client avant d''accepter une commande ?',
 'Do you review customer requirements before accepting an order?',
 'هل تراجع متطلبات العميل قبل قبول الطلب؟',
 'Ma dib-u-eegaysaa baahiyaha macmiilka ka hor inta aadan aqbashan dalabka?',
 'Assurez-vous de pouvoir répondre aux exigences avant de vous engager.', 'Make sure you can meet requirements before committing.', 11),

('dq-012', '90000000-0000-0000-0000-000000000001', null,
 'Avez-vous des critères écrits pour sélectionner et évaluer vos fournisseurs ?',
 'Do you have written criteria for supplier selection and evaluation?',
 'هل لديك معايير مكتوبة لاختيار وتقييم الموردين؟',
 'Ma haysaa shuruudo qoran lagu doortayo iyo lagu qiimaynayo beeyada?',
 'Quels critères: qualité, délai, prix, certifications ?', 'What criteria: quality, delivery, price, certifications?', 12),

('dq-013', '90000000-0000-0000-0000-000000000001', null,
 'Contrôlez-vous vos produits/services avant de les livrer au client ?',
 'Do you inspect products/services before delivery to customer?',
 'هل تفحص المنتجات/الخدمات قبل التسليم للعميل؟',
 'Ma baaraysaa alaabta/adeegyada ka hor inta aadan u gudbin macmiilka?',
 'Contrôle final, critères d''acceptation, enregistrement des résultats.', 'Final inspection, acceptance criteria, recorded results.', 13),

('dq-014', '90000000-0000-0000-0000-000000000001', null,
 'Comment gérez-vous les produits ou services non conformes ?',
 'How do you manage nonconforming products or services?',
 'كيف تدير المنتجات أو الخدمات غير المطابقة؟',
 'Sideed u maamushaa alaabta ama adeegyada aan la mid ahayn?',
 'Ségrégation, décision (rebut, reprise, acceptation dérogatoire), enregistrement.', 'Segregation, decision (scrap, rework, concession), records.', 14),

-- Evaluation
('dq-015', '90000000-0000-0000-0000-000000000001', null,
 'Mesurez-vous la satisfaction de vos clients ?',
 'Do you measure customer satisfaction?',
 'هل تقيس رضا عملائك؟',
 'Ma cabiraysaa qancinimada macmiilashaaga?',
 'Enquêtes, feedback, réclamations, NPS.', 'Surveys, feedback, complaints, NPS.', 15),

('dq-016', '90000000-0000-0000-0000-000000000001', null,
 'Réalisez-vous des audits internes régulièrement ?',
 'Do you conduct internal audits regularly?',
 'هل تجري تدقيقات داخلية بانتظام؟',
 'Ma sameysaa baarista gudaha si joogto ah?',
 'Vérification que votre système qualité fonctionne comme prévu.', 'Verification that your QMS works as intended.', 16),

('dq-017', '90000000-0000-0000-0000-000000000001', null,
 'Tenez-vous une revue de direction au moins une fois par an ?',
 'Do you hold a management review at least annually?',
 'هل تعقد مراجعة إدارة مرة واحدة على الأقل سنوياً؟',
 'Ma sameysaa dib-u-eegis maamul ah ugu yaraan sanad kii?',
 'La direction fait le point sur le système qualité avec les données.', 'Management reviews the QMS with data.', 17),

-- Improvement
('dq-018', '90000000-0000-0000-0000-000000000001', null,
 'Avez-vous un processus pour traiter les non-conformités et mener des actions correctives ?',
 'Do you have a process for handling nonconformities and corrective actions?',
 'هل لديك عملية لمعالجة عدم المطابقة واتخاذ إجراءات تصحيحية؟',
 'Ma haysaa habka lagu maamulo khaladaadka iyo hawlgallo saxda ah?',
 'Identifier la cause, corriger, vérifier l''efficacité.', 'Identify cause, correct, verify effectiveness.', 18),

('dq-019', '90000000-0000-0000-0000-000000000001', null,
 'Cherchez-vous activement à améliorer votre système en continu ?',
 'Do you actively seek to continually improve your system?',
 'هل تبحث بنشاط عن تحسين نظامك باستمرار؟',
 'Ma firfircoon baan u raadinaysaa hagaajinta nidaamkaaga sii socda?',
 'Amélioration des processus, produits, satisfaction client.', 'Process, product, customer satisfaction improvement.', 19),

('dq-020', '90000000-0000-0000-0000-000000000001', null,
 'Avez-vous déjà été certifié ISO 9001 ou une autre norme ISO ?',
 'Have you been previously certified to ISO 9001 or another ISO standard?',
 'هل تم اعتمادك سابقاً لـ ISO 9001 أو معيار ISO آخر؟',
 'Ma horey u lahayd shahaadada ISO 9001 ama standard ISO kale?',
 'Si oui, quand et par quel organisme ?', 'If yes, when and by which body?', 20);
