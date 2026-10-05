-- calendar_feed_reminders() (0084) is called from app/api/public/calendar-
-- feed/route.ts with no session at all -- a phone/Google calendar app has
-- no login, so the token in the URL is the only credential, and the
-- Supabase client there always uses the anon key. Every other RPC this
-- app calls from the client explicitly grants execute to the role that
-- needs it (see admin_carer_overview in 0003, resolve_user_by_email in
-- 0044) -- 0084 never did, so "permission denied for function" from
-- Postgres was the actual reason every subscribe link failed, surfacing
-- to the calendar app as a generic "couldn't load that calendar".
grant execute on function calendar_feed_reminders(uuid) to anon, authenticated;
