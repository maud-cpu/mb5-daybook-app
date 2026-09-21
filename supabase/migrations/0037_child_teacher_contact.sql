-- 0037_child_teacher_contact.sql
--
-- School admin had a class rep and a school office contact, but no field
-- for the child's own teacher -- the single most likely school contact to
-- actually come up ("meeting with teacher... her email is..."). Adding it
-- so Capture has somewhere real to offer saving that to.

alter table child_school_admin add column teacher_name text not null default '';
alter table child_school_admin add column teacher_contact text not null default '';
