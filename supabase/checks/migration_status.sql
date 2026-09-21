-- migration_status.sql
--
-- Run this any time in the Supabase SQL Editor to see, at a glance, which
-- of the numbered migrations in supabase/migrations/ have actually been
-- applied to THIS database. "applied = false" on any row means: open that
-- migration file on GitHub, copy its contents, paste into the SQL Editor,
-- and run it.
--
-- This exists because a migration can be written and even linked to the
-- carer, but never actually run -- and the app then fails later with a
-- confusing "column not found" error. This query catches that up front.

-- Temporary helper (this session only): actually tries a read that would
-- trip the profiles self-recursion bug from 0001/0013, instead of just
-- checking whether a policy or column exists on paper.
create or replace function pg_temp.no_rls_recursion() returns boolean language plpgsql as $$
begin
  perform 1 from shared_rates limit 1;
  return true;
exception when others then
  return false;
end;
$$;

select migration, applied from (
  values
    ('0001 core tables (profiles, children, records, contacts, household, handovers, reminders, training_progress, carer_settings)',
      to_regclass('public.profiles') is not null
      and to_regclass('public.children') is not null
      and to_regclass('public.records') is not null
      and to_regclass('public.contacts') is not null
      and to_regclass('public.household') is not null
      and to_regclass('public.handovers') is not null
      and to_regclass('public.reminders') is not null
      and to_regclass('public.training_progress') is not null
      and to_regclass('public.carer_settings') is not null),

    ('0002 shared content tables (rates, training catalog, rota)',
      to_regclass('public.shared_rates') is not null
      and to_regclass('public.shared_training_catalog') is not null
      and to_regclass('public.shared_training_platforms') is not null
      and to_regclass('public.shared_rota') is not null),

    ('0003 admin usage-stats functions',
      to_regprocedure('public.is_admin()') is not null
      and to_regprocedure('public.admin_carer_overview()') is not null
      and to_regprocedure('public.admin_entry_dates()') is not null),

    ('0004 photo storage bucket',
      exists (select 1 from storage.buckets where id = 'entry-photos')),

    ('0005 default user_id on inserts',
      (select column_default from information_schema.columns
         where table_schema = 'public' and table_name = 'children' and column_name = 'user_id') is not null
      and (select column_default from information_schema.columns
         where table_schema = 'public' and table_name = 'records' and column_name = 'user_id') is not null),

    ('0006 share-one-entry-with-admin column',
      exists (select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'records' and column_name = 'shared_with_admin')),

    ('0007 expense claimed/paid columns',
      exists (select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'records' and column_name = 'claimed')
      and exists (select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'records' and column_name = 'paid')),

    ('0008 diaries table',
      to_regclass('public.diaries') is not null),

    ('0009 household_adults table',
      to_regclass('public.household_adults') is not null),

    ('0010 child category / Mockingbird columns',
      exists (select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'children' and column_name = 'category')
      and exists (select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'children' and column_name = 'mockingbird')),

    ('0011 handover/sleepover plan tables',
      to_regclass('public.handover_child_profiles') is not null
      and to_regclass('public.handover_plans') is not null
      and exists (select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'household' and column_name = 'carseat')),

    ('0012 shared_rates has its one required row (else Rates screen and every day-care amount silently fail)',
      exists (select 1 from shared_rates)),

    ('0013 profiles admin-check no longer recurses (reads that touch an admin-gated policy actually work)',
      pg_temp.no_rls_recursion()),

    ('0014 per-course direct link column',
      exists (select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'shared_training_catalog' and column_name = 'url')),

    ('0015 per-course length/format column',
      exists (select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'shared_training_catalog' and column_name = 'length')),

    ('0016 dismissed_todos table',
      to_regclass('public.dismissed_todos') is not null),

    ('0017 records.flag_dismissed column',
      exists (select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'records' and column_name = 'flag_dismissed')),

    ('0018 household_children and household_visitors tables',
      to_regclass('public.household_children') is not null
      and to_regclass('public.household_visitors') is not null),

    ('0019 household_children.category column',
      exists (select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'household_children' and column_name = 'category')),

    ('0020 shared_training_catalog.description column',
      exists (select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'shared_training_catalog' and column_name = 'description')),

    ('0021 external ratings + training_feedback table',
      exists (select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'shared_training_catalog' and column_name = 'external_rating')
      and to_regclass('public.training_feedback') is not null),

    ('0022 household_children basics/mockingbird columns',
      exists (select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'household_children' and column_name = 'basics')
      and exists (select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'household_children' and column_name = 'mockingbird')),

    ('0023 household.is_mockingbird + hub leader columns',
      exists (select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'household' and column_name = 'is_mockingbird')
      and exists (select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'household' and column_name = 'hub_leader_name')),

    ('0024 reminders.category/child/amount columns',
      exists (select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'reminders' and column_name = 'category')
      and exists (select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'reminders' and column_name = 'amount')),

    ('0025 reminders.series_id column',
      exists (select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'reminders' and column_name = 'series_id')),

    ('0026 reminders.source_key column + unique index',
      exists (select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'reminders' and column_name = 'source_key')
      and exists (select 1 from pg_indexes
         where schemaname = 'public' and tablename = 'reminders' and indexname = 'reminders_user_source_key_idx')),

    ('0027 handover_child_profiles.child_id no longer FK-restricted to children',
      not exists (select 1 from information_schema.table_constraints
         where table_schema = 'public' and table_name = 'handover_child_profiles'
         and constraint_name = 'handover_child_profiles_child_id_fkey')),

    ('0028 reminders.source_text column',
      exists (select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'reminders' and column_name = 'source_text')),

    ('0029 training session date columns',
      exists (select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'shared_training_catalog' and column_name = 'is_face_to_face')
      and exists (select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'shared_training_catalog' and column_name = 'session_date')
      and exists (select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'training_progress' and column_name = 'session_date')),

    ('0030 reminders.people column',
      exists (select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'reminders' and column_name = 'people')),

    ('0031 dismissed_training_suggestions table',
      to_regclass('public.dismissed_training_suggestions') is not null),

    ('0032 child_school_admin and child_clubs tables',
      to_regclass('public.child_school_admin') is not null
      and to_regclass('public.child_clubs') is not null),

    ('0033 todo_first_seen table',
      to_regclass('public.todo_first_seen') is not null),

    ('0034 YourKids articles seeded into shared_training_catalog',
      exists (select 1 from shared_training_catalog where title = 'AI Chatbots and Teens')
      and exists (select 1 from shared_training_catalog where title = 'Toddler Tantrums: Why They Happen and How to Respond')),

    ('0035 YourKids articles show their platform',
      exists (select 1 from shared_training_catalog where title = 'AI Chatbots and Teens' and platform = 'YourKids')),

    ('0036 length backfilled from title brackets',
      exists (select 1 from shared_training_catalog where title = 'Child Exploitation workshop (2 hrs)' and length = '2 hrs'))
) as t(migration, applied)
order by migration;
