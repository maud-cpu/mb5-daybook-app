-- 0048_rota_hours.sql
--
-- The out-of-hours rota (0002) says who's on call each day, but not when
-- that service actually starts and stops -- a carer glancing at the phone
-- quick-access button couldn't tell whether it's the right number to call
-- right now versus during the day. This is a single constant fact about
-- the service itself (the same hours every day it runs), not something
-- that varies per rota row, so it's its own tiny one-row-per-household
-- table rather than duplicating it onto every date in shared_rota.

create table shared_rota_hours (
  household_owner_id uuid primary key default household_owner() references auth.users(id),
  hours_from text not null default '',
  hours_to text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

alter table shared_rota_hours enable row level security;

create policy "shared_rota_hours: read own household"
  on shared_rota_hours for select
  using (household_owner_id = household_owner());

create policy "shared_rota_hours: admins can write their own household"
  on shared_rota_hours for all
  using (is_admin() and household_owner_id = household_owner())
  with check (is_admin() and household_owner_id = household_owner());
