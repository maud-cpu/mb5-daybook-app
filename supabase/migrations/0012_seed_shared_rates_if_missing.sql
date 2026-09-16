-- 0012_seed_shared_rates_if_missing.sql
--
-- shared_rates is meant to hold exactly one row (the current pay-rate
-- card), seeded by migration 0002. On this database that row is
-- missing, which makes every "select ... single()" call for it fail --
-- so the Rates screen is stuck on "Loading...", and every day-care /
-- expense amount that depends on those rates silently can't be worked
-- out anywhere in the app. This inserts the same default values 0002
-- would have, but ONLY if the table is currently empty, so it can never
-- clobber a rate card you've since edited yourself.

insert into shared_rates (label, mileage, daily_deduct, hour_first, hour_add, day_first, day_add, overnight)
select
  'Surrey CC, April 2026',
  0.45,
  20,
  12.71,
  10.17,
  '{"0-4": 63.57, "5-10": 67.76, "11-13": 79.53, "14-18": 87.15}',
  '{"0-4": 50.86, "5-10": 54.21, "11-13": 63.62, "14-18": 69.72}',
  '{"0-4": 93.06, "5-10": 97.24, "11-13": 109.02, "14-18": 120.08}'
where not exists (select 1 from shared_rates);
