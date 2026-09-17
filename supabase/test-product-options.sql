-- All test records and inventory changes are rolled back.
begin;
do $$
declare p bigint; photo uuid; cart_id uuid:=gen_random_uuid(); payload jsonb; receipt jsonb; request_id uuid:=gen_random_uuid();
 regions jsonb:='[{"id":"hair","name_de":"Haare","name_fr":"Cheveux","colors":[{"id":"red","name_de":"Rot","name_fr":"Rouge","hex":"#ff0000"}]}]';
begin
 if public.valid_product_color_regions('[{"id":"bad","colors":[]}]') then raise exception 'FAIL invalid palette';end if;
 insert into public."Products"(name,description_de,price_50,stock,active,color_mode,color_regions,photo_mode,allow_wish_text,category,seasons)
 values('TRANSACTIONAL OPTIONS TEST','Synthetic',10,3,true,'original',regions,'required',true,'wedding',array['valentine']) returning id into p;
 insert into public."CustomerPhotos"(product_id,cart_item_id,token_hash,object_path,client_hash,status,mime)
 values(p,cart_id,encode(sha256(convert_to(repeat('a',64),'UTF8')),'hex'),gen_random_uuid()::text||'.png',repeat('b',64),'ready','image/png') returning id into photo;
 payload:=jsonb_build_object('request_key',request_id,'payment_method','Rechnung','expected_total',10,'customer',jsonb_build_object('first_name','Test','last_name','Only','email','rollback-test@example.invalid','street','Test 1','postal_code','1000','city','Test','country','CH'),'items',jsonb_build_array(jsonb_build_object('product_id',p,'size','50','colors',jsonb_build_object('hair','red'),'quantity',1,'personalization',jsonb_build_object('id',photo,'cart_item_id',cart_id,'token',repeat('a',64),'text','Marie & Alex'))));
 begin perform public.submit_invoice_order(jsonb_set(payload,'{items,0,personalization,token}',to_jsonb(repeat('c',64))),repeat('b',64));raise exception 'FAIL wrong token accepted';exception when others then if sqlerrm<>'INVALID_OPTIONS' then raise;end if;end;
 begin perform public.submit_invoice_order(jsonb_set(payload,'{items,0,colors,hair}','"invalid"'),repeat('b',64));raise exception 'FAIL invalid color accepted';exception when others then if sqlerrm<>'INVALID_OPTIONS' then raise;end if;end;
 begin perform public.submit_invoice_order(payload #- '{items,0,personalization,id}',repeat('b',64));raise exception 'FAIL missing photo accepted';exception when others then if sqlerrm<>'INVALID_OPTIONS' then raise;end if;end;
 payload:=jsonb_set(jsonb_set(payload,'{items,0,quantity}','2'),'{expected_total}','20');
 begin perform public.submit_invoice_order(jsonb_set(payload,'{items,0,quantity}','4'),repeat('b',64));raise exception 'FAIL inventory exceeded';exception when others then if sqlerrm<>'OUT_OF_STOCK' then raise;end if;end;
 receipt:=public.submit_invoice_order(payload,repeat('b',64));
 if (select stock from public."Products" where id=p)<>1 then raise exception 'FAIL inventory';end if;
 if not exists(select 1 from public."OrderItems" where product_id=p and quantity=2 and line_total=20) then raise exception 'FAIL quantity total';end if;
 if not exists(select 1 from public."OrderItems" where product_id=p and customer_photo_id=photo and wish_text='Marie & Alex' and color_details->0->>'region_fr'='Cheveux') then raise exception 'FAIL snapshot';end if;
 if (select status from public."CustomerPhotos" where id=photo)<>'attached' then raise exception 'FAIL association';end if;
 perform public.submit_invoice_order(payload,repeat('b',64));
 if (select stock from public."Products" where id=p)<>1 then raise exception 'FAIL duplicate';end if;
 -- Preserve legacy Cavallo payloads and protect previous order flow.
 payload:=jsonb_set(payload,'{request_key}',to_jsonb(gen_random_uuid()));
 payload:=jsonb_set(payload,'{items}',jsonb_build_array(jsonb_build_object('product_id',1,'size','60','colors',jsonb_build_object('primary','schwarz','secondary','rot'),'quantity',1)));
 payload:=jsonb_set(payload,'{expected_total}',(select to_jsonb(price_60) from public."Products" where id=1));
 perform public.submit_invoice_order(payload,repeat('d',64));
end;$$;
do $$
declare payload jsonb; result jsonb; price numeric;
begin
 select price_50 into price from public."Products" where id=3;
 if price<>10 then raise exception 'FAIL Scheiben price changed';end if;
 update public."Products" set stock=2 where id=3;
 payload:=jsonb_build_object('request_key',gen_random_uuid(),'payment_method','Rechnung','expected_total',30,'customer',jsonb_build_object('first_name','Stock','last_name','Test','email','scheiben-rollback@example.invalid','street','Test 1','postal_code','1000','city','Test','country','CH'),'items',jsonb_build_array(jsonb_build_object('product_id',3,'size','fixed','colors','{}'::jsonb,'quantity',3)));
 begin perform public.submit_invoice_order(payload,repeat('e',64));raise exception 'FAIL positive stock exceeded';exception when others then if sqlerrm<>'OUT_OF_STOCK' then raise;end if;end;
 -- Splitting a request into lines cannot convert an overdraw into made-to-order.
 payload:=jsonb_set(payload,'{items}',jsonb_build_array(jsonb_build_object('product_id',3,'size','fixed','colors','{}'::jsonb,'quantity',2),jsonb_build_object('product_id',3,'size','fixed','colors','{}'::jsonb,'quantity',1)));
 begin perform public.submit_invoice_order(payload,repeat('e',64));raise exception 'FAIL split stock exceeded';exception when others then if sqlerrm<>'OUT_OF_STOCK' then raise;end if;end;
 if (select stock from public."Products" where id=3)<>2 then raise exception 'FAIL rejected request reduced stock';end if;
 payload:=jsonb_set(jsonb_set(payload,'{items}',jsonb_build_array(jsonb_build_object('product_id',3,'size','fixed','colors','{}'::jsonb,'quantity',2))),'{expected_total}','20');
 result:=public.submit_invoice_order(payload,repeat('e',64));
 if (result->>'total')::numeric<>20 or (select stock from public."Products" where id=3)<>0 then raise exception 'FAIL stock fulfillment';end if;
 perform public.submit_invoice_order(payload,repeat('e',64));
 if (select stock from public."Products" where id=3)<>0 then raise exception 'FAIL stock retry';end if;
 payload:=jsonb_set(jsonb_set(jsonb_set(payload,'{request_key}',to_jsonb(gen_random_uuid())),'{items,0,quantity}','3'),'{expected_total}','30');
 result:=public.submit_invoice_order(payload,repeat('e',64));
 if (result->>'total')::numeric<>30 or (select stock from public."Products" where id=3)<>0 then raise exception 'FAIL made-to-order quantity';end if;
 -- Replenished stock is finite again, even after previous made-to-order orders.
 update public."Products" set stock=1 where id=3;
 payload:=jsonb_set(payload,'{request_key}',to_jsonb(gen_random_uuid()));
 begin perform public.submit_invoice_order(payload,repeat('e',64));raise exception 'FAIL replenished stock exceeded';exception when others then if sqlerrm<>'OUT_OF_STOCK' then raise;end if;end;
end;$$;
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$ begin
 if exists(select 1 from public."CustomerPhotos") then raise exception 'FAIL photo metadata leaked';end if;
 if exists(select 1 from storage.objects where bucket_id in ('product-models','customer-photos')) then raise exception 'FAIL private file leaked';end if;
 begin insert into public."Products"(name,description_de,active,color_mode) values('UNAUTHORIZED','Test',false,'original');raise exception 'FAIL unauthorized write';exception when insufficient_privilege then null;end;
end;$$;
select 'PASS: photo quantity 2, snapshots, totals, idempotency, Scheiben finite stock / split-line rejection / zero-stock production / replenishment, Cavallo, private RLS and rejected non-admin writes' as result;
rollback;
