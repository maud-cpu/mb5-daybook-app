-- 0045_messages.sql
--
-- The actual messages sent between two accepted-connection participants.
-- Deliberately simple: no read receipts, no editing/deleting, no
-- real-time delivery -- the Circle screen refetches on open/focus, which
-- is all that was asked for ("simple refresh-based inbox, not live
-- chat"). A message can only be read or sent by someone who is a
-- participant in an *accepted* connection -- a pending or declined
-- connection never grants message access.

create table messages (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references connections(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index messages_connection_idx on messages (connection_id, created_at);

alter table messages enable row level security;

create policy "messages: connection participants can read"
  on messages for select
  using (
    exists (
      select 1 from connections c
      where c.id = connection_id
        and c.status = 'accepted'
        and (c.requester_id = auth.uid() or c.recipient_id = auth.uid())
    )
  );

create policy "messages: connection participants can send"
  on messages for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from connections c
      where c.id = connection_id
        and c.status = 'accepted'
        and (c.requester_id = auth.uid() or c.recipient_id = auth.uid())
    )
  );
