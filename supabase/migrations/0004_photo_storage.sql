-- 0004_photo_storage.sql
--
-- Photos attached to entries are stored in a private Supabase Storage
-- bucket, one folder per carer (path: <user_id>/<filename>). Only the
-- owning carer can read or write their own folder.

insert into storage.buckets (id, name, public)
values ('entry-photos', 'entry-photos', false)
on conflict (id) do nothing;

create policy "entry-photos: owner can read"
  on storage.objects for select
  using (bucket_id = 'entry-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "entry-photos: owner can upload"
  on storage.objects for insert
  with check (bucket_id = 'entry-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "entry-photos: owner can delete"
  on storage.objects for delete
  using (bucket_id = 'entry-photos' and (storage.foldername(name))[1] = auth.uid()::text);
