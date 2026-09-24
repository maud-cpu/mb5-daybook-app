-- 0055_news_actions_taken.sql
--
-- The Calendar/To-do/Notes quick actions on a News & Events item only
-- gave a 2-second confirmation toast, then reverted to the plain
-- buttons -- easy to forget you'd already actioned something days later.
-- Records which quick actions have been used per carer per news item, so
-- the buttons can show a persistent "already added" state instead.
--
-- dismissed_at loses its default/not-null so a row can exist purely to
-- record actions_taken without that item being dismissed (e.g. adding to
-- calendar shouldn't hide the notice) -- app code now sets dismissed_at
-- explicitly when actually dismissing.

alter table dismissed_news alter column dismissed_at drop not null;
alter table dismissed_news alter column dismissed_at drop default;
alter table dismissed_news add column actions_taken text[] not null default '{}';
