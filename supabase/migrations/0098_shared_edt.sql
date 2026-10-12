-- EDT (the Emergency Duty Team's DAYTIME number) is the same physical
-- number for every carer in a content group, exactly like the
-- out-of-hours rota hours it sits alongside on the phone quick-access --
-- it was previously stored per carer on the household table (encrypted,
-- see app/api/household/route.ts's ENC_FIELDS), which meant every single
-- carer had to type it in separately and most never did. Moved onto
-- shared_rota_hours, admin-set once, visible to everyone -- same
-- read/write policy weekday_hours/weekend_hours already have (0053:
-- readable by the whole content group, writable only by its owner).
-- The old household.edt column is left in place rather than dropped --
-- no reader is left pointing at it after this, but dropping it is extra
-- migration risk for no functional benefit.
alter table shared_rota_hours add column edt text not null default '';

-- Fills it in for every content group that hasn't already set their own --
-- requested directly: this is the same real number for every carer here,
-- so there's nothing for each one to individually type in.
update shared_rota_hours set edt = '01483 517 898' where edt = '';
