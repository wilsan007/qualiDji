-- ============================================================================
-- Migration 0020: Billing, pricing tiers, self-service onboarding
-- ============================================================================
-- Sprint 23: Industrialisation
-- Tables: subscription_plans, subscriptions, invoices, payments,
--         usage_tracking, onboarding_flows
-- ============================================================================

-- ============================================================================
-- ENUMS
-- ============================================================================

create type plan_tier as enum ('discovery', 'tpe', 'pme', 'enterprise');

create type subscription_status as enum (
  'trialing', 'active', 'past_due', 'canceled', 'expired', 'suspended'
);

create type invoice_status as enum ('draft', 'sent', 'paid', 'overdue', 'void', 'refunded');

create type payment_method as enum ('card', 'bank_transfer', 'mobile_money', 'cash', 'other');

create type payment_status as enum ('pending', 'succeeded', 'failed', 'refunded');

create type onboarding_step_status as enum ('pending', 'in_progress', 'completed', 'skipped');

-- ============================================================================
-- TABLES
-- ============================================================================

create table public.subscription_plans (
  id uuid primary key default uuid_generate_v4(),
  tier plan_tier not null unique,
  name text not null,
  name_fr text,
  name_en text,
  name_ar text,
  name_so text,
  description text,
  -- Pricing
  price_monthly_usd numeric(10,2) not null default 0,
  price_yearly_usd numeric(10,2) not null default 0,
  currency text not null default 'USD',
  -- Limits
  max_sites integer not null default 1,
  max_users integer,                -- null = unlimited
  max_storage_mb integer,           -- null = unlimited
  max_ai_requests_month integer not null default 100,
  -- Features
  features jsonb not null default '{}'::jsonb,  -- {module: enabled}
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.subscriptions (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  plan_id uuid not null references public.subscription_plans(id) on delete restrict,
  status subscription_status not null default 'trialing',
  -- Billing cycle
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz not null default now() + interval '30 days',
  trial_ends_at timestamptz,
  -- Cancellation
  canceled_at timestamptz,
  cancel_reason text,
  -- Payment method on file
  default_payment_method text,      -- payment method reference
  -- Metadata
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id)
);

create table public.invoices (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  number text not null unique,      -- invoice number: INV-2024-001
  status invoice_status not null default 'draft',
  -- Line items
  items jsonb not null default '[]'::jsonb,  -- [{description, quantity, unit_price, total}]
  subtotal numeric(10,2) not null default 0,
  tax_rate numeric not null default 0,
  tax_amount numeric(10,2) not null default 0,
  total numeric(10,2) not null default 0,
  currency text not null default 'USD',
  -- Dates
  issue_date date not null default current_date,
  due_date date not null default current_date + 30,
  paid_at timestamptz,
  -- Notes
  notes text,
  -- PDF
  pdf_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  invoice_id uuid references public.invoices(id) on delete set null,
  amount numeric(10,2) not null,
  currency text not null default 'USD',
  method payment_method not null default 'card',
  status payment_status not null default 'pending',
  -- Transaction reference
  transaction_id text,              -- gateway transaction ID
  gateway text,                     -- 'stripe', 'dmoney', 'waafi', 'cacpay', 'manual'
  -- Metadata
  processed_at timestamptz,
  failure_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.usage_tracking (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  -- Usage metrics
  ai_requests integer not null default 0,
  ai_tokens_used integer not null default 0,
  storage_used_mb numeric not null default 0,
  active_users integer not null default 0,
  documents_created integer not null default 0,
  tasks_completed integer not null default 0,
  audits_completed integer not null default 0,
  -- Computed at period end
  computed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id, period_start)
);

create table public.onboarding_flows (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  -- Onboarding type
  flow_type text not null default 'standard',  -- standard, tpe, pme, enterprise
  -- Steps (each step has a key, status, and completed_at)
  steps jsonb not null default '[]'::jsonb,  -- [{key, title, status, completed_at}]
  -- Progress
  current_step integer not null default 0,
  total_steps integer not null default 10,
  completion_percentage numeric not null default 0,
  -- Status
  is_completed boolean not null default false,
  completed_at timestamptz,
  -- Assigned to
  assigned_to uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

create index idx_subscription_plans_tier on public.subscription_plans(tier);
create index idx_subscriptions_tenant on public.subscriptions(tenant_id);
create index idx_subscriptions_status on public.subscriptions(status);
create index idx_invoices_tenant on public.invoices(tenant_id);
create index idx_invoices_status on public.invoices(status);
create index idx_invoices_number on public.invoices(number);
create index idx_payments_tenant on public.payments(tenant_id);
create index idx_payments_invoice on public.payments(invoice_id);
create index idx_payments_status on public.payments(status);
create index idx_usage_tracking_tenant on public.usage_tracking(tenant_id);
create index idx_usage_tracking_period on public.usage_tracking(period_start);
create index idx_onboarding_flows_tenant on public.onboarding_flows(tenant_id);

-- ============================================================================
-- RLS
-- ============================================================================

alter table public.subscription_plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.invoices enable row level security;
alter table public.payments enable row level security;
alter table public.usage_tracking enable row level security;
alter table public.onboarding_flows enable row level security;

-- Subscription plans: all authenticated users can see (public pricing)
create policy subscription_plans_select on public.subscription_plans
  for select to authenticated
  using (is_active = true);

create policy subscription_plans_insert on public.subscription_plans
  for insert to authenticated
  with check (public.has_role(array['super_admin']));

create policy subscription_plans_update on public.subscription_plans
  for update to authenticated
  using (public.has_role(array['super_admin']));

-- Subscriptions: tenant admins can see/manage
create policy subscriptions_select on public.subscriptions
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

create policy subscriptions_insert on public.subscriptions
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

create policy subscriptions_update on public.subscriptions
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  )
  with check (tenant_id = public.current_tenant_id());

