-- Independent portfolio storage. No Products, orders, payment functions or secrets are changed.
create table public.portfolio_projects (
 id uuid primary key default gen_random_uuid(),
 name text not null check (char_length(btrim(name)) between 1 and 200),
 description_de text not null check (char_length(btrim(description_de)) between 1 and 5000),
 description_fr text check (description_fr is null or char_length(description_fr) <= 5000),
 image_paths text[] not null default '{}',
 published boolean not null default false,
 created_at timestamptz not null default now(),
 constraint portfolio_photo_count check (cardinality(image_paths) <= 12 and (not published or cardinality(image_paths) >= 1)),
 constraint portfolio_photo_paths check (array_position(image_paths,null) is null and array_to_string(image_paths,',') ~ '^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)(,[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp))*)?$')
);
alter table public.portfolio_projects enable row level security;
revoke all on public.portfolio_projects from anon, authenticated;
grant select on public.portfolio_projects to anon, authenticated;
grant insert, update on public.portfolio_projects to authenticated;
create policy "Published portfolio is public" on public.portfolio_projects for select to anon, authenticated using (published);
create policy "Favo admin reads portfolio drafts" on public.portfolio_projects for select to authenticated using ((select public.is_favo_admin()));
create policy "Favo admin creates portfolio" on public.portfolio_projects for insert to authenticated with check ((select public.is_favo_admin()));
create policy "Favo admin edits portfolio" on public.portfolio_projects for update to authenticated using ((select public.is_favo_admin())) with check ((select public.is_favo_admin()));
create index portfolio_public_order on public.portfolio_projects (created_at desc,id desc) where published;
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types) values ('portfolio-images','portfolio-images',true,5242880,array['image/jpeg','image/png','image/webp']);
create policy "Favo admin uploads portfolio photos" on storage.objects for insert to authenticated with check (bucket_id='portfolio-images' and (select public.is_favo_admin()) and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$');
create policy "Favo admin lists portfolio photos" on storage.objects for select to authenticated using (bucket_id='portfolio-images' and (select public.is_favo_admin()));
-- No delete or overwrite permissions: unpublishing and photo reassignment are reversible.
