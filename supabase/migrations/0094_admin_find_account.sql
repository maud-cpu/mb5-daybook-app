-- "Everyone with a login" (admin_carer_overview) is scoped to the caller's
-- own household_owner_id -- correct for managing co-carers, but it means
-- an admin who deliberately set someone up as a genuinely SEPARATE
-- household (a different foster family, via "Add a carer" -> Separate
-- household) can never see that account again afterwards: not to check
-- whether they've signed in, not to reset a forgotten password, and not to
-- see or fix whether they're actually sharing the admin's own
-- news/training/rota (content_owner_id) the way they were meant to.
--
-- admin_find_account looks an account up by email instead, with no
-- household scoping -- consistent with "Add a carer" already letting an
-- admin create an account in a totally separate household in the first
-- place; this is just the matching way back to it afterwards. Returns
-- whether the found account shares the CALLER's own household/content
-- group, so the admin UI can show "separate household, not sharing your
-- news/training/rota" plainly rather than the carer just mysteriously not
-- seeing updates.
create function admin_find_account(lookup_email text)
returns table (
  user_id uuid,
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
      p.display_name,
      p.role,
      u.created_at,
      u.last_sign_in_at,
      p.household_owner_id = household_owner(),
      p.content_owner_id = content_owner()
    from profiles p
    join auth.users u on u.id = p.id
    where lower(u.email) = lower(trim(lookup_email));
end;
$$;

-- Repoints an account onto the CALLER's own content group (their
-- news/shared training catalogue/rota) without touching household_owner_id
-- -- their own children/diary/calendar stay exactly as separate as they
-- were. Only ever sets it to the caller's own content_owner_id, so this
-- can't be used to point someone at a third party's content group.
create function admin_share_content_with(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'admin only';
  end if;

  update profiles set content_owner_id = content_owner() where id = target_user_id;
end;
$$;
