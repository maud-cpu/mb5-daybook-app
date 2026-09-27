-- 0066_visitor_partner_link.sql
--
-- A hub carer's partner has been getting added as their own separate
-- household_visitors row, with no way to say "these two are the same
-- household" -- so they show as a separate line in the Visitors directory
-- and the Hub Log roster, instead of next to their partner and before any
-- linked children. Mirrors children.linked_visitor_id (0062): a visitor can
-- link to one other visitor as "their partner / same household", and the
-- app groups a linked pair onto one line rather than two.

alter table household_visitors
  add column linked_visitor_id uuid references household_visitors(id) on delete set null;

alter table household_visitors
  add constraint household_visitors_not_self_linked check (linked_visitor_id is null or linked_visitor_id <> id);
