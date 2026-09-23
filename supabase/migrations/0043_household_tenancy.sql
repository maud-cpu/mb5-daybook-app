-- 0043_household_tenancy.sql
--
-- Every table in this app so far is either private to one carer
-- (user_id = auth.uid()) or, for the "shared area" (rates, training
-- catalog/platforms, rota, news, training feedback), readable by *any*
-- signed-in user in the whole Supabase project -- there has never been a
-- concept of separate households. That was fine while every account
-- belonged to the same one household, but it means the moment a second,
-- unrelated household's carer gets a login on this same deployment, they
-- see the first household's rota, rates, training catalogue and news
-- mixed in with their own, and an admin can read every other household's
-- carer list and usage stats too.
--
-- This introduces the first real "household" grouping: every profile gets
-- a household_owner_id (the household's own admin -- itself, for an
-- admin). household_owner() resolves "my household's tenant key" and is
-- used as a column DEFAULT going forward, so every existing insert call
-- site in the app keeps working completely unmodified -- the household id
-- is stamped on automatically. (Existing rows are backfilled by hand
-- below rather than via that default, since auth.uid() has no meaning
-- while this migration itself runs with no signed-in user -- a default
-- expression alone would try to write NULL into a NOT NULL column for
-- every row that already exists.)

alter table profiles add column household_owner_id uuid references auth.users(id);

-- Preserve today's single-household setup exactly as-is: every existing
-- admin owns their own household; every existing carer belongs to the
-- first admin's household (there has only ever been one admin so far).
update profiles set household_owner_id = id where role = 'admin';
update profiles set household_owner_id = (select id from profiles where role = 'admin' order by created_at limit 1)
  where household_owner_id is null;

create function household_owner()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select household_owner_id from profiles where id = auth.uid()), auth.uid());
$$;

-- ---------------------------------------------------------------------
-- shared_rates: was `id boolean primary key default true check (id)`,
-- which forces exactly one row to ever exist in the *entire table* --
-- fine for one household, impossible once a second household needs its
-- own row. Widen the primary key to (household_owner_id, id) so each
-- household gets its own single row; app code's `.eq("id", true)` still
-- resolves to exactly one row once combined with the RLS filter below.
-- ---------------------------------------------------------------------
alter table shared_rates add column household_owner_id uuid references auth.users(id);
update shared_rates set household_owner_id = (select id from profiles where role = 'admin' order by created_at limit 1);
alter table shared_rates alter column household_owner_id set not null;
alter table shared_rates alter column household_owner_id set default household_owner();
alter table shared_rates drop constraint shared_rates_pkey;
alter table shared_rates add primary key (household_owner_id, id);

drop policy "shared_rates: any signed-in user can read" on shared_rates;
create policy "shared_rates: read own household"
  on shared_rates for select
  using (household_owner_id = household_owner());

drop policy "shared_rates: admins can write" on shared_rates;
create policy "shared_rates: admins can write their own household"
  on shared_rates for all
  using (is_admin() and household_owner_id = household_owner())
  with check (is_admin() and household_owner_id = household_owner());

drop policy "shared_rates_history: admins can read" on shared_rates_history;
create policy "shared_rates_history: admins can read their own household"
  on shared_rates_history for select
  using (is_admin() and (snapshot ->> 'household_owner_id')::uuid = household_owner());

-- ---------------------------------------------------------------------
-- shared_training_catalog / shared_training_catalog_history: already
-- uuid-keyed, no primary-key conflict -- just add the column and scope
-- the policies.
-- ---------------------------------------------------------------------
alter table shared_training_catalog add column household_owner_id uuid references auth.users(id);
update shared_training_catalog set household_owner_id = (select id from profiles where role = 'admin' order by created_at limit 1);
alter table shared_training_catalog alter column household_owner_id set not null;
alter table shared_training_catalog alter column household_owner_id set default household_owner();

drop policy "shared_training_catalog: any signed-in user can read" on shared_training_catalog;
create policy "shared_training_catalog: read own household"
  on shared_training_catalog for select
  using (household_owner_id = household_owner());

drop policy "shared_training_catalog: admins can write" on shared_training_catalog;
create policy "shared_training_catalog: admins can write their own household"
  on shared_training_catalog for all
  using (is_admin() and household_owner_id = household_owner())
  with check (is_admin() and household_owner_id = household_owner());

drop policy "shared_training_catalog_history: admins can read" on shared_training_catalog_history;
create policy "shared_training_catalog_history: admins can read their own household"
  on shared_training_catalog_history for select
  using (is_admin() and (snapshot ->> 'household_owner_id')::uuid = household_owner());

