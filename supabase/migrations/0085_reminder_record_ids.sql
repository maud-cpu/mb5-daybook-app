-- record_id (0074) only ever links a reminder to a SINGLE priced record,
-- and falls back to null the moment two daycare items merge into one
-- reminder (e.g. two separate sessions for the same child, same day,
-- producing identical reminder text) -- "ambiguous" was treated as "no
-- link at all", so deleting either (or both) of the underlying expense
-- records left the reminder behind with no way to find it. record_ids
-- tracks every contributing record, so the delete cascade in
-- app/api/records/route.ts can find a merged reminder too, not just a
-- cleanly single-linked one.
alter table reminders add column if not exists record_ids uuid[] not null default '{}';
