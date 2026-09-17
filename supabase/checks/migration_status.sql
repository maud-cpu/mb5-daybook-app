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
         where table_schema = 'public' and table_name = 'shared_training_catalog' and column_name = 'description'))
) as t(migration, applied)
order by migration;
