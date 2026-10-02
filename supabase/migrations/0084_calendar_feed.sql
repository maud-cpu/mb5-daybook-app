-- A subscribable calendar feed -- the standard "add calendar by URL" every
-- phone/Google/Apple/Outlook calendar already understands, refreshing on
-- its own every few hours, rather than a one-off .ics download that goes
-- stale the moment anything changes.
--
-- A calendar app fetches this feed with no login at all, so there is no
-- auth.uid() to check RLS against -- the token embedded in the URL IS the
-- credential (the same model Google Calendar's own "secret address in iCal
-- format" uses). calendar_feed_reminders() below does its own lookup by
-- token, the same reasoning as the existing admin_* security-definer
-- functions bypassing RLS in a controlled, narrow way rather than opening
-- the reminders table itself to unauthenticated reads.

alter table household add column if not exists calendar_feed_token uuid not null default gen_random_uuid();
create unique index if not exists household_calendar_feed_token_idx on household (calendar_feed_token);

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
      and coalesce(r.todo_only, false) = false
      -- A small look-back keeps a just-passed event visible on the phone
      -- for a few days without the feed growing without bound forever.
      and r.date >= (current_date - interval '30 days')
    order by r.date;
end;
$$;
