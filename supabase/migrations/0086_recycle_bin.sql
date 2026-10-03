-- A 30-day "recycle bin" safety net for the three things a carer can
-- delete herself: diary/expense/etc records, calendar reminders, and
-- children. Deleting now sets deleted_at instead of removing the row, so
-- it can be restored; a daily job (see app/api/cron/purge-bin) and a lazy
-- purge on every Bin-tab open hard-delete anything past 30 days. Every
-- normal read elsewhere in the app is updated alongside this migration to
-- filter deleted_at is null, so a bin item doesn't resurface anywhere else
-- (admin views, AI drafting context, the calendar feed, etc) while it
-- waits out its 30 days.
alter table records add column if not exists deleted_at timestamptz;
alter table reminders add column if not exists deleted_at timestamptz;
alter table children add column if not exists deleted_at timestamptz;

create index if not exists records_deleted_at_idx on records (deleted_at) where deleted_at is not null;
create index if not exists reminders_deleted_at_idx on reminders (deleted_at) where deleted_at is not null;
create index if not exists children_deleted_at_idx on children (deleted_at) where deleted_at is not null;

-- Both of these are security-definer functions the app calls by RPC rather
-- than a normal filtered .select(), so the deleted_at is null condition has
-- to live in the function body itself -- there's no query-builder call site
-- elsewhere to add it to.
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
    where p.household_owner_id = household_owner()
      and r.deleted_at is null;
end;
$$;

create or replace function calendar_feed_reminders(p_token uuid)
returns table (
  id uuid,
  text text,
  date date,
  time_from time,
  time_to time,
  url text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select household_owner_id into v_owner from household where calendar_feed_token = p_token;
  if v_owner is null then
    raise exception 'invalid token';
  end if;

  return query
    select r.id, r.text, r.date, r.time_from, r.time_to, r.url
    from reminders r
    where r.household_owner_id = v_owner
      and r.deleted_at is null
      and coalesce(r.todo_only, false) = false
      -- A small look-back keeps a just-passed event visible on the phone
      -- for a few days without the feed growing without bound forever.
      and r.date >= (current_date - interval '30 days')
    order by r.date;
end;
$$;