-- ---------------------------------------------------------------------
-- shared_training_platforms: was `name text primary key`, global across
-- every household -- two households both wanting a platform called
-- "MyLearning" would collide. Widen to (household_owner_id, name).
-- ---------------------------------------------------------------------
alter table shared_training_platforms add column household_owner_id uuid references auth.users(id);
update shared_training_platforms set household_owner_id = (select id from profiles where role = 'admin' order by created_at limit 1);
alter table shared_training_platforms alter column household_owner_id set not null;
alter table shared_training_platforms alter column household_owner_id set default household_owner();
alter table shared_training_platforms drop constraint shared_training_platforms_pkey;
alter table shared_training_platforms add primary key (household_owner_id, name);

drop policy "shared_training_platforms: any signed-in user can read" on shared_training_platforms;
create policy "shared_training_platforms: read own household"
  on shared_training_platforms for select
  using (household_owner_id = household_owner());

drop policy "shared_training_platforms: admins can write" on shared_training_platforms;
create policy "shared_training_platforms: admins can write their own household"
  on shared_training_platforms for all
  using (is_admin() and household_owner_id = household_owner())
  with check (is_admin() and household_owner_id = household_owner());

-- ---------------------------------------------------------------------
-- shared_rota: was `date date primary key`, global -- two households
-- couldn't each have a rota entry for the same date. Widen to
-- (household_owner_id, date).
-- ---------------------------------------------------------------------
alter table shared_rota add column household_owner_id uuid references auth.users(id);
update shared_rota set household_owner_id = (select id from profiles where role = 'admin' order by created_at limit 1);
alter table shared_rota alter column household_owner_id set not null;
alter table shared_rota alter column household_owner_id set default household_owner();
alter table shared_rota drop constraint shared_rota_pkey;
alter table shared_rota add primary key (household_owner_id, date);

drop policy "shared_rota: any signed-in user can read" on shared_rota;
create policy "shared_rota: read own household"
  on shared_rota for select
  using (household_owner_id = household_owner());

drop policy "shared_rota: admins can write" on shared_rota;
create policy "shared_rota: admins can write their own household"
  on shared_rota for all
  using (is_admin() and household_owner_id = household_owner())
  with check (is_admin() and household_owner_id = household_owner());

-- ---------------------------------------------------------------------
-- shared_news / dismissed_news: uuid-keyed, just scope the policies.
-- ---------------------------------------------------------------------
alter table shared_news add column household_owner_id uuid references auth.users(id);
update shared_news set household_owner_id = (select id from profiles where role = 'admin' order by created_at limit 1);
alter table shared_news alter column household_owner_id set not null;
alter table shared_news alter column household_owner_id set default household_owner();

drop policy "shared_news: any signed-in user can read" on shared_news;
create policy "shared_news: read own household"
  on shared_news for select
  using (household_owner_id = household_owner());

drop policy "shared_news: admins can write" on shared_news;
create policy "shared_news: admins can write their own household"
  on shared_news for all
  using (is_admin() and household_owner_id = household_owner())
  with check (is_admin() and household_owner_id = household_owner());

-- ---------------------------------------------------------------------
-- training_feedback: uuid-keyed, just scope the read policy (the "own
-- rating" write policy is already correctly self-scoped).
-- ---------------------------------------------------------------------
alter table training_feedback add column household_owner_id uuid references auth.users(id);
update training_feedback set household_owner_id = (select id from profiles where role = 'admin' order by created_at limit 1);
alter table training_feedback alter column household_owner_id set not null;
alter table training_feedback alter column household_owner_id set default household_owner();

drop policy "training_feedback: any signed-in user can read" on training_feedback;
create policy "training_feedback: read own household"
  on training_feedback for select
  using (household_owner_id = household_owner());

-- ---------------------------------------------------------------------
-- profiles: an admin manages their own household's carers, not every
-- household's project-wide.
-- ---------------------------------------------------------------------
drop policy "profiles: admins read all rows" on profiles;
create policy "profiles: admins read own household rows"
  on profiles for select
  using (is_admin() and household_owner_id = household_owner());

-- Dead since the "send to admin" checkbox it fed was replaced this
-- session by the direct hub-carer email flow -- and would otherwise leak
-- every household's admin name to every signed-in user project-wide.
drop policy "profiles: anyone signed in can see admin names" on profiles;

-- ---------------------------------------------------------------------
-- Admin usage-stats functions (0003): scope both to the calling admin's
-- own household instead of every carer in the project.
-- ---------------------------------------------------------------------
create or replace function admin_carer_overview()
returns table (
  user_id uuid,
  display_name text,
  role text,
  account_created_at timestamptz,
  last_sign_in_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'admin only';
  end if;

  return query
    select p.id, p.display_name, p.role, u.created_at, u.last_sign_in_at
    from profiles p
    join auth.users u on u.id = p.id
    where p.household_owner_id = household_owner()
    order by p.display_name;
end;
$$;

create or replace function admin_entry_dates()
returns table (
  user_id uuid,
  entry_date date,
  bucket text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'admin only';
  end if;

  return query
    select r.user_id, r.date, r.bucket
    from records r
    join profiles p on p.id = r.user_id
    where p.household_owner_id = household_owner();
end;
$$;
