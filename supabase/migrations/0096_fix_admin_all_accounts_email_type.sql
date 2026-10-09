-- auth.users.email is character varying, not text -- admin_all_accounts
-- (0095) declared its email output column as text but selected u.email
-- unchanged, so Postgres raised "structure of query does not match
-- function result type" the first time it actually ran (plpgsql bodies
-- aren't type-checked against query results until execution, so the
-- CREATE itself succeeded and the bug only surfaced on first call). Cast
-- fixes it; the declared return signature is unchanged so this is a plain
-- replace, no drop needed.
create or replace function admin_all_accounts()
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
      u.email::text,
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
