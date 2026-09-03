-- ============================================================================
-- Migration 0014: ISO 22000 — PRP library, SDA team, products, allergens
-- ============================================================================
-- Sprint 17: ISO 22000:2018 foundation
-- Tables: prp_library, prp_instances, sda_team, products, allergens,
--         product_allergens, food_safety_management_systems
-- ============================================================================

-- ============================================================================
-- ENUMS
-- ============================================================================

create type prp_category as enum (
  'infrastructure', 'workplace', 'equipment', 'maintenance',
  'cleaning', 'pest_control', 'waste', 'water', 'air',
  'personnel', 'training', 'purchasing', 'transport', 'storage',
  'communication', 'other'
);

create type prp_status as enum ('active', 'inactive', 'under_review');

create type product_category as enum (
  'raw_material', 'ingredient', 'packaging', 'finished_product',
  'semi_finished', 'cleaning_chemical', 'water', 'other'
);

create type allergen_type as enum (
  'gluten', 'crustaceans', 'eggs', 'fish', 'peanuts', 'soy',
  'milk', 'nuts', 'celery', 'mustard', 'sesame', 'sulphites',
  'lupin', 'molluscs'
);

create type sda_role as enum (
  'team_leader', 'deputy_leader', 'member', 'secretary', 'advisor'
);

-- ============================================================================
-- TABLES
-- ============================================================================

create table public.prp_library (
  id uuid primary key default uuid_generate_v4(),
  code text not null,              -- e.g. 'PRP-01', 'PRP-02'
  title text not null,
  title_en text,
  title_ar text,
  title_so text,
  category prp_category not null,
  description text not null,
  iso_reference text,              -- e.g. 'ISO/TS 22002-1 §4'
  default_tasks jsonb not null default '[]'::jsonb,  -- task templates
  default_frequency text,          -- 'daily', 'weekly', 'monthly'
  applicable_to text[] not null default '{}'::text[],  -- sectors: 'bakery', 'import', 'restaurant'
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.prp_instances (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  prp_library_id uuid references public.prp_library(id) on delete set null,
  code text not null,
  title text not null,
  status prp_status not null default 'active',
  implementation_details text,
  responsible_id uuid references auth.users(id) on delete set null,
  verification_method text,
  linked_task_ids uuid[] not null default '{}'::uuid[],
  activated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id, code)
);

create table public.sda_team (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role sda_role not null,
  assigned_at timestamptz not null default now(),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(tenant_id, user_id)
);

create table public.products (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  code text not null,
  category product_category not null default 'finished_product',
  description text,
  shelf_life_days integer,         -- shelf life in days
  storage_temp_min numeric,        -- minimum storage temperature °C
  storage_temp_max numeric,        -- maximum storage temperature °C
  storage_conditions text,         -- text description of storage requirements
  unit text not null default 'kg', -- unit of measure
  supplier_id uuid references public.suppliers(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id, code)
);

create table public.allergens (
  id uuid primary key default uuid_generate_v4(),
  type allergen_type not null unique,
  name_fr text not null,
  name_en text not null,
  name_ar text not null,
  name_so text not null,
  icon text,                       -- emoji or icon identifier
  created_at timestamptz not null default now()
);

create table public.product_allergens (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid not null references public.products(id) on delete cascade,
  allergen_id uuid not null references public.allergens(id) on delete cascade,
  contains boolean not null default true,  -- true = contains, false = may contain
  created_at timestamptz not null default now(),
  unique(product_id, allergen_id)
);

-- Food Safety Management System (linked to multiple standards)
create table public.food_safety_management_systems (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  standard_ids uuid[] not null default '{}'::uuid[],  -- can reference both 9001 and 22000
  scope text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

create index idx_prp_library_code on public.prp_library(code);
create index idx_prp_library_category on public.prp_library(category);
create index idx_prp_instances_tenant on public.prp_instances(tenant_id);
create index idx_sda_team_tenant on public.sda_team(tenant_id);
create index idx_products_tenant on public.products(tenant_id);
create index idx_products_category on public.products(category);
create index idx_product_allergens_product on public.product_allergens(product_id);
create index idx_food_safety_ms_tenant on public.food_safety_management_systems(tenant_id);

-- ============================================================================
-- RLS
-- ============================================================================

alter table public.prp_library enable row level security;
alter table public.prp_instances enable row level security;
alter table public.sda_team enable row level security;
alter table public.products enable row level security;
alter table public.allergens enable row level security;
alter table public.product_allergens enable row level security;
alter table public.food_safety_management_systems enable row level security;

-- PRP library: all authenticated users can see (global reference)
create policy prp_library_select on public.prp_library
  for select to authenticated
  using (is_active = true);

create policy prp_library_insert on public.prp_library
  for insert to authenticated
  with check (public.has_role(array['super_admin']));

create policy prp_library_update on public.prp_library
  for update to authenticated
  using (public.has_role(array['super_admin']));

-- PRP instances: tenant-scoped
create policy prp_instances_select on public.prp_instances
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy prp_instances_insert on public.prp_instances
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
  );

