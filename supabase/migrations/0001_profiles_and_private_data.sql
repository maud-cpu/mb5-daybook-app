-- 0001_profiles_and_private_data.sql
--
-- Every carer's actual fostering data lives in the tables below, and every
-- one of them is locked down with Row Level Security (RLS) so a carer can
-- only ever read or write their own rows. There is no admin bypass on any
-- of these policies -- not even the account that runs this migration can
-- read another carer's diary through the database, only through the
-- separate, content-free usage stats function added in a later migration.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- profiles: one row per user, created automatically on signup.
-- role defaults to 'carer'; the first admin is promoted manually via SQL
-- (see README for the exact command) once the project is set up.
-- ---------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  role text not null default 'carer' check (role in ('carer', 'admin')),
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "profiles: read own row"
  on profiles for select
  using (id = auth.uid());

create policy "profiles: admins read all rows"
  on profiles for select
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "profiles: update own display name"
  on profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- Auto-create a profile row whenever a new auth user is created (i.e. when
-- an admin adds a new carer). Runs as the table owner so it can bypass RLS
-- for this one insert.
create function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------
-- children: one row per child a carer looks after. Fully private.
-- ---------------------------------------------------------------------
create table children (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  born date,
  family text not null default '',
  basics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table children enable row level security;

create policy "children: owner only"
  on children for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- records: every captured entry (diary, supervision, expenses, meds,
-- social worker log, incident, scratch). Fully private.
-- ---------------------------------------------------------------------
create table records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket text not null check (bucket in ('diary', 'supervision', 'expenses', 'meds', 'sw', 'incident', 'scratch')),
  child text not null default '',
  kids text[] not null default '{}',
  also_in text[] not null default '{}',
  text text not null default '',
  date date not null,
  done boolean not null default false,
  flag text not null default '',
  flag_note text not null default '',
  flag_done boolean not null default false,
  flag_done_at timestamptz,
  flag_cleared boolean not null default false,
  training_note text not null default '',
  reported timestamptz,
  kind text,
  amount numeric,
  miles numeric,
  hours numeric,
  time_from time,
  time_to time,
  overnight boolean not null default false,
  reason text not null default '',
  med_name text not null default '',
  dose text not null default '',
  given time,
  given_by text not null default '',
  photos text[] not null default '{}',
  edited timestamptz,
  created_at timestamptz not null default now()
);

alter table records enable row level security;

create policy "records: owner only"
  on records for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index records_user_date_idx on records (user_id, date);
create index records_user_bucket_idx on records (user_id, bucket);

-- ---------------------------------------------------------------------
-- contacts: personal address book entries (e.g. hub carer numbers). Private.
-- ---------------------------------------------------------------------
create table contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null default '',
  name text not null default '',
  phone text not null default '',
  email text not null default '',
  created_at timestamptz not null default now()
);

alter table contacts enable row level security;

create policy "contacts: owner only"
  on contacts for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- household: one row per carer -- their SSW details, EDT number, etc.
-- ---------------------------------------------------------------------
create table household (
  user_id uuid primary key references auth.users(id) on delete cascade,
  adults jsonb not null default '[]'::jsonb,
  ssw_name text not null default '',
  ssw_phone text not null default '',
  ssw_email text not null default '',
  ssw_manager_name text not null default '',
  ssw_manager_phone text not null default '',
  ssw_manager_email text not null default '',
  ssw_start date,
  edt text not null default '',
  updated_at timestamptz not null default now()
);

alter table household enable row level security;

create policy "household: owner only"
  on household for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- handovers: free-text handover notes, one per carer.
-- ---------------------------------------------------------------------
create table handovers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  content text not null default '',
  updated_at timestamptz not null default now()
);

alter table handovers enable row level security;

create policy "handovers: owner only"
  on handovers for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- reminders: personal to-do items with a due date.
-- ---------------------------------------------------------------------
create table reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null,
  date date not null,
  done boolean not null default false,
  done_at timestamptz,
  created_at timestamptz not null default now()
);

alter table reminders enable row level security;

create policy "reminders: owner only"
  on reminders for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- training_progress: which shared-catalog course a carer has completed,
-- and when. The catalog itself is shared (see 0002); completion dates
-- are personal to each carer.
-- ---------------------------------------------------------------------
create table training_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  course_title text not null,
  completed_on date not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, course_title)
);

alter table training_progress enable row level security;

create policy "training_progress: owner only"
  on training_progress for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- carer_settings: per-carer preferences (diary frequency, invoice/pay day).
-- ---------------------------------------------------------------------
create table carer_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  diary_every text not null default 'monthly' check (diary_every in ('weekly', 'monthly')),
  invoice_day int not null default 1,
  pay_day int not null default 28,
  updated_at timestamptz not null default now()
);

alter table carer_settings enable row level security;

create policy "carer_settings: owner only"
  on carer_settings for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
