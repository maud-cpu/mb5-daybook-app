-- How many nights a single overnight day care record covers -- a planned
-- multi-night stay (e.g. "Eli, 27 September to 14 October") is now logged
-- as ONE expense row for the whole stay rather than one row per night,
-- with the full amount billed immediately rather than held back night by
-- night. Null/1 for an ordinary single-night entry.
alter table records add column if not exists nights integer;
