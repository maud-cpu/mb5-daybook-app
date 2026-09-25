-- 0064_hub_members_households.sql
--
-- Every hub carer has their own household -- a partner, and often a mix of
-- birth and looked-after children -- and a note naming any of them ("Zoe's
-- had a rough week", "her partner Dave took the kids swimming") is still
-- news about that carer's household, not just when the carer's own name is
-- used. Extending hub_members (rather than replacing it) so the names
-- already added stay exactly as they are, just tagged as the household's
-- "carer" by default.

alter table hub_members add column household_label text;
alter table hub_members add column role text not null default 'carer' check (role in ('carer', 'partner', 'child'));