create policy prp_instances_update on public.prp_instances
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
  )
  with check (tenant_id = public.current_tenant_id());

create policy prp_instances_delete on public.prp_instances
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

-- SDA team: all tenant users can see; quality roles manage
create policy sda_team_select on public.sda_team
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy sda_team_insert on public.sda_team
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
  );

create policy sda_team_update on public.sda_team
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
  )
  with check (tenant_id = public.current_tenant_id());

create policy sda_team_delete on public.sda_team
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

-- Products: all tenant users can see; quality roles manage
create policy products_select on public.products
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy products_insert on public.products
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'process_owner', 'super_admin'])
  );

create policy products_update on public.products
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'process_owner', 'super_admin'])
  )
  with check (tenant_id = public.current_tenant_id());

create policy products_delete on public.products
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

-- Allergens: all can see (global reference)
create policy allergens_select on public.allergens
  for select to authenticated
  using (true);

create policy allergens_insert on public.allergens
  for insert to authenticated
  with check (public.has_role(array['super_admin']));

-- Product allergens: via product access
create policy product_allergens_select on public.product_allergens
  for select to authenticated
  using (
    exists (
      select 1 from public.products p
      where p.id = product_allergens.product_id
        and p.tenant_id = public.current_tenant_id()
    )
  );

create policy product_allergens_insert on public.product_allergens
  for insert to authenticated
  with check (
    exists (
      select 1 from public.products p
      where p.id = product_allergens.product_id
        and p.tenant_id = public.current_tenant_id()
        and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
    )
  );

create policy product_allergens_delete on public.product_allergens
  for delete to authenticated
  using (
    exists (
      select 1 from public.products p
      where p.id = product_allergens.product_id
        and p.tenant_id = public.current_tenant_id()
        and public.has_role(array['tenant_admin', 'super_admin'])
    )
  );

-- FSMS: tenant-scoped
create policy fsms_select on public.food_safety_management_systems
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy fsms_insert on public.food_safety_management_systems
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
  );

create policy fsms_update on public.food_safety_management_systems
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
  )
  with check (tenant_id = public.current_tenant_id());

create policy fsms_delete on public.food_safety_management_systems
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

-- ============================================================================
-- TRIGGERS
-- ============================================================================

create trigger trg_prp_instances_updated_at
  before update on public.prp_instances
  for each row execute function public.set_updated_at();

create trigger trg_products_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

create trigger trg_fsms_updated_at
  before update on public.food_safety_management_systems
  for each row execute function public.set_updated_at();

-- ============================================================================
-- SEED: 14 allergens (Codex Alimentarius)
-- ============================================================================

insert into public.allergens (type, name_fr, name_en, name_ar, name_so, icon) values
('gluten', 'Gluten', 'Gluten', 'الغلوتين', 'Gluten', '🌾'),
('crustaceans', 'Crustacés', 'Crustaceans', 'القشريات', 'Quraacda', '🦐'),
('eggs', 'Œufs', 'Eggs', 'البيض', 'Ukun', '🥚'),
('fish', 'Poisson', 'Fish', 'السمك', 'Malaay', '🐟'),
('peanuts', 'Arachides', 'Peanuts', 'الفول السوداني', 'Lacag-maaxo', '🥜'),
('soy', 'Soja', 'Soy', 'فول الصويا', 'Soya', '🫘'),
('milk', 'Lait', 'Milk', 'الحليب', 'Caano', '🥛'),
('nuts', 'Fruits à coque', 'Tree nuts', 'المكسرات', 'Bocaasi', '🌰'),
('celery', 'Céleri', 'Celery', 'الكرفس', 'Kaaraf', '🥬'),
('mustard', 'Moutarde', 'Mustard', 'الخردل', 'Mastaarda', '🟡'),
('sesame', 'Sésame', 'Sesame', 'السمسم', 'Sinsin', '⚪'),
('sulphites', 'Sulfites', 'Sulphites', 'السلفيت', 'Sulfaat', '🍷'),
('lupin', 'Lupin', 'Lupin', 'الترمس', 'Lupin', '🌼'),
('molluscs', 'Mollusques', 'Molluscs', 'الرخويات', 'Baddi-maaxo', '🦪');

-- ============================================================================
-- SEED: PRP library (ISO/TS 22002-1 adapted, 15 PRPs)
-- ============================================================================

