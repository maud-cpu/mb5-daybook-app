-- 0020_course_description.sql
--
-- The AI training-matcher currently only sees each course's title when
-- deciding whether it's relevant to a diary note -- it never watches the
-- video or reads the article. A short admin-written description gives it
-- much richer signal to match against (optional, so existing courses keep
-- working with title-only matching until someone fills one in).

alter table shared_training_catalog add column description text not null default '';
