-- 0036_backfill_length_from_title.sql
--
-- A handful of course titles already state their own duration in brackets
-- (e.g. "Intro to harmful sexual behaviour (6 hrs)"), but that duration was
-- never copied into the length field, so it wasn't showing next to the
-- title or usable for the length filter. This pulls it out of the title
-- text itself -- no guessing, just reading what's already there -- for any
-- row that doesn't already have a length set.
--
-- The other blank-length courses (First Aid, Working Together to Safeguard
-- Children, PACE, etc.) genuinely have no duration recorded anywhere in the
-- app's data -- they're on internal agency platforms (MyLearning, Training
-- Hub, SharePoint) this session can't reach, so those need someone who
-- knows the real course length to type it in via Admin -> Shared Content.

update shared_training_catalog
set length = trim(substring(title from '\(([0-9]+(?:\.[0-9]+)?\s*hrs?)\)'))
where length = ''
  and title ~ '\([0-9]+(?:\.[0-9]+)?\s*hrs?\)';
