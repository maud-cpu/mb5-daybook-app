-- 0062_visiting_child_linked_visitor.sql
--
-- Grouping a visiting child under "the adult they're visiting with" by
-- matching their free-text family field against a visitor's name (0061's
-- fix for the same problem) is still just string matching -- two visitors
-- sharing a first name (or a family field that happens to match someone
-- else's name) picks the WRONG adult with no way to tell it apart. A real
-- link removes the ambiguity entirely: it's either this exact visitor row
-- or nobody, never a guess.

alter table children add column linked_visitor_id uuid references household_visitors(id) on delete set null;
