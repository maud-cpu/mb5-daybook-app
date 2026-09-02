-- 0008_diaries.sql
--
-- The "Diary for social worker" document -- one draft per reporting
-- period (a set of children + a date range), private to the carer who
-- wrote it, same privacy rules as everything else in `records`.

create table diaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  child_names text[] not null default '{}',
  date_from date,
  date_to date,
  sw_name text not null default '',
  comments text not null default '',
  achievements text not null default '',
  good text not null default '',
  worries text not null default '',
  views text not null default '',
  appointments text not null default '',
  family text not null default '',
  health text not null default '',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, child_names, date_from, date_to)
);

alter table diaries enable row level security;

create policy "diaries: owner only"
  on diaries for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