insert into public.prp_library (code, title, title_en, title_ar, title_so, category, description, iso_reference, default_frequency, applicable_to) values
('PRP-01', 'Conception et implantation des bâtiments', 'Building design and layout', 'تصميم وتخطيط المباني', 'Dhismaha iyo qorshaynta', 'infrastructure', 'Les bâtiments doivent être conçus pour faciliter la maîtrise des dangers, permettre un flux unidirectionnel, et séparer les zones propres/sales.', 'ISO/TS 22002-1 §4', 'yearly', '{all}'),
('PRP-02', 'Aménagement des locaux et espaces de travail', 'Layout of premises and workspaces', 'ترتيب المباني ومساحات العمل', 'Qorshaynta goobaha shaqada', 'workplace', 'Aménagement permettant la séparation des zones, circulation du personnel et des produits, prévention de la contamination croisée.', 'ISO/TS 22002-1 §5', 'yearly', '{all}'),
('PRP-03', 'Utilitaires (air, eau, énergie)', 'Utilities (air, water, energy)', 'المرافق (الهواء، الماء، الطاقة)', 'Adeegyada (hawo, biyo, tamarta)', 'air', 'Maîtrise de la qualité de l''air, de l''eau (potable, non potable) et de l''énergie. Plans de maintenance des systèmes.', 'ISO/TS 22002-1 §6', 'monthly', '{all}'),
('PRP-04', 'Gestion des déchets et évacuation', 'Waste management and disposal', 'إدارة النفايات والتخلص منها', 'Maamulka qashinka', 'waste', 'Collecte, stockage et évacuation des déchets pour éviter qu''ils ne deviennent une source de contamination.', 'ISO/TS 22002-1 §7', 'daily', '{all}'),
('PRP-05', 'Entretien et maintenance des équipements', 'Equipment maintenance', 'صيانة المعدات', 'Dayactirka qalabka', 'maintenance', 'Programme d''entretien préventif et correctif des équipements en contact avec les aliments.', 'ISO/TS 22002-1 §8', 'monthly', '{all}'),
('PRP-06', 'Gestion des produits chimiques', 'Chemical management', 'إدارة المواد الكيميائية', 'Maamulka kiimikada', 'cleaning', 'Stockage, identification et utilisation sécurisée des produits chimiques (nettoyants, désinfectants, lubrifiants alimentaires).', 'ISO/TS 22002-1 §9', 'monthly', '{all}'),
('PRP-07', 'Programme de nettoyage et désinfection', 'Cleaning and sanitation program', 'برنامج التنظيف والتطهير', 'Barnaamijka nadiifinta', 'cleaning', 'Programme structuré de nettoyage et désinfection des locaux, équipements et surfaces en contact avec les aliments.', 'ISO/TS 22002-1 §10', 'daily', '{all}'),
('PRP-08', 'Lutte contre les nuisibles', 'Pest control', 'مكافحة الآفات', 'Besta caafimaadka', 'pest_control', 'Programme de lutte intégrée contre les nuisibles (insectes, rongeurs, oiseaux) avec monitoring et interventions.', 'ISO/TS 22002-1 §11', 'weekly', '{all}'),
('PRP-09', 'Hygiène du personnel et installations sanitaires', 'Personnel hygiene and facilities', 'نظافة الموظفين والمرافق الصحية', 'Caafimaadka shaqaalaha', 'personnel', 'Installations sanitaires adéquates, programme d''hygiène du personnel (lavage des mains, tenues, comportement).', 'ISO/TS 22002-1 §12', 'daily', '{all}'),
('PRP-10', 'Sensibilisation et formation du personnel', 'Personnel awareness and training', 'التوعية والتدريب', 'Tababarka shaqaalaha', 'training', 'Formation à l''hygiène et à la sécurité des aliments pour tout le personnel, y compris temporaire et sous-traitant.', 'ISO/TS 22002-1 §13', 'yearly', '{all}'),
('PRP-11', 'Reprise de produits et réintégration', 'Product rework and reintegration', 'إعادة تشغيل المنتجات', 'Dib u habaynta wax soo saarka', 'other', 'Procédure pour la reprise, la réintégration et la gestion des produits non conformes pour éviter la contamination.', 'ISO/TS 22002-1 §14', 'monthly', '{all}'),
('PRP-12', 'Procédure de rappel', 'Recall procedure', 'إجراء الاستدعاء', 'Habka soo ceshitaanka', 'other', 'Procédure permettant le rappel rapide et efficace des produits dangereux, avec traçabilité complète.', 'ISO/TS 22002-1 §15', 'yearly', '{all}'),
('PRP-13', 'Entreposage et transport', 'Storage and transport', 'التخزين والنقل', 'Kaydka iyo gaadiidka', 'storage', 'Conditions d''entreposage et de transport maintenant la sécurité des aliments (température, hygiène, séparation).', 'ISO/TS 22002-1 §16', 'daily', '{all}'),
('PRP-14', 'Contrôle des achats et des fournisseurs', 'Purchasing and supplier control', 'مراقبة المشتريات والموردين', 'Xakamaynta iibsashada', 'purchasing', 'Sélection, évaluation et contrôle des fournisseurs de matières premières, ingrédients et services.', 'ISO/TS 22002-1 §17', 'monthly', '{all}'),
('PRP-15', 'Communication sur les dangers et exigences', 'Communication on hazards and requirements', 'التواصل حول المخاطر والمتطلبات', 'Isgaarsiinta khataraha', 'communication', 'Communication interne et externe sur les dangers liés à la sécurité des aliments et les exigences associées.', 'ISO/TS 22002-1 §18', 'yearly', '{all}');
