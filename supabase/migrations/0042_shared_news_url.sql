-- A link was only ever offered when a news item was categorised as
-- training (since that's what fed the Training & Resources catalogue
-- entry) -- but a plain announcement (a new portal, a policy document, a
-- form to fill in) often needs a link just as much and had nowhere to put
-- one except inline in the body text.
alter table shared_news add column if not exists url text not null default '';
