-- 0061_hub_support_log.sql
--
-- A quick, in-the-moment log for a hub carer to record support given to or
-- received from other carers in their Mockingbird constellation -- coffee
-- catch-ups, daycare cover, sleepovers, social get-togethers, constellation
-- meetings -- so a month's worth is easy to look back over rather than
-- trying to remember it all when the MB5 support-log spreadsheet is due.
-- Shared with the whole household like everything else in that model (0057),
-- since a co-carer might be the one who actually did the catch-up.

create table hub_support_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  household_owner_id uuid not null default household_owner() references auth.users(id),
  date date not null default current_date,
  carer_names text not null default '',
  support_type text not null default 'other' check (
    support_type in (
      'daytime_child',
      'daytime_satellite',
      'social_activity',
      'constellation_meeting',
      'sleepover_planned',
      'sleepover_emergency',
      'training_session',
      'other'
    )
  ),
  amount numeric,
  notes text not null default '',
  created_at timestamptz not null default now()
);

alter table hub_support_log enable row level security;

create policy "hub_support_log: household read/write" on hub_support_log for all
  using (household_owner_id = household_owner())
  with check (household_owner_id = household_owner());
