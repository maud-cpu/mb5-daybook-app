-- 0053_content_owner.sql
--
-- household_owner_id was doing two different jobs at once: (1) who shares
-- rates/training/rota/news with whom, and (2) who an admin can see/manage
-- in the carers list. That's fine while those always move together, but a
-- new requirement doesn't fit: a second foster family, running as its own
-- household with its own admin managing their own carers, who should still
-- see (but never edit) the *same* rates/training/rota/news as the carer
-- who onboarded them -- same Surrey setup, separate family and separate
-- carer-management group.
--
-- content_owner_id splits that second job out. household_owner_id keeps
-- meaning "which admin manages you" (admin_carer_overview, profiles
-- visibility -- unchanged below). content_owner_id means "whose shared
-- rates/training/rota/news do you see" -- independent of the above.
-- Defaults to the same value as household_owner_id for every existing
-- profile, so nothing changes for anyone until a carer is deliberately
-- created with the two set differently.

alter table profiles add column content_owner_id uuid references auth.users(id);
update profiles set content_owner_id = household_owner_id;
alter table profiles alter column content_owner_id set not null;

create function content_owner()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select content_owner_id from profiles where id = auth.uid()), auth.uid());
$$;

-- Every shared_* table below keeps its column literally named
-- household_owner_id (renaming it is extra migration risk for no
-- functional benefit) -- what changes is which function computes it, and,
-- for writes, a tighter check: admin status alone no longer qualifies,
-- since a same-content-group admin (the new case above) must NOT be able
-- to edit content they only read. Only the actual content owner (the
-- literal id the row is stamped with) can write.

alter table shared_rates alter column household_owner_id set default content_owner();
drop policy "shared_rates: read own household" on shared_rates;
create policy "shared_rates: read own content group"
  on shared_rates for select
  using (household_owner_id = content_owner());
drop policy "shared_rates: admins can write their own household" on shared_rates;
create policy "shared_rates: only the content owner can write"
  on shared_rates for all
  using (auth.uid() = household_owner_id)
  with check (auth.uid() = household_owner_id);

alter table shared_training_catalog alter column household_owner_id set default content_owner();
drop policy "shared_training_catalog: read own household" on shared_training_catalog;
create policy "shared_training_catalog: read own content group"
  on shared_training_catalog for select
  using (household_owner_id = content_owner());
drop policy "shared_training_catalog: admins can write their own household" on shared_training_catalog;
create policy "shared_training_catalog: only the content owner can write"
  on shared_training_catalog for all
  using (auth.uid() = household_owner_id)
  with check (auth.uid() = household_owner_id);

alter table shared_training_platforms alter column household_owner_id set default content_owner();
drop policy "shared_training_platforms: read own household" on shared_training_platforms;
create policy "shared_training_platforms: read own content group"
  on shared_training_platforms for select
  using (household_owner_id = content_owner());
drop policy "shared_training_platforms: admins can write their own household" on shared_training_platforms;
create policy "shared_training_platforms: only the content owner can write"
  on shared_training_platforms for all
  using (auth.uid() = household_owner_id)
  with check (auth.uid() = household_owner_id);

alter table shared_rota alter column household_owner_id set default content_owner();
drop policy "shared_rota: read own household" on shared_rota;
create policy "shared_rota: read own content group"
  on shared_rota for select
  using (household_owner_id = content_owner());
drop policy "shared_rota: admins can write their own household" on shared_rota;
create policy "shared_rota: only the content owner can write"
  on shared_rota for all
  using (auth.uid() = household_owner_id)
  with check (auth.uid() = household_owner_id);

alter table shared_rota_hours alter column household_owner_id set default content_owner();
drop policy "shared_rota_hours: read own household" on shared_rota_hours;
create policy "shared_rota_hours: read own content group"
  on shared_rota_hours for select
  using (household_owner_id = content_owner());
drop policy "shared_rota_hours: admins can write their own household" on shared_rota_hours;
create policy "shared_rota_hours: only the content owner can write"
  on shared_rota_hours for all
  using (auth.uid() = household_owner_id)
  with check (auth.uid() = household_owner_id);

alter table shared_news alter column household_owner_id set default content_owner();
drop policy "shared_news: read own household" on shared_news;
create policy "shared_news: read own content group"
  on shared_news for select
  using (household_owner_id = content_owner());
drop policy "shared_news: admins can write their own household" on shared_news;
create policy "shared_news: only the content owner can write"
  on shared_news for all
  using (auth.uid() = household_owner_id)
  with check (auth.uid() = household_owner_id);

-- training_feedback keeps its existing "own rating" write policy (that one
-- was always self-scoped to the rater, not the household) -- only the read
-- policy needs to follow the content group.
alter table training_feedback alter column household_owner_id set default content_owner();
drop policy "training_feedback: read own household" on training_feedback;
create policy "training_feedback: read own content group"
  on training_feedback for select
  using (household_owner_id = content_owner());
