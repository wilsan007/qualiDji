export type Role = 'admin' | 'quality_manager' | 'site_manager' | 'process_owner' | 'operator' | 'internal_auditor' | 'external_auditor' | 'director' | 'consultant'

export type StepType = 'instruction' | 'text_input' | 'number_input' | 'choice' | 'checkbox' | 'date' | 'signature' | 'photo' | 'file_upload' | 'barcode' | 'qr_scan' | 'sensor_value' | 'location_check' | 'confirmation' | 'knowledge_question' | 'approval'

export interface Action {
  id: string
  workflow_id: string
  action_def_id: string
  assigned_to?: string
  status: 'assigned' | 'in_progress' | 'submitted' | 'approved' | 'blocked' | 'closed'
  tenant_id: string
  due_at?: string
  started_at?: string
  submitted_at?: string
  created_at: string
  workflow_definitions?: any
  workflow_actions?: any
  step_submissions?: any[]
}

export interface WorkflowStep {
  id: string
  action_id: string
  sequence: number
  title: string
  instruction: string
  step_type: StepType
  required: boolean
  validation_rule?: string
  evidence_requirement: string
  ai_guidance_enabled: boolean
  ai_prompt_template?: string
  guardrails: any[]
  choices?: string[]
  approver_role?: string
  segregation_of_duties: boolean
}

export interface MicroStep {
  sub_step: number
  guidance: string
  example: string
  common_mistake: string
  prefill_source?: string
  confidence: number
}

export interface AiGuidance {
  actionId: string
  stepId?: string
  microSteps: MicroStep[]
  sources: string[]
  confidence: number
  interventionId?: string
}

export interface StepSubmission {
  id: string
  action_id: string
  step_id: string
  value: any
  submitted_by?: string
  submitted_at: string
}

export interface Evidence {
  id: string
  action_id: string
  step_submission_id?: string
  kind: 'file' | 'photo' | 'measure' | 'text' | 'system'
  storage_path?: string
  checksum?: string
  value?: any
  captured_by?: string
  captured_at: string
}

export interface Nonconformity {
  id: string
  title: string
  severity: 'minor' | 'major' | 'critical'
  status: 'open' | 'in_progress' | 'closed'
  action_id?: string
  created_by?: string
  created_at: string
}

// ---------------------------------------------------------------------------
// Matrice de traçabilité ISO 9001:2026 (V4 — annexes K & L)
// ---------------------------------------------------------------------------

export type GapStatus =
  | 'not_analyzed'
  | 'not_covered'
  | 'partially_covered'
  | 'ready_to_test'
  | 'tested'
  | 'accepted_with_reserve'
  | 'not_applicable_justified'

export type Applicability = 'applicable' | 'not_applicable' | 'to_review'

export interface MatrixTest {
  id?: string
  kind: 'positive' | 'negative'
  code: string
  scenario?: string | null
  status: 'todo' | 'passed' | 'failed'
  notes?: string | null
  executed_at?: string | null
}

export interface MatrixRequirement {
  id: string
  clause: string
  title: string
  requirement_type: string
  source_ref: string
  process_owner?: string | null
  software_control?: string | null
  objective_evidence?: string | null
  verification_method?: string | null
  spaces: string[]
  workflow_codes: string[]
  assessment?: {
    applicability: Applicability
    na_justification?: string | null
    na_approved_by?: string | null
    na_approved_at?: string | null
    last_reason?: string | null
    updated_at?: string
  } | null
  tests: { positive: MatrixTest | null; negative: MatrixTest | null }
  gap_status: GapStatus
  blocking: boolean
  blocking_reasons: string[]
}

export interface CoverageBucket {
  scope: string
  label: string
  applicable: number
  not_analyzed: number
  not_covered: number
  partially_covered: number
  ready_to_test: number
  tested: number
  accepted_with_reserve: number
  na_justified: number
  tested_pos: number
  tested_neg: number
  blocking_gaps: number
}

export interface MatrixValidation {
  id: string
  matrix_version: number
  perimeter: string
  expert_name: string
  expert_role: string
  decision: 'validated' | 'validated_with_reserve' | 'refused'
  reserves: string | null
  decided_at: string
}

export interface MatrixCoverage {
  totals: CoverageBucket
  clauses: CoverageBucket[]
  spaces: CoverageBucket[]
  validations: MatrixValidation[]
}
