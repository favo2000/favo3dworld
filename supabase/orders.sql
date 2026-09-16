-- Guest checkout is exposed ONLY through the place-order Edge Function.
-- The database function is SECURITY INVOKER and executable only by service_role.
create table public."Orders" (
 id uuid primary key default gen_random_uuid(),
 order_number text not null unique default ('FW-' || to_char(now(),'YYYYMMDD') || '-' || upper(replace(gen_random_uuid()::text,'-',''))),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 first_name text not null, last_name text not null, email text not null,
 street text not null, postal_code text not null, city text not null, country text not null default 'CH',
 payment_method text not null default 'Rechnung' check (payment_method = 'Rechnung'),
 currency text not null default 'CHF' check (currency = 'CHF'),
 total numeric(12,2) not null check (total >= 0),
 status text not null default 'Neu' check (status in ('Neu','In Bearbeitung','Versendet','Abgeschlossen','Storniert')),
 request_key uuid not null unique,
 request_hash text not null,
 client_hash text not null
);
create table public."OrderItems" (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public."Orders"(id) on delete cascade,
 product_id bigint references public."Products"(id) on delete set null,
 product_name text not null,
 size text not null,
 colors jsonb not null check (jsonb_typeof(colors) = 'object'),
 quantity integer not null check (quantity between 1 and 20),
 unit_price numeric(12,2) not null check (unit_price >= 0),
 line_total numeric(12,2) generated always as (quantity * unit_price) stored
);
create index orders_created_idx on public."Orders"(created_at desc);
create index orders_client_idx on public."Orders"(client_hash,created_at desc);
create index orders_email_idx on public."Orders"(email,created_at desc);
create index order_items_order_idx on public."OrderItems"(order_id);
create index order_items_product_idx on public."OrderItems"(product_id);
alter table public."Orders" enable row level security;
alter table public."OrderItems" enable row level security;
revoke all on public."Orders",public."OrderItems" from public,anon,authenticated;
grant select on public."Orders",public."OrderItems" to authenticated;
grant update(status) on public."Orders" to authenticated;
grant all on public."Orders",public."OrderItems" to service_role;
create policy orders_admin_read on public."Orders" for select to authenticated
 using ((select auth.uid()) = '0e780550-3efb-4d78-b940-9566af5a398d'::uuid);
create policy orders_admin_status on public."Orders" for update to authenticated
 using ((select auth.uid()) = '0e780550-3efb-4d78-b940-9566af5a398d'::uuid)
 with check ((select auth.uid()) = '0e780550-3efb-4d78-b940-9566af5a398d'::uuid);
create policy order_items_admin_read on public."OrderItems" for select to authenticated
 using ((select auth.uid()) = '0e780550-3efb-4d78-b940-9566af5a398d'::uuid);
create function public.order_updated_at() returns trigger language plpgsql security invoker set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
revoke all on function public.order_updated_at() from public,anon,authenticated;
create trigger order_updated_at before update on public."Orders" for each row execute function public.order_updated_at();

