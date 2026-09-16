-- 0014_course_direct_link.sql
--
-- shared_training_catalog courses could previously only link out via a
-- shared "platform" (one login/catalogue URL reused across many courses,
-- e.g. MyLearning). That doesn't fit a one-off resource -- a specific
-- YouTube video, TED talk, or podcast episode -- which needs its own
-- direct link rather than a shared login page. This adds an optional
-- per-course URL that, when set, is used instead of the platform link.

alter table shared_training_catalog add column url text not null default '';
