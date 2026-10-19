-- ============================================================================
-- Seed 0001: Priorité absolue spec — WF_CONTEXT_ANALYSIS (Clause 4.1)
-- + ACT_CTX_001 + 4 steps + prompt templates CTX_*
-- ============================================================================

-- Workflow métier (définie par le RQ, versionné)
insert into public.workflow_definitions (id, name, standard_clause, version, owner_role, frequency, is_active)
values (
  'WF_CONTEXT_ANALYSIS',
  'Analyse du contexte organisationnel',
  '4.1',
  1,
  'quality_manager',
  'annual',
  true
);

-- Action principale ACT_CTX_001
insert into public.workflow_actions (id, workflow_id, title, objective, assigned_role, sort_order)
values (
  'ACT_CTX_001',
  'WF_CONTEXT_ANALYSIS',
  'Identifier les facteurs internes et externes',
  'Documenter les enjeux internes/externes pour le contexte du SMQ',
  'process_owner',
  1
);

-- Step 1 : facteurs internes
insert into public.workflow_steps (id, action_id, sequence, title, instruction, step_type, required, validation_rule, evidence_requirement, ai_guidance_enabled, ai_prompt_template, guardrails, choices)
values (
  'ST_CTX_001_01',
  'ACT_CTX_001',
  1,
  'Lister les facteurs internes',
  'Identifiez les facteurs internes affectant votre capacité à atteindre les résultats attendus (culture, organisation, compétences, processus)',
  'text_input',
  true,
  'min_length:50',
  'auto_save',
  true,
  'CTX_INTERNAL_FACTORS',
  '[]'::jsonb,
  null
);

-- Step 2 : facteurs externes
insert into public.workflow_steps (id, action_id, sequence, title, instruction, step_type, required, validation_rule, evidence_requirement, ai_guidance_enabled, ai_prompt_template, guardrails, choices)
values (
  'ST_CTX_001_02',
  'ACT_CTX_001',
  2,
  'Lister les facteurs externes',
  'Identifiez les facteurs externes (marché, réglementation, technologie, climat si applicable)',
  'text_input',
  true,
  'min_length:50',
  'auto_save',
  true,
  'CTX_EXTERNAL_FACTORS',
  '[]'::jsonb,
  null
);

-- Step 3 : pertinence changement climatique (amendement 2024) + guardrail
insert into public.workflow_steps (id, action_id, sequence, title, instruction, step_type, required, validation_rule, evidence_requirement, ai_guidance_enabled, ai_prompt_template, guardrails, choices)
values (
  'ST_CTX_001_03',
  'ACT_CTX_001',
  3,
  'Déterminer la pertinence du changement climatique',
  'L organisation doit déterminer si le changement climatique est un enjeu pertinent (Amendement 2024)',
  'choice',
  true,
  null,
  'auto_save',
  false,
  null,
  '[{"condition":"choice == ''non_pertinent''","action":"require_justification","min_length":100}]'::jsonb,
  '["pertinent","non_pertinent","a_evaluer"]'::jsonb
);

-- Step 4 : approbation avec ségrégation des rôles
insert into public.workflow_steps (id, action_id, sequence, title, instruction, step_type, required, validation_rule, evidence_requirement, ai_guidance_enabled, ai_prompt_template, guardrails, choices, approver_role, segregation_of_duties)
values (
  'ST_CTX_001_04',
  'ACT_CTX_001',
  4,
  'Valider l analyse',
  'Validez l analyse du contexte organisationnel',
  'approval',
  true,
  null,
  'auto_save',
  false,
  null,
  '[]'::jsonb,
  null,
  'quality_manager',
  true
);
-- Prompt template CTX_INTERNAL_FACTORS (Clause 4.1)
insert into public.ai_prompt_templates (id, clause, template)
values (
  'CTX_INTERNAL_FACTORS',
  '4.1',
  'Contexte : Vous êtes un assistant qualité pour l employe {user_name} du site {site_name}. Action assignée : {action_title} — {action_objective}. Contexte organisationnel : {organization_context}. Processus du site : {process_list}. Historique NC récent : {recent_nc_summary}. INSTRUCTION : Décomposez l étape "{step_title}" en guidage terrain. RÈGLES : Ne suggérez jamais de nouveau processus ou exigence. Basez-vous uniquement sur les processus existants listés ci-dessus. Proposez des exemples concrets du secteur {industry}. Mentionnez les erreurs fréquentes observées dans l historique. Si une information manque, indiquez "À compléter par {assigned_role}". FORMAT DE SORTIE (JSON) : { "micro_steps": [ { "sub_step": 1, "guidance": "...", "example": "...", "common_mistake": "...", "prefill_source": "...", "confidence": 0.92 } ], "sources_used": ["Process_P001", "NC_2026_034"] }'
);

-- Prompt template CTX_EXTERNAL_FACTORS (Clause 4.1)
insert into public.ai_prompt_templates (id, clause, template)
values (
  'CTX_EXTERNAL_FACTORS',
  '4.1',
  'Contexte : Vous êtes un assistant qualité. Action assignée : {action_title}. Contexte externe : marché, réglementation, technologie, climat. INSTRUCTION : Décomposez l étape "{step_title}" en guidage terrain. RÈGLES : Ne suggérez jamais de nouveau processus ou exigence. Basez-vous uniquement sur les données réglementaires et de marché connues. FORMAT DE SORTIE (JSON) : { "micro_steps": [ { "sub_step": 1, "guidance": "...", "example": "...", "common_mistake": "...", "prefill_source": "...", "confidence": 0.9 } ], "sources_used": ["regulatory_watch", "market_data"] }'
);

-- Index de performance spec
create index idx_workflow_steps_action_seq on public.workflow_steps (action_id, sequence);
create index idx_ai_interventions_tenant_created on public.ai_interventions (tenant_id, created_at desc);

