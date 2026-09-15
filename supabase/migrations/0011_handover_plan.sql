-- 0011_handover_plan.sql
--
-- The full sleepover/handover plan: a reusable per-child profile (routine,
-- food, sleep, triggers etc -- saved once, reused every time that child
-- goes to another carer) plus a per-trip plan (who's going, when, to whom)
-- and a few more household fields the plan needs. All private to the carer.

create table handover_child_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  child_id uuid not null references children(id) on delete cascade,
  about text not null default '',
  routine text not null default '',
  food text not null default '',
  school text not null default '',
  toilet text not null default '',
  sleep text not null default '',
  health text not null default '',
  emotions text not null default '',
  contact text not null default '',
  screens text not null default '',
  told text not null default '',
  nogo text not null default '',
  pack text not null default '',
  updated_at timestamptz not null default now(),
  unique (user_id, child_id)
);

alter table handover_child_profiles enable row level security;

create policy "handover_child_profiles: owner only"
  on handover_child_profiles for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create table handover_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  child_names text[] not null default '{}',
  date_from date,
  date_to date,
  receiving_carer text not null default '',
  this_stay text not null default '',
  return_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, child_names, date_from, date_to)
);

alter table handover_plans enable row level security;

create policy "handover_plans: owner only"
  on handover_plans for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

alter table household add column csw text not null default '';
alter table household add column gp text not null default '';
alter table household add column hub text not null default '';
alter table household add column school_contact text not null default '';
alter table household add column delegated text not null default '';
alter table household add column carseat text not null default '';
