-- A diary's date_from/date_to is the PERIOD it covers, not when it was
-- actually sent to the supervising social worker -- those can genuinely
-- differ (a diary covering 1-15 March might not go out until the 20th).
-- Recording the real send date is what a "diary is overdue" nudge needs to
-- check against, not the content period.
alter table diaries add column sent_at date;
