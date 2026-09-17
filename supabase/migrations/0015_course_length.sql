-- 0015_course_length.sql
--
-- A rough "what it is and how long" tag for each training resource, e.g.
-- "Video, 3 min" or "Podcast, 32 min" -- so a carer can see at a glance
-- whether a suggestion is a quick watch or a longer commitment before
-- opening it. Free text, admin-entered; nothing computes or verifies it.

alter table shared_training_catalog add column length text not null default '';
