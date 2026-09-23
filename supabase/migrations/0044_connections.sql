-- 0044_connections.sql
--
-- Lets two carers from separate households (e.g. a Mockingbird hub carer
-- and one of the carers in their circle) opt in to connect with each
-- other, as a precursor to in-app messaging (0045). A connection only
-- becomes usable once both sides have agreed -- either side can request,
-- only the recipient can accept or decline.

create table connections (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint connections_not_self check (requester_id <> recipient_id)
);

-- One relationship per pair of people regardless of who requested it --
-- least/greatest normalises the pair so (A,B) and (B,A) collide.
create unique index connections_unique_pair_idx
  on connections (least(requester_id, recipient_id), greatest(requester_id, recipient_id));

alter table connections enable row level security;

create policy "connections: participants can read"
  on connections for select
  using (requester_id = auth.uid() or recipient_id = auth.uid());

create policy "connections: request as yourself"
  on connections for insert
  with check (requester_id = auth.uid());

-- The recipient can set any status (accept/decline). The requester can
-- only ever move their own outgoing request to 'declined' (cancelling
-- it) -- never approve their own request on the recipient's behalf.
create policy "connections: recipient can respond"
  on connections for update
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

create policy "connections: requester can cancel their own request"
  on connections for update
  using (requester_id = auth.uid())
  with check (requester_id = auth.uid() and status = 'declined');

create policy "connections: either side can delete"
  on connections for delete
  using (requester_id = auth.uid() or recipient_id = auth.uid());

-- A carer can only ever read their own profile row (or, if they're an
-- admin, their own household's) -- so once connected (or even just
-- requested) to someone in a *different* household, there'd be no way to
-- even show that person's name. This lets either side of any connections
-- row -- pending, accepted, or declined -- read the other's basic
-- profile row (still just display_name/role, nothing private); a pending
-- request still needs to show the recipient who's asking.
create policy "profiles: connected users can read each other"
  on profiles for select
  using (
    exists (
      select 1 from connections c
      where (c.requester_id = auth.uid() and c.recipient_id = profiles.id)
         or (c.recipient_id = auth.uid() and c.requester_id = profiles.id)
    )
  );

-- Resolving "connect with someone@example.com" to their account needs to
-- look up auth.users by email, which ordinary users can't query directly
-- (no public users table exists). Only ever returns the id -- nothing
-- else about that account -- and only once a match is confirmed.
create function resolve_user_by_email(target_email text)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select id from auth.users where lower(email) = lower(target_email) limit 1;
$$;

revoke all on function resolve_user_by_email(text) from public;
grant execute on function resolve_user_by_email(text) to authenticated;
