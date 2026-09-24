-- 0058_fix_content_owner_id_nullable.sql
--
-- profiles.content_owner_id was made NOT NULL in 0053 with no column
-- default. The new-user trigger (0001's handle_new_user) only ever inserts
-- (id, display_name) -- exactly the shape household_owner_id already
-- tolerates by staying nullable, with household_owner()/content_owner()
-- coalescing to auth.uid() when the column is null. content_owner_id never
-- got that same allowance, so every brand new signup violated its own
-- NOT NULL constraint before createCarer()'s follow-up UPDATE ever got a
-- chance to run -- surfacing to the admin as a bare "Database error
-- creating new user."

alter table profiles alter column content_owner_id drop not null;
