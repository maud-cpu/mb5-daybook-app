-- 0050_rota_hours_by_day.sql
--
-- 0049's single free-text description was accurate but static -- it
-- always showed the whole rule ("6pm-11pm Mon-Fri, 10am-11pm Sat/Sun &
-- Bank Holidays") regardless of which part actually applies today. Split
-- into weekday vs weekend hours so the phone quick-access can show just
-- today's actual window. Bank holidays aren't detected automatically (no
-- UK holiday calendar wired in) -- weekend hours apply Saturday/Sunday
-- only; a carer working a bank holiday weekday should read it as a
-- weekend day for this purpose. No real data existed yet, so this is a
-- straight column swap, not a migration of anything already entered.

alter table shared_rota_hours drop column description;
alter table shared_rota_hours add column weekday_hours text not null default '';
alter table shared_rota_hours add column weekend_hours text not null default '';
