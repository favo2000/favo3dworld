-- Additive, backward-compatible product-size configuration. Existing legacy price_50/60/70 products remain valid when size_options is NULL.
begin;
alter table public."Products" add column if not exists size_options jsonb;
-- Existing catalog SELECT grants are column-specific to keep model_url private.
grant select(size_options) on public."Products" to anon,authenticated;
alter table public."Products" drop constraint if exists products_size_options_check;
alter table public."Products" add constraint products_size_options_check check (size_options is null or jsonb_typeof(size_options) = 'array');
create or replace function public.validate_product_size_options() returns trigger language plpgsql security invoker set search_path='' as $$
declare entry jsonb; seen text[] := '{}'; sid text; price numeric;
begin
 if new.size_options is null then return new; end if;
 if jsonb_typeof(new.size_options) is distinct from 'array' then raise exception 'INVALID_SIZE_OPTIONS'; end if;
 for entry in select value from jsonb_array_elements(new.size_options) loop
   if jsonb_typeof(entry) <> 'object' then raise exception 'INVALID_SIZE_OPTIONS'; end if;
   sid := entry->>'id';
   if sid is null or sid !~ '^[a-z0-9_-]{1,64}$' or sid = any(seen) then raise exception 'INVALID_SIZE_OPTIONS'; end if;
   if jsonb_typeof(entry->'name_de') is distinct from 'string' or jsonb_typeof(entry->'name_fr') is distinct from 'string'
     or length(trim(entry->>'name_de')) not between 1 and 100 or length(trim(entry->>'name_fr')) not between 1 and 100
     or jsonb_typeof(entry->'price') is distinct from 'number' then raise exception 'INVALID_SIZE_OPTIONS'; end if;
   begin price := (entry->>'price')::numeric; exception when others then raise exception 'INVALID_SIZE_OPTIONS'; end;
   if price is null or price <= 0 or price > 100000 or round(price,2) <> price then raise exception 'INVALID_SIZE_OPTIONS'; end if;
   seen := array_append(seen,sid);
 end loop;
 return new;