-- Invoices: tenant admins can see
create policy invoices_select on public.invoices
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

create policy invoices_insert on public.invoices
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id());

create policy invoices_update on public.invoices
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  )
  with check (tenant_id = public.current_tenant_id());

-- Payments: tenant admins can see
create policy payments_select on public.payments
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

create policy payments_insert on public.payments
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id());

-- Usage tracking: tenant admins can see
create policy usage_tracking_select on public.usage_tracking
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

create policy usage_tracking_insert on public.usage_tracking
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id());

create policy usage_tracking_update on public.usage_tracking
  for update to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- Onboarding flows: all tenant users can see
create policy onboarding_flows_select on public.onboarding_flows
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy onboarding_flows_insert on public.onboarding_flows
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id());

create policy onboarding_flows_update on public.onboarding_flows
  for update to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- ============================================================================
-- TRIGGERS
-- ============================================================================

create trigger trg_subscription_plans_updated_at
  before update on public.subscription_plans
  for each row execute function public.set_updated_at();

create trigger trg_subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

create trigger trg_invoices_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at();

create trigger trg_usage_tracking_updated_at
  before update on public.usage_tracking
  for each row execute function public.set_updated_at();

create trigger trg_onboarding_flows_updated_at
  before update on public.onboarding_flows
  for each row execute function public.set_updated_at();

-- ============================================================================
-- FUNCTION: Update onboarding completion percentage
-- ============================================================================

create or replace function public.update_onboarding_progress(p_flow_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_flow record;
  v_completed integer;
  v_percentage numeric;
begin
  select * into v_flow from public.onboarding_flows where id = p_flow_id;
  if not found then return 0; end if;

  v_completed := (
    select count(*) from jsonb_array_elements(v_flow.steps)
    where value->>'status' = 'completed'
  );

  v_percentage := case when v_flow.total_steps > 0 then
    round((v_completed::numeric / v_flow.total_steps) * 100, 2)
  else 0 end;

  update public.onboarding_flows
  set completion_percentage = v_percentage,
      current_step = v_completed,
      is_completed = (v_completed >= v_flow.total_steps),
      completed_at = case when v_completed >= v_flow.total_steps then now() else null end
  where id = p_flow_id;

  return v_percentage;
end;
$$;

-- ============================================================================
-- SEED: Subscription plans (4 tiers from the plan)
-- ============================================================================

insert into public.subscription_plans (tier, name, name_fr, name_en, name_ar, name_so, description, price_monthly_usd, price_yearly_usd, max_sites, max_users, max_storage_mb, max_ai_requests_month, features) values
(
  'discovery',
  'Découverte',
  'Découverte',
  'Discovery',
  'اكتشاف',
  'Ogaanshaha',
  'Gratuit pour découvrir la qualité — co-brandé ADNQ',
  0, 0,
  1, 5, 500, 10,
  '{"diagnostic": true, "requirements": true, "tasks": true, "documents": false, "audits": false, "nc": false, "ai": false, "external_auditor": false}'::jsonb
),
(
  'tpe',
  'TPE',
  'TPE',
  'SME',
  'مؤسسة صغيرة',
  'TPE',
  'Pour les très petites entreprises — accompagnement guidé',
  49, 490,
  1, 10, 5000, 100,
  '{"diagnostic": true, "requirements": true, "tasks": true, "documents": true, "audits": true, "nc": true, "ai": true, "external_auditor": false, "haccp": false}'::jsonb
),
(
  'pme',
  'PME',
  'PME',
  'SME',
  'مؤسسة متوسطة',
  'PME',
  'Pour les PME — toutes les fonctionnalités ISO 9001 + 22000',
  149, 1490,
  3, 50, 25000, 1000,
  '{"diagnostic": true, "requirements": true, "tasks": true, "documents": true, "audits": true, "nc": true, "ai": true, "external_auditor": true, "haccp": true, "api": true, "multi_site": true}'::jsonb
),
(
  'enterprise',
  'Entreprise',
  'Entreprise',
  'Enterprise',
  'مؤسسة كبيرة',
  'Enterprise',
  'Pour les grands comptes — multi-sites, API, auto-hébergement',
  499, 4990,
  50, null, null, 10000,
  '{"diagnostic": true, "requirements": true, "tasks": true, "documents": true, "audits": true, "nc": true, "ai": true, "external_auditor": true, "haccp": true, "api": true, "multi_site": true, "consolidated_reports": true, "self_hosted": true, "sso": true}'::jsonb
);
