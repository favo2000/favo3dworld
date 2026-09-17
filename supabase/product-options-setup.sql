-- Additive setup. Existing prices, inventory, images, model references and policies are untouched.
begin;
create function public.valid_product_color_regions(regions jsonb) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare r jsonb; c jsonb; ids text[]:='{}'; colors text[];
begin
 if jsonb_typeof(regions) is distinct from 'array' or octet_length(regions::text)>262144 then return false;end if;
 for r in select value from jsonb_array_elements(regions) loop
  if jsonb_typeof(r) is distinct from 'object' or coalesce(r->>'id','') !~ '^[a-z0-9_-]{1,64}$' or r->>'id'=any(ids)
    or jsonb_typeof(r->'name_de') is distinct from 'string' or length(trim(r->>'name_de')) not between 1 and 100
    or jsonb_typeof(r->'name_fr') is distinct from 'string' or length(trim(r->>'name_fr')) not between 1 and 100
    or jsonb_typeof(r->'colors') is distinct from 'array' then return false;end if;
  if jsonb_array_length(r->'colors')=0 then return false;end if;
  ids:=array_append(ids,r->>'id');colors:='{}';
  for c in select value from jsonb_array_elements(r->'colors') loop
   if jsonb_typeof(c) is distinct from 'object' or coalesce(c->>'id','') !~ '^[a-z0-9_-]{1,64}$' or c->>'id'=any(colors)
     or jsonb_typeof(c->'name_de') is distinct from 'string' or length(trim(c->>'name_de')) not between 1 and 100
     or jsonb_typeof(c->'name_fr') is distinct from 'string' or length(trim(c->>'name_fr')) not between 1 and 100
     or coalesce(c->>'hex','') !~ '^#[0-9a-fA-F]{6}$' then return false;end if;
   colors:=array_append(colors,c->>'id');
  end loop;
 end loop;return true;
end;$$;
revoke all on function public.valid_product_color_regions(jsonb) from public;
grant execute on function public.valid_product_color_regions(jsonb) to anon,authenticated,service_role;
alter table public."Products"
 add column color_regions jsonb not null default '[]'::jsonb check(public.valid_product_color_regions(color_regions)),
 add column category text check(category in ('fantasy','decor','animals','scifi','vehicles','gifts','statues','tabletop','wedding')),
 add column seasons text[] not null default '{}' check(seasons <@ array['christmas','easter','halloween','valentine']::text[] and array_position(seasons,null) is null),
 add column photo_mode text not null default 'none' check(photo_mode in ('none','optional','required')),
 add column allow_wish_text boolean not null default false;
grant select(color_regions,category,seasons,photo_mode,allow_wish_text) on public."Products" to anon,authenticated;

create table public."CustomerPhotos"(
 id uuid primary key default gen_random_uuid(), product_id bigint references public."Products"(id) on delete set null,
 cart_item_id uuid not null, token_hash text not null check(token_hash ~ '^[a-f0-9]{64}$'),
 object_path text not null unique, client_hash text not null check(client_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '7 days',
 status text not null default 'pending' check(status in ('pending','ready','attached','failed')),
 order_id uuid references public."Orders"(id), mime text not null check(mime in ('image/jpeg','image/png','image/webp'))
);
create index customer_photos_rate on public."CustomerPhotos"(client_hash,created_at);
create index customer_photos_expiry on public."CustomerPhotos"(expires_at) where order_id is null;
create index customer_photos_product on public."CustomerPhotos"(product_id);
create index customer_photos_order on public."CustomerPhotos"(order_id);
alter table public."CustomerPhotos" enable row level security;
revoke all on public."CustomerPhotos" from public,anon,authenticated;
grant select on public."CustomerPhotos" to authenticated;
grant all on public."CustomerPhotos" to service_role;
create policy "Only admin reads customer photo records" on public."CustomerPhotos" for select to authenticated using((select public.is_favo_admin()));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('customer-photos','customer-photos',false,5242880,array['image/jpeg','image/png','image/webp']);
create policy "Only admin reads customer photos" on storage.objects for select to authenticated
using(bucket_id='customer-photos' and (select public.is_favo_admin()));
-- No visitor INSERT/SELECT/UPDATE/DELETE policies. A bounded, rate-limited Edge Function handles uploads.
create function public.reserve_customer_photo(p_product bigint,p_cart uuid,p_token_hash text,p_client_hash text,p_mime text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare photo_id uuid:=gen_random_uuid(); path text; ext text;
begin
 if p_cart is null or coalesce(p_token_hash,'') !~ '^[a-f0-9]{64}$' or coalesce(p_client_hash,'') !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_REQUEST';end if;
 ext:=case p_mime when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' end;
 if ext is null then raise exception 'INVALID_REQUEST';end if;
 if not exists(select 1 from public."Products" where id=p_product and active and photo_mode in ('optional','required')) then raise exception 'PRODUCT_UNAVAILABLE';end if;
 perform pg_advisory_xact_lock(hashtextextended('customer-photo-upload',0));
 if (select count(*) from public."CustomerPhotos" where client_hash=p_client_hash and created_at>now()-interval '15 minutes')>=5
 or (select count(*) from public."CustomerPhotos" where client_hash=p_client_hash and created_at>now()-interval '1 day')>=20
 or (select count(*) from public."CustomerPhotos" where created_at>now()-interval '1 day')>=200 then raise exception 'RATE_LIMIT';end if;
 path:=photo_id::text||'.'||ext;
 insert into public."CustomerPhotos"(id,product_id,cart_item_id,token_hash,object_path,client_hash,mime) values(photo_id,p_product,p_cart,p_token_hash,path,p_client_hash,p_mime);
 return jsonb_build_object('id',photo_id,'path',path);
end;$$;
revoke all on function public.reserve_customer_photo(bigint,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.reserve_customer_photo(bigint,uuid,text,text,text) to service_role;
alter table public."OrderItems" add column color_details jsonb not null default '[]',
 add column wish_text text not null default '' check(length(wish_text)<=2000),
 add column customer_photo_id uuid references public."CustomerPhotos"(id);
create index order_items_customer_photo on public."OrderItems"(customer_photo_id);
commit;
