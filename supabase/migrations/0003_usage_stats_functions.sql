-- 0003_usage_stats_functions.sql
--
-- Gives the admin dashboard a way to see *usage* -- who is logging in, how
-- many entries they're making, when they last wrote one -- without ever
-- being able to read what anyone actually wrote. Each function is
-- SECURITY DEFINER (so it can look across every carer's rows) but starts
-- by checking the caller is an admin, and only ever selects id/date/
-- category columns -- never text, amount, flag_note, or any other content
-- column from `records`.

create function is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin');
$$;

-- One row per carer: who they are and when they last/first signed in.
-- Reads auth.users, which ordinary users can't query directly.
create function admin_carer_overview()
returns table (
  user_id uuid,
  display_name text,
  role text,
  account_created_at timestamptz,
  last_sign_in_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'admin only';
  end if;

  return query
    select p.id, p.display_name, p.role, u.created_at, u.last_sign_in_at
    from profiles p
    join auth.users u on u.id = p.id
    order by p.display_name;
end;
$$;

-- One row per entry, but only its date and category -- never its content.
-- The dashboard computes entry counts and streaks from this in code.
create function admin_entry_dates()
returns table (
  user_id uuid,
  entry_date date,
  bucket text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'admin only';
  end if;

  return query
    select r.user_id, r.date, r.bucket
    from records r;
end;
$$;

revoke all on function admin_carer_overview() from public;
revoke all on function admin_entry_dates() from public;
grant execute on function admin_carer_overview() to authenticated;
grant execute on function admin_entry_dates() to authenticated;
