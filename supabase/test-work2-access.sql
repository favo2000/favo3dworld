-- Integration test with real database roles; all fixtures are rolled back.
begin;
insert into public."Orders"(first_name,last_name,email,street,postal_code,city,total,subtotal,shipping,payment_method,payment_status,request_key,request_hash,client_hash)
values('Access','Fixture','access-test@example.invalid','Test 1','1000','Test',15,10,5,'PayPal','unpaid',gen_random_uuid(),repeat('a',64),repeat('b',64));
select set_config('work2.order_id',(select id::text from public."Orders" where email='access-test@example.invalid'),true);
insert into public."OrderItems"(order_id,product_id_snapshot,product_name,size,colors,quantity,unit_price)
values(current_setting('work2.order_id')::uuid,3,'Access fixture','fixed','{}',1,10);
set local role authenticated;
select set_config('request.jwt.claim.sub','0e780550-3efb-4d78-b940-9566af5a398d',true);
do $$ begin
 if not public.is_favo_admin() then raise exception 'FAIL admin authorization';end if;
 if not exists(select 1 from public."Orders" where id=current_setting('work2.order_id')::uuid) then raise exception 'FAIL admin read';end if;
 if not exists(select 1 from public."OrderItems" where order_id=current_setting('work2.order_id')::uuid) then raise exception 'FAIL admin items';end if;
 update public."Orders" set status='In Bearbeitung' where id=current_setting('work2.order_id')::uuid;
 if not found then raise exception 'FAIL admin status';end if;
 begin update public."Orders" set payment_status='paid' where id=current_setting('work2.order_id')::uuid;raise exception 'FAIL admin payment write';exception when insufficient_privilege then null;end;
 begin update public."OrderItems" set quantity=20 where order_id=current_setting('work2.order_id')::uuid;raise exception 'FAIL mutable snapshot';exception when insufficient_privilege then null;end;
 begin delete from public."Orders" where id=current_setting('work2.order_id')::uuid;raise exception 'FAIL admin delete';exception when insufficient_privilege then null;end;
end;$$;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$ begin
 if exists(select 1 from public."Orders") or exists(select 1 from public."OrderItems") or exists(select 1 from public."CustomerPhotos") then raise exception 'FAIL non-admin read';end if;
 update public."Orders" set status='Storniert' where id=current_setting('work2.order_id')::uuid;
 if found then raise exception 'FAIL non-admin status';end if;
 if exists(select 1 from storage.objects where bucket_id in ('customer-photos','product-models')) then raise exception 'FAIL non-admin storage';end if;
end;$$;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$ begin
 begin perform 1 from public."Orders";raise exception 'FAIL guest orders';exception when insufficient_privilege then null;end;
 begin perform 1 from public."OrderItems";raise exception 'FAIL guest items';exception when insufficient_privilege then null;end;
 begin perform 1 from public."CustomerPhotos";raise exception 'FAIL guest photo metadata';exception when insufficient_privilege then null;end;
 begin perform public.submit_shop_order('{}',repeat('a',64));raise exception 'FAIL guest RPC';exception when insufficient_privilege then null;end;
 if exists(select 1 from storage.objects where bucket_id in ('customer-photos','product-models')) then raise exception 'FAIL guest storage';end if;
end;$$;
reset role;
select 'PASS: real admin read/status, immutable items/payment state, guest/non-admin denial and private Storage RLS' as result;
rollback;