create function public.submit_invoice_order(p_request jsonb, p_client_hash text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
 v_key uuid; v_hash text; v_existing public."Orders"%rowtype; v_order uuid;
 v_customer jsonb; v_item jsonb; v_product public."Products"%rowtype;
 v_items jsonb := '[]'::jsonb; v_qty integer; v_size text; v_colors jsonb;
 v_price numeric; v_total numeric := 0; v_field text; v_email text; v_palette text[];
 v_number text; v_created timestamptz;
begin
 if jsonb_typeof(p_request) is distinct from 'object' or p_request->>'payment_method' is distinct from 'Rechnung'
 then raise exception 'INVALID_REQUEST'; end if;
 if p_client_hash is null or p_client_hash !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_REQUEST'; end if;
 begin v_key := (p_request->>'request_key')::uuid; exception when others then raise exception 'INVALID_REQUEST'; end;
 if v_key is null then raise exception 'INVALID_REQUEST'; end if;
 v_hash := encode(sha256(convert_to(p_request::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended(v_key::text,0));
 select * into v_existing from public."Orders" where request_key=v_key;
 if found then
   if v_existing.request_hash <> v_hash then raise exception 'REQUEST_CONFLICT'; end if;
   return jsonb_build_object('order_number',v_existing.order_number,'total',v_existing.total,'currency','CHF','payment_method','Rechnung','status',v_existing.status,'created_at',v_existing.created_at);
 end if;
 v_customer := p_request->'customer';
 if jsonb_typeof(v_customer) is distinct from 'object' then raise exception 'INVALID_CUSTOMER'; end if;
 foreach v_field in array array['first_name','last_name','email','street','postal_code','city'] loop
   if jsonb_typeof(v_customer->v_field) is distinct from 'string' or length(trim(v_customer->>v_field)) not between 1 and 200 then raise exception 'INVALID_CUSTOMER'; end if;
 end loop;
 v_email := lower(trim(v_customer->>'email'));
 if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or v_customer->>'country' is distinct from 'CH' then raise exception 'INVALID_CUSTOMER'; end if;
 if jsonb_typeof(p_request->'items') is distinct from 'array' then raise exception 'INVALID_ITEMS'; end if;
 if jsonb_array_length(p_request->'items') not between 1 and 30 then raise exception 'INVALID_ITEMS'; end if;
 -- Serialize per client/email for rate limits and per product for stock consistency.
 perform pg_advisory_xact_lock(hashtextextended('client:'||p_client_hash,0));
 perform pg_advisory_xact_lock(hashtextextended('email:'||v_email,0));
 if (select count(*) from public."Orders" where client_hash=p_client_hash and created_at>now()-interval '15 minutes') >= 5
 or (select count(*) from public."Orders" where email=v_email and created_at>now()-interval '1 hour') >= 3 then raise exception 'RATE_LIMIT'; end if;
 -- Lock in a stable order, including products repeated with different colors.
 perform id from public."Products" where id in (select (x->>'product_id')::bigint from jsonb_array_elements(p_request->'items') x) order by id for update;
 for v_item in select value from jsonb_array_elements(p_request->'items') loop
   if jsonb_typeof(v_item) is distinct from 'object' or (v_item->>'quantity') !~ '^[0-9]{1,2}$' then raise exception 'INVALID_ITEMS'; end if;
   v_qty := (v_item->>'quantity')::integer;
   if v_qty is null or v_qty not between 1 and 20 then raise exception 'INVALID_ITEMS'; end if;
   select * into v_product from public."Products" where id=(v_item->>'product_id')::bigint and active=true;
   if not found then raise exception 'PRODUCT_UNAVAILABLE'; end if;
   v_size := v_item->>'size'; v_colors := v_item->'colors';
   if jsonb_typeof(v_colors) is distinct from 'object' then raise exception 'INVALID_OPTIONS'; end if;
   if v_product.name='Scheiben' then
     if v_size is distinct from 'fixed' or v_colors <> '{}'::jsonb then raise exception 'INVALID_OPTIONS'; end if;
     v_price := v_product.price_50;
   else
     v_price := case v_size when '50' then v_product.price_50 when '60' then v_product.price_60 when '70' then v_product.price_70 else null end;
     if v_product.name in ('Cavallo','Hoodie Drache','Pika Urban') then
       v_palette := case when v_product.name='Pika Urban' then array['gelb','grau','schwarz','rot'] else array['petrol','schwarz','weiss','gold','rot'] end;
       if not (v_colors ? 'primary' and v_colors ? 'secondary') or v_colors - 'primary' - 'secondary' <> '{}'::jsonb
          or not coalesce(v_colors->>'primary'=any(v_palette),false) or not coalesce(v_colors->>'secondary'=any(v_palette),false) then raise exception 'INVALID_OPTIONS'; end if;
     elsif v_product.color_mode='einfarbig' then
       if not (v_colors ? 'primary') or v_colors - 'primary' <> '{}'::jsonb
          or not coalesce(v_colors->>'primary'=any(array['petrol','schwarz','weiss','gold','rot','gruen']),false) then raise exception 'INVALID_OPTIONS'; end if;
     elsif v_colors <> '{}'::jsonb then raise exception 'INVALID_OPTIONS';
     end if;
   end if;
   if v_price is null or v_price < 0 then raise exception 'PRODUCT_UNAVAILABLE'; end if;
   if v_product.stock is not null then
     if v_product.stock < v_qty then raise exception 'OUT_OF_STOCK'; end if;
     update public."Products" set stock=stock-v_qty where id=v_product.id;
   end if;
   v_price := round(v_price,2); v_total := v_total + v_price*v_qty;
   v_items := v_items || jsonb_build_array(jsonb_build_object('product_id',v_product.id,'product_name',v_product.name,'size',v_size,'colors',v_colors,'quantity',v_qty,'unit_price',v_price));
 end loop;
 if (p_request->>'expected_total')::numeric is distinct from v_total then raise exception 'PRICE_CHANGED'; end if;
 insert into public."Orders"(first_name,last_name,email,street,postal_code,city,country,total,request_key,request_hash,client_hash)
 values(trim(v_customer->>'first_name'),trim(v_customer->>'last_name'),v_email,trim(v_customer->>'street'),trim(v_customer->>'postal_code'),trim(v_customer->>'city'),'CH',v_total,v_key,v_hash,p_client_hash)
 returning id,order_number,created_at into v_order,v_number,v_created;
 insert into public."OrderItems"(order_id,product_id,product_name,size,colors,quantity,unit_price)
 select v_order,(x->>'product_id')::bigint,x->>'product_name',x->>'size',x->'colors',(x->>'quantity')::integer,(x->>'unit_price')::numeric from jsonb_array_elements(v_items) x;
 return jsonb_build_object('order_number',v_number,'total',v_total,'currency','CHF','payment_method','Rechnung','status','Neu','created_at',v_created);
end;
$$;
revoke all on function public.submit_invoice_order(jsonb,text) from public,anon,authenticated;
grant execute on function public.submit_invoice_order(jsonb,text) to service_role;
