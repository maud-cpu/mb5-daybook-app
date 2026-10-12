-- shared_hub_directory (0091) was modelled on shared_rates/shared_rota's
-- OLD pattern -- scoped by household_owner_id = household_owner() -- but
-- every one of those was deliberately moved onto content_owner() in 0053,
-- specifically so a carer set up as a genuinely separate household (who
-- still shares the admin's rates/training/rota/news) keeps seeing that
-- shared content. shared_hub_directory never got the same treatment, so
-- it's the one piece of shared content such a carer can't actually see --
-- same fix, same reasoning, just four migrations late.
alter table shared_hub_directory alter column household_owner_id set default content_owner();

drop policy "shared_hub_directory: household can read" on shared_hub_directory;
create policy "shared_hub_directory: read own content group"
  on shared_hub_directory for select
  using (household_owner_id = content_owner());

drop policy "shared_hub_directory: admin can write" on shared_hub_directory;
create policy "shared_hub_directory: only the content owner can write"
  on shared_hub_directory for all
  using (is_admin() and auth.uid() = household_owner_id)
  with check (is_admin() and auth.uid() = household_owner_id);
