# Database setup

Run the files in `migrations/` in order (`0001` → `0004`) using the
**SQL Editor** in the Supabase dashboard, or via the Supabase CLI
(`supabase db push`) once the project is linked.

## Promoting the first admin

Every new user starts as a `carer`. After you've signed up your own account,
make it an admin by running this in the SQL Editor (replace the email):

```sql
update profiles set role = 'admin'
where id = (select id from auth.users where email = 'you@example.com');
```

## Adding a new migration later

Never edit a file in `migrations/` that has already been run against the
live database — add a new numbered file instead (e.g. `0005_...sql`) with
just the change you need (a new column, a new shared table, a fix). This
keeps every past change additive and auditable, and means existing data is
never at risk from a later fix.