end; $$;
drop trigger if exists validate_product_size_options on public."Products";
create trigger validate_product_size_options before insert or update of size_options on public."Products" for each row execute function public.validate_product_size_options();
create or replace function public.submit_shop_order(p_request jsonb, p_client_hash text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
 v_key uuid; v_hash text; v_existing public."Orders"%rowtype; v_order uuid;
 v_customer jsonb; v_item jsonb; v_product public."Products"%rowtype;
 v_items jsonb := '[]'::jsonb; v_qty integer; v_size text; v_colors jsonb; v_size_option jsonb;
 v_kind text := coalesce(p_request->>'kind','order'); v_shipping numeric; v_subtotal numeric; v_price numeric; v_total numeric := 0; v_field text; v_email text; v_palette text[];
 v_number text; v_created timestamptz; v_scheiben_on_demand boolean := false;
 v_region jsonb; v_color jsonb; v_details jsonb; v_personal jsonb; v_text text; v_photo public."CustomerPhotos"%rowtype; v_photo_id uuid; v_photo_ids uuid[]:='{}';
begin
 if jsonb_typeof(p_request) is distinct from 'object' or v_kind not in ('order','inquiry') or (v_kind='order' and coalesce(p_request->>'payment_method','') not in ('PayPal','TWINT')) or (v_kind='inquiry' and p_request->>'payment_method' is not null) or p_request ? 'payment_status'
 then raise exception 'INVALID_REQUEST'; end if;
 if p_client_hash is null or p_client_hash !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_REQUEST'; end if;
 begin v_key := (p_request->>'request_key')::uuid; exception when others then raise exception 'INVALID_REQUEST'; end;
 if v_key is null then raise exception 'INVALID_REQUEST'; end if;
 v_hash := encode(sha256(convert_to(p_request::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended(v_key::text,0));
 select * into v_existing from public."Orders" where request_key=v_key;
 if found then
   if v_existing.request_hash <> v_hash then raise exception 'REQUEST_CONFLICT'; end if;
   return jsonb_build_object('order_number',v_existing.order_number,'total',v_existing.total,'currency','CHF','subtotal',v_existing.subtotal,'shipping',v_existing.shipping,'kind',v_existing.kind,'payment_method',v_existing.payment_method,'payment_status',v_existing.payment_status,'status',v_existing.status,'created_at',v_existing.created_at);
 end if;
 v_customer := p_request->'customer';
 if jsonb_typeof(v_customer) is distinct from 'object' then raise exception 'INVALID_CUSTOMER'; end if;
 foreach v_field in array case when v_kind='inquiry' then array['first_name','last_name','email'] else array['first_name','last_name','email','street','postal_code','city'] end loop
   if jsonb_typeof(v_customer->v_field) is distinct from 'string' or length(trim(v_customer->>v_field)) not between 1 and 200 then raise exception 'INVALID_CUSTOMER'; end if;
 end loop;
 v_email := lower(trim(v_customer->>'email'));
 if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or v_customer->>'country' is distinct from 'CH' then raise exception 'INVALID_CUSTOMER'; end if;
 if jsonb_typeof(p_request->'items') is distinct from 'array' then raise exception 'INVALID_ITEMS'; end if;
 if jsonb_array_length(p_request->'items') not between 1 and 30 then raise exception 'INVALID_ITEMS'; end if;
 if v_kind='inquiry' and jsonb_array_length(p_request->'items')<>1 then raise exception 'INVALID_ITEMS';end if;
 -- Serialize per client/email for rate limits and per product for stock consistency.
 perform pg_advisory_xact_lock(hashtextextended('client:'||p_client_hash,0));
 perform pg_advisory_xact_lock(hashtextextended('email:'||v_email,0));
 if (select count(*) from public."Orders" where client_hash=p_client_hash and created_at>now()-interval '15 minutes') >= 5
 or (select count(*) from public."Orders" where email=v_email and created_at>now()-interval '1 hour') >= 3 then raise exception 'RATE_LIMIT'; end if;
 -- Lock in a stable order, including products repeated with different colors.
 perform id from public."Products" where id in (select (x->>'product_id')::bigint from jsonb_array_elements(p_request->'items') x) order by id for update;
 -- Freeze fulfillment mode after the product lock. Exhausting positive stock
 -- in an earlier line of this request must not enable extra made-to-order units.
 select coalesce((select stock=0 from public."Products" where id=3),false) into v_scheiben_on_demand;
 for v_item in select value from jsonb_array_elements(p_request->'items') loop
   if jsonb_typeof(v_item) is distinct from 'object' or (v_item->>'quantity') !~ '^[0-9]{1,4}$' then raise exception 'INVALID_ITEMS'; end if;
   v_qty := (v_item->>'quantity')::integer;
   if v_qty is null or (v_kind='order' and v_qty not between 1 and 20) or (v_kind='inquiry' and v_qty not between 21 and 9999) then raise exception 'INVALID_ITEMS'; end if;
   select * into v_product from public."Products" where id=(v_item->>'product_id')::bigint and active=true;
   if not found then raise exception 'PRODUCT_UNAVAILABLE'; end if;
   if v_kind='inquiry' and v_product.stock is not null and not (v_product.id=3 and v_scheiben_on_demand) then raise exception 'INVALID_ITEMS';end if;
   v_size := v_item->>'size'; v_colors := v_item->'colors'; v_size_option := null;
   if jsonb_typeof(v_colors) is distinct from 'object' then raise exception 'INVALID_OPTIONS'; end if;
   if v_product.id=3 then
     if v_size is distinct from 'fixed' then raise exception 'INVALID_OPTIONS';end if;
     v_price:=v_product.price_50;
   else
     if jsonb_typeof(v_product.size_options)='array' then
       select value into v_size_option from jsonb_array_elements(v_product.size_options) where value->>'id'=v_size;
       if not found then raise exception 'INVALID_OPTIONS'; end if;
       v_price:=nullif(v_size_option->>'price','')::numeric;
     else
       v_price:=case v_size when '50' then v_product.price_50 when '60' then v_product.price_60 when '70' then v_product.price_70 else null end;
     end if;
   end if;
   if (select count(*) from jsonb_object_keys(v_colors))<>jsonb_array_length(v_product.color_regions) then raise exception 'INVALID_OPTIONS';end if;
   v_details:='[]'::jsonb;
   for v_region in select value from jsonb_array_elements(v_product.color_regions) loop
     select value into v_color from jsonb_array_elements(v_region->'colors') where value->>'id'=v_colors->>(v_region->>'id');
     if not found then raise exception 'INVALID_OPTIONS';end if;
     v_details:=v_details||jsonb_build_array(jsonb_build_object('region_id',v_region->>'id','region_de',v_region->>'name_de','region_fr',v_region->>'name_fr','color_id',v_color->>'id','name_de',v_color->>'name_de','name_fr',v_color->>'name_fr','hex',v_color->>'hex'));
   end loop;
   v_personal:=coalesce(nullif(v_item->'personalization','null'::jsonb),'{}'::jsonb);
   if jsonb_typeof(v_personal) is distinct from 'object' then raise exception 'INVALID_OPTIONS';end if;
   v_text:=coalesce(v_personal->>'text','');
   if (v_personal ? 'text' and jsonb_typeof(v_personal->'text') is distinct from 'string') or length(v_text)>2000 or (not v_product.allow_wish_text and v_text<>'') then raise exception 'INVALID_OPTIONS';end if;
   v_photo_id:=null;
   if v_personal ? 'id' then
     -- One photo belongs to one configured line, which may contain multiple copies.
     if v_product.photo_mode='none' or v_kind='inquiry' then raise exception 'INVALID_OPTIONS';end if;
     begin v_photo_id:=(v_personal->>'id')::uuid;exception when others then raise exception 'INVALID_OPTIONS';end;
     select * into v_photo from public."CustomerPhotos" where id=v_photo_id for update;
     if not found then raise exception 'INVALID_OPTIONS';end if;
     if v_photo.product_id is distinct from v_product.id or v_photo.status<>'ready' or v_photo.order_id is not null or v_photo.expires_at<=now()
       or v_photo.cart_item_id::text is distinct from v_personal->>'cart_item_id'
       or coalesce(v_personal->>'token','') !~ '^[a-f0-9]{64}$'
       or v_photo.token_hash is distinct from encode(sha256(convert_to(v_personal->>'token','UTF8')),'hex')
       or v_photo_id=any(v_photo_ids) then raise exception 'INVALID_OPTIONS';end if;
     v_photo_ids:=array_append(v_photo_ids,v_photo_id);
   elsif v_product.photo_mode='required' and v_kind='order' then raise exception 'INVALID_OPTIONS';end if;
   if v_price is null or v_price < 0 then raise exception 'PRODUCT_UNAVAILABLE'; end if;
   if v_kind='order' and v_product.stock is not null and not (v_product.id=3 and v_scheiben_on_demand) then
     if v_product.stock < v_qty then raise exception 'OUT_OF_STOCK'; end if;
     update public."Products" set stock=stock-v_qty where id=v_product.id;
   end if;
   v_price := round(v_price,2); v_total := v_total + v_price*v_qty;
   v_items := v_items || jsonb_build_array(jsonb_build_object('product_id',v_product.id,'product_name',v_product.name,'size',v_size,'size_label',case when v_size_option is not null then (v_size_option->>'name_de') || ' / ' || (v_size_option->>'name_fr') else null end,'colors',v_colors,'quantity',v_qty,'unit_price',v_price,'color_details',v_details,'wish_text',v_text,'customer_photo_id',v_photo_id));
 end loop;
 -- Duplicate lines cannot bypass the per-configuration cap.
 if v_kind='order' and exists(select 1 from jsonb_array_elements(v_items) x group by x->'product_id',x->'size',x->'colors',x->'wish_text',x->'customer_photo_id' having sum((x->>'quantity')::int)>20) then raise exception 'INVALID_ITEMS';end if;
 v_subtotal:=v_total; v_shipping:=case when v_kind='order' and v_subtotal<80 then 5 else 0 end; v_total:=v_subtotal+v_shipping;
 if v_kind='order' and (p_request->>'expected_total')::numeric is distinct from v_total then raise exception 'PRICE_CHANGED'; end if;
 insert into public."Orders"(first_name,last_name,email,street,postal_code,city,country,total,request_key,request_hash,client_hash,subtotal,shipping,payment_method,payment_status,kind)
 values(trim(v_customer->>'first_name'),trim(v_customer->>'last_name'),v_email,coalesce(trim(v_customer->>'street'),''),coalesce(trim(v_customer->>'postal_code'),''),coalesce(trim(v_customer->>'city'),''),'CH',v_total,v_key,v_hash,p_client_hash,v_subtotal,v_shipping,p_request->>'payment_method','unpaid',v_kind)
 returning id,order_number,created_at into v_order,v_number,v_created;
 insert into public."OrderItems"(order_id,product_id,product_id_snapshot,product_name,size,colors,quantity,unit_price,color_details,wish_text,customer_photo_id)
 select v_order,(x->>'product_id')::bigint,(x->>'product_id')::bigint,x->>'product_name',coalesce(x->>'size_label',x->>'size'),x->'colors',(x->>'quantity')::integer,(x->>'unit_price')::numeric,x->'color_details',x->>'wish_text',(x->>'customer_photo_id')::uuid from jsonb_array_elements(v_items) x;
 update public."CustomerPhotos" set status='attached',order_id=v_order where id=any(v_photo_ids);
 return jsonb_build_object('order_number',v_number,'total',v_total,'currency','CHF','subtotal',v_subtotal,'shipping',v_shipping,'kind',v_kind,'payment_method',p_request->>'payment_method','payment_status','unpaid','status','Neu','created_at',v_created);
end;
$$;
revoke all on function public.submit_shop_order(jsonb,text) from public,anon,authenticated;
grant execute on function public.submit_shop_order(jsonb,text) to service_role;
commit;
