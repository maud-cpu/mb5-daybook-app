-- Hub calendar: the admin (hub lead) pushes a dated item once and it lands
-- directly on every hub member's own calendar/Up next, instead of News &
-- Events' existing pull model (shared_news, 0041) where each carer has to
-- notice it and tap "Add to calendar" themselves.
--
-- "Hub member" is its own flag, not just "shares my content group"
-- (0053) -- sharing rates/training/news doesn't automatically mean a
-- household should get hub-specific pushes (the admin's own household's
-- co-carer being the clearest example: same household, not a separate hub
-- member at all). Stored on the household's own admin profile row
-- (id = household_owner_id), so it covers the whole household the same way
-- reminders already do (0057).

alter table profiles add column is_hub_member boolean not null default false;

create table shared_hub_events (
  id uuid primary key default gen_random_uuid(),
  content_owner_id uuid not null default content_owner() references auth.users(id),
  title text not null,
  body text not null default '',
  date date not null,
  time_from time,
  time_to time,
  url text not null default '',
  category text not null default 'surrey',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table shared_hub_events enable row level security;

create policy "shared_hub_events: read own content group"
  on shared_hub_events for select
  using (content_owner_id = content_owner());

create policy "shared_hub_events: only the content owner can write"
  on shared_hub_events for all
  using (auth.uid() = content_owner_id)
  with check (auth.uid() = content_owner_id);

-- The pushed copy in each hub member's own reminders -- on delete cascade
-- means removing the hub event itself removes it from everyone it was
-- pushed to, with no separate cleanup step needed.
alter table reminders add column hub_event_id uuid references shared_hub_events(id) on delete cascade;
create unique index reminders_household_hub_event_idx
  on reminders (household_owner_id, hub_event_id)
  where hub_event_id is not null;

-- Lists other households in the admin's content group that are eligible to
-- be flagged as hub members -- deliberately excludes the admin's own
-- household (its carers aren't a separate hub member) and anyone who isn't
-- a household's own owner (a co-carer login, not a household in their own
-- right).
create or replace function admin_hub_candidates()
returns table (household_owner_id uuid, display_name text, is_hub_member boolean)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'admin only';
  end if;

  return query
    select p.household_owner_id, p.display_name, p.is_hub_member
    from profiles p
    where p.content_owner_id = content_owner()
      and p.id = p.household_owner_id
      and p.household_owner_id <> household_owner()
    order by p.display_name;
end;
$$;

-- Toggling membership takes effect immediately, independent of editing any
-- one event: newly flagged gets every currently-active hub event pushed to
-- them now; unflagged has every pushed copy removed now, rather than
-- either change waiting for the next time an event happens to be edited.
create or replace function admin_set_hub_member(p_household_owner_id uuid, p_is_member boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'admin only';
  end if;

  update profiles
  set is_hub_member = p_is_member
  where id = p_household_owner_id
    and household_owner_id = p_household_owner_id
    and content_owner_id = content_owner();

  if p_is_member then
    insert into reminders (household_owner_id, hub_event_id, text, date, time_from, time_to, category, source_text, url)
    select p_household_owner_id, e.id, e.title, e.date, e.time_from, e.time_to, e.category, e.body, nullif(e.url, '')
    from shared_hub_events e
    where e.content_owner_id = content_owner()
    on conflict (household_owner_id, hub_event_id) do nothing;
  else
    delete from reminders r
    using shared_hub_events e
    where r.hub_event_id = e.id
      and e.content_owner_id = content_owner()
      and r.household_owner_id = p_household_owner_id;
  end if;
end;
$$;

-- Called after creating or editing a hub event: pushes/updates the copy in
-- every currently-flagged hub member's calendar, and cleans up anyone no
-- longer flagged -- self-correcting on every save rather than needing a
-- separate reconciliation step.
create or replace function sync_hub_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select content_owner_id into v_owner from shared_hub_events where id = p_event_id;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'not your event';
  end if;

  insert into reminders (household_owner_id, hub_event_id, text, date, time_from, time_to, category, source_text, url)
  select p.household_owner_id, e.id, e.title, e.date, e.time_from, e.time_to, e.category, e.body, nullif(e.url, '')
  from shared_hub_events e
  join profiles p
    on p.content_owner_id = e.content_owner_id
    and p.id = p.household_owner_id
    and p.is_hub_member
  where e.id = p_event_id
  on conflict (household_owner_id, hub_event_id) do update set
    text = excluded.text,
    date = excluded.date,
    time_from = excluded.time_from,
    time_to = excluded.time_to,
    category = excluded.category,
    source_text = excluded.source_text,
    url = excluded.url;

  delete from reminders r
  where r.hub_event_id = p_event_id
    and not exists (
      select 1 from profiles p
      where p.household_owner_id = r.household_owner_id
        and p.id = p.household_owner_id
        and p.is_hub_member
        and p.content_owner_id = v_owner
    );
end;
$$;
