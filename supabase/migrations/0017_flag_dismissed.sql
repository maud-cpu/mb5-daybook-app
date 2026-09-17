-- 0017_flag_dismissed.sql
--
-- Distinguishes "I did the thing" from "I've seen this and don't need it
-- nagging" for a flag/training follow-up. Both close it out of the open
-- list (flag_done stays the single switch that controls that), but this
-- records which way it was closed so Recently done can say "Done" vs
-- "Dismissed" instead of treating them the same.

alter table records add column flag_dismissed boolean not null default false;
