-- 0002_shared_content.sql
--
-- The "shared area": pay rates, the training course catalog, and the
-- out-of-hours rota. Every carer can read these; only an admin can change
-- them. Every change is copied into a matching *_history table first, so
-- editing or fixing a shared item can never lose the previous version --
-- there is always a full trail of what it used to say and when it changed.

-- ---------------------------------------------------------------------
-- shared_rates: a single current rate card. Age bands are stored as
-- jsonb keyed by band name ('0-4', '5-10', '11-13', '14-18').
-- ---------------------------------------------------------------------
create table shared_rates (
  id boolean primary key default true check (id),
  label text not null,
  mileage numeric not null,
  daily_deduct numeric not null,
  hour_first numeric not null,
  hour_add numeric not null,
  day_first jsonb not null,
  day_add jsonb not null,
  overnight jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create table shared_rates_history (
  id uuid primary key default gen_random_uuid(),
  snapshot jsonb not null,
  changed_at timestamptz not null default now(),
  changed_by uuid references auth.users(id)
);

alter table shared_rates enable row level security;
alter table shared_rates_history enable row level security;

create policy "shared_rates: any signed-in user can read"
  on shared_rates for select
  using (auth.uid() is not null);

create policy "shared_rates: admins can write"
  on shared_rates for all
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "shared_rates_history: admins can read"
  on shared_rates_history for select
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

create function shared_rates_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into shared_rates_history (snapshot, changed_by)
  values (to_jsonb(old), old.updated_by);
  return new;
end;
$$;

create trigger shared_rates_before_update
  before update on shared_rates
  for each row execute function shared_rates_snapshot();

insert into shared_rates (label, mileage, daily_deduct, hour_first, hour_add, day_first, day_add, overnight)
values (
  'Surrey CC, April 2026',
  0.45,
  20,
  12.71,
  10.17,
  '{"0-4": 63.57, "5-10": 67.76, "11-13": 79.53, "14-18": 87.15}',
  '{"0-4": 50.86, "5-10": 54.21, "11-13": 63.62, "14-18": 69.72}',
  '{"0-4": 93.06, "5-10": 97.24, "11-13": 109.02, "14-18": 120.08}'
);

-- ---------------------------------------------------------------------
-- shared_training_catalog: the list of courses (replaces the hardcoded
-- TRAINING array), editable by an admin without a code change.
-- ---------------------------------------------------------------------
create table shared_training_catalog (
  id uuid primary key default gen_random_uuid(),
  group_key text not null check (group_key in ('pre', 'once', '3yr', 'next')),
  group_label text not null,
  title text not null,
  how text not null default '',
  platform text not null default '',
  sort_order int not null default 0,
  archived boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create table shared_training_catalog_history (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null,
  snapshot jsonb not null,
  changed_at timestamptz not null default now(),
  changed_by uuid references auth.users(id)
);

alter table shared_training_catalog enable row level security;
alter table shared_training_catalog_history enable row level security;

create policy "shared_training_catalog: any signed-in user can read"
  on shared_training_catalog for select
  using (auth.uid() is not null);

create policy "shared_training_catalog: admins can write"
  on shared_training_catalog for all
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "shared_training_catalog_history: admins can read"
  on shared_training_catalog_history for select
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

create function shared_training_catalog_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into shared_training_catalog_history (course_id, snapshot, changed_by)
  values (old.id, to_jsonb(old), old.updated_by);
  return new;
end;
$$;

create trigger shared_training_catalog_before_update
  before update on shared_training_catalog
  for each row execute function shared_training_catalog_snapshot();

-- ---------------------------------------------------------------------
-- shared_training_platforms: login/catalogue links for each platform.
-- ---------------------------------------------------------------------
create table shared_training_platforms (
  name text primary key,
  url text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

alter table shared_training_platforms enable row level security;

create policy "shared_training_platforms: any signed-in user can read"
  on shared_training_platforms for select
  using (auth.uid() is not null);

create policy "shared_training_platforms: admins can write"
  on shared_training_platforms for all
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

insert into shared_training_platforms (name, url) values
  ('MyLearning', 'https://learning.openelms.com/surrey/login/surreychildrensacademy'),
  ('Training Hub', 'https://thefostercaretraininghub.com/en/course-cat/online'),
  ('SharePoint L&D page', 'https://orbispartnerships.sharepoint.com/sites/surrey_fostering/SitePages/Learning-%26-Development.aspx'),
  ('Assessing SSW / MyLearning', 'https://learning.openelms.com/surrey/login/surreychildrensacademy'),
  ('Link from Skills team', '');

insert into shared_training_catalog (group_key, group_label, title, how, platform, sort_order) values
  ('pre', 'Before approval (or one-off if added since)', 'Skills to Foster', 'Either', 'Assessing SSW / MyLearning', 1),
  ('pre', 'Before approval (or one-off if added since)', 'Recording', 'Online', 'Link from Skills team', 2),
  ('pre', 'Before approval (or one-off if added since)', 'Prevent', 'Online', 'MyLearning', 3),
  ('pre', 'Before approval (or one-off if added since)', 'Working Together to Safeguard Children (pre-approval)', 'Online', 'Link from Skills team', 4),
  ('once', 'Mandatory -- once', 'Equality, Diversity & Cultural Competence', 'Online', 'Training Hub', 1),
  ('once', 'Mandatory -- once', 'Our Shoes -- respect', 'Either', 'MyLearning', 2),
  ('once', 'Mandatory -- once', 'Understanding behaviour of children & young people', 'Online', 'MyLearning', 3),
  ('3yr', 'Mandatory -- every 3 years', 'First Aid for children''s workforce & foster carers', 'In person', 'MyLearning', 1),
  ('3yr', 'Mandatory -- every 3 years', 'Medication Level 2 (foster carer, England)', 'Online', 'Training Hub', 2),
  ('3yr', 'Mandatory -- every 3 years', 'Working Together to Safeguard Children', 'Online', 'MyLearning', 3),
  ('3yr', 'Mandatory -- every 3 years', 'Risk Management & Safer Caring', 'Online', 'Training Hub', 4),
  ('3yr', 'Mandatory -- every 3 years', 'Safeguarding disabled children (where relevant)', 'Online', 'MyLearning', 5),
  ('next', 'Next steps (suggested)', 'Virtual School e-PEP', 'Online', 'MyLearning', 1),
  ('next', 'Next steps (suggested)', 'Therapeutic Parenting intro video', 'Online', 'SharePoint L&D page', 2),
  ('next', 'Next steps (suggested)', 'Working with birth parents', 'Online', 'Training Hub', 3),
  ('next', 'Next steps (suggested)', 'Coping with the emotional demands of fostering', 'Either', 'MyLearning', 4),
  ('next', 'Next steps (suggested)', 'Internet Safety', 'Online', 'Training Hub', 5),
  ('next', 'Next steps (suggested)', 'PACE', 'Online', 'Training Hub', 6),
  ('next', 'Next steps (suggested)', 'Managing allegations against adults (SCSA)', 'Either', 'MyLearning', 7),
  ('next', 'Next steps (suggested)', 'Sexual Health', 'In person', 'MyLearning', 8),
  ('next', 'Next steps (suggested)', 'De-escalation', 'In person', 'MyLearning', 9),
  ('next', 'Next steps (suggested)', 'Compassion Fatigue', 'In person', 'MyLearning', 10),
  ('next', 'Next steps (suggested)', 'Equality, Diversity & Inclusion in Fostering (2 hrs)', 'Either', 'MyLearning', 11),
  ('next', 'Next steps (suggested)', 'VR headsets -- insight into trauma', 'In person', 'MyLearning', 12),
  ('next', 'Next steps (suggested)', 'Intro to harmful sexual behaviour (6 hrs)', 'In person', 'MyLearning', 13),
  ('next', 'Next steps (suggested)', 'Child Exploitation workshop (2 hrs)', 'Online', 'MyLearning', 14);

-- ---------------------------------------------------------------------
-- shared_rota: out-of-hours on-call rota, one row per date.
-- ---------------------------------------------------------------------
create table shared_rota (
  date date primary key,
  name text not null,
  phone text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

alter table shared_rota enable row level security;

create policy "shared_rota: any signed-in user can read"
  on shared_rota for select
  using (auth.uid() is not null);

create policy "shared_rota: admins can write"
  on shared_rota for all
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));
