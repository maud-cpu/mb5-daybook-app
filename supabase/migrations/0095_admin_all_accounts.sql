-- admin_find_account (0094) needed an exact email to look an account up --
-- fine for a one-off check, but useless for "show me everyone" when there's
-- no time to search each one by hand. admin_all_accounts lists every
-- account that exists, not just the caller's own household, with the same
-- same_household/same_content flags so a separate-household carer (Cindy,
-- Laura) shows up right alongside co-carers instead of needing to be found.
create function admin_all_accounts()
returns table (
  user_id uuid,
  email text,
  display_name text,
  role text,
  account_created_at timestamptz,
  last_sign_in_at timestamptz,
  same_household boolean,
  same_content boolean
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
    select
      p.id,
      u.email,
      p.display_name,
      p.role,
      u.created_at,
      u.last_sign_in_at,
      p.household_owner_id = household_owner(),
      p.content_owner_id = content_owner()
    from profiles p
    join auth.users u on u.id = p.id
    order by (p.household_owner_id = household_owner()) desc, p.display_name;
end;
$$;
