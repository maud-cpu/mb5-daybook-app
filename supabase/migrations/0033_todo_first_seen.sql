-- 0033_todo_first_seen.sql
--
-- Things To Do is computed fresh on every load from live conditions (a
-- missing EDT number, an overdue training renewal, a reminder due) -- so
-- there's never been any record of how long any one of them has actually
-- been sitting there. That's exactly what was making the list feel like
-- the same nagging wall every day: nothing distinguished "this just
-- appeared" from "this has been here for three weeks." This table records
-- the first date each item's key was ever seen, so the card can split
-- "new today" from "been on your list a while" -- the key itself already
-- naturally resets for anything month-recurring (see dismissKeyFor in
-- ThingsToDoCard.tsx), so this doesn't need any extra logic to "expire".

create table todo_first_seen (
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  key text not null,
  first_seen date not null default current_date,
  primary key (user_id, key)
);

alter table todo_first_seen enable row level security;

create policy "todo_first_seen: owner only"
  on todo_first_seen for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
