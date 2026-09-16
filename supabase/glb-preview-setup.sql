-- Additive GLB preview setup. Existing rows and private model storage are untouched.
-- Applied through the Supabase migration API, not a client/browser script.
begin;
alter table public."Products" add column glb_path text;
alter table public."Products" add constraint products_glb_path_format check (
  glb_path is null or glb_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.glb$'
);
grant select (glb_path) on public."Products" to anon, authenticated;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-glb', 'product-glb', true, 26214400, array['model/gltf-binary']);
create policy "Favo admin manages GLB previews" on storage.objects
for all to authenticated
using (bucket_id = 'product-glb' and (select public.is_favo_admin()))
with check (
  bucket_id = 'product-glb' and (select public.is_favo_admin())
  and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.glb$'
);
commit;
