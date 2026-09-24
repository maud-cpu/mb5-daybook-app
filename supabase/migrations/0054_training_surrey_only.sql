-- 0054_training_surrey_only.sql
--
-- A carer outside Surrey (a different local authority/agency) shouldn't
-- see Surrey's own mandatory training requirements as if they applied to
-- them -- but the rest of the catalogue (safer caring, PACE, general
-- fostering skills, the YourKids articles) is generic and genuinely
-- useful regardless of which authority someone is with. surrey_only marks
-- the courses that came specifically from Surrey's own mandatory-training
-- policy (the pre-approval/once-only/3-yearly groups) so a new
-- non-Surrey household's starter copy of the catalogue (see
-- app/admin/carers/actions.ts) can leave those out while keeping
-- everything else.

alter table shared_training_catalog add column surrey_only boolean not null default false;
update shared_training_catalog set surrey_only = true where group_key in ('pre', 'once', '3yr');
