-- The social worker who supervises/supports a Mockingbird hub (and so, in
-- practice, its satellites) is naturally part of that hub's own details,
-- alongside the hub carer's own name/phone/email -- see 0091. Same
-- encryption-at-rest treatment as every other contact field here.
alter table shared_hub_directory
  add column if not exists ssw_name text not null default '',
  add column if not exists ssw_name_enc text,
  add column if not exists ssw_phone text not null default '',
  add column if not exists ssw_phone_enc text,
  add column if not exists ssw_email text not null default '',
  add column if not exists ssw_email_enc text;
