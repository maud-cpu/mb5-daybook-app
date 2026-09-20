-- 0032_child_school_admin_and_clubs.sql
--
-- Two things every carer ends up needing but has nowhere to put: the
-- practical school-admin details for a child (how to pay for lunches, the
-- homework app and its login, who the class rep and PTA contact are) and
-- the clubs they attend (day, time, cost, website, main contact). Both are
-- keyed by child_id alone, deliberately not FK-restricted to the
-- "children" table -- a child recorded under "Children in your household"
-- needs exactly the same info, same reasoning as
-- handover_child_profiles.child_id (see 0027).
--
-- The point of storing this here rather than a notebook: clubs surface on
-- the calendar automatically (a weekly, recurring thing shouldn't need
-- re-entering as a reminder every week), and both are pulled into the
-- handover document -- so if a child moves placement suddenly, the next
-- carer isn't starting from zero on how the school run actually works.

create table child_school_admin (
  child_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  lunch_payment text not null default '',
  homework_app_name text not null default '',
  homework_app_url text not null default '',
  homework_app_login text not null default '',
  class_rep_name text not null default '',
  class_rep_contact text not null default '',
  pta_name text not null default '',
  pta_contact text not null default '',
  pta_facebook text not null default '',
  school_office_contact text not null default '',
  other_links text not null default '',
  notes text not null default '',
  updated_at timestamptz not null default now()
);

alter table child_school_admin enable row level security;

create policy "child_school_admin: owner only"
  on child_school_admin for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create table child_clubs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  child_id uuid not null,
  club_name text not null default '',
  weekday int not null default 0 check (weekday between 0 and 6),
  time_from text not null default '',
  time_to text not null default '',
  cost text not null default '',
  website text not null default '',
  contact_name text not null default '',
  contact_info text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);

alter table child_clubs enable row level security;

create policy "child_clubs: owner only"
  on child_clubs for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
