-- News & Events: a shared feed for things like Surrey/agency
-- announcements and training opportunities, pasted in once by an admin
-- (from an email, WhatsApp message, etc) and seen by every carer, rather
-- than being retyped or forwarded to each person separately. A training
-- item can also be linked to a shared_training_catalog row it created, so
-- the same opportunity shows on both Training & Resources and here without
-- being entered twice.
create table shared_news (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null default '',
  category text not null default 'announcement' check (category in ('announcement', 'training', 'general')),
  source_text text not null default '',
  expires_on date,
  linked_course_id uuid references shared_training_catalog(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table shared_news enable row level security;

create policy "shared_news: any signed-in user can read"
  on shared_news for select
  using (auth.uid() is not null);

create policy "shared_news: admins can write"
  on shared_news for all
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Per-carer "seen this, don't show it again" -- dismissing a notice never
-- removes it for anyone else, and an admin editing/removing it from the
-- shared list is the only way it disappears for everyone.
create table dismissed_news (
  user_id uuid not null references auth.users(id) on delete cascade,
  news_id uuid not null references shared_news(id) on delete cascade,
  dismissed_at timestamptz not null default now(),
  primary key (user_id, news_id)
);

alter table dismissed_news enable row level security;

create policy "dismissed_news: owner only"
  on dismissed_news for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
