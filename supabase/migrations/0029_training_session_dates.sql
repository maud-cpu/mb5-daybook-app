-- 0029_training_session_dates.sql
--
-- A face-to-face training session has an actual date to be somewhere on,
-- unlike everything else in the catalogue (a book, a video, an e-learning
-- course you do whenever). is_face_to_face + session_date let an admin
-- mark a course as one and give it a shared date everyone sees; a carer
-- can also set/override their own date on training_progress, in case
-- they've booked a different running of the same session.

alter table shared_training_catalog add column is_face_to_face boolean not null default false;
alter table shared_training_catalog add column session_date date;

-- A booked-but-not-yet-attended session needs a training_progress row with only
-- session_date set -- completed_on can no longer be required on every row.
alter table training_progress alter column completed_on drop not null;
alter table training_progress add column session_date date;
