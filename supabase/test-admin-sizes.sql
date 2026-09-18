-- Real database tests; synthetic fixtures and orders are fully rolled back.
begin;
do $$
declare p bigint; payload jsonb; result jsonb; bad jsonb; opts jsonb := '[{"id":"small","name_de":"Klein 12 cm","name_fr":"Petit 12 cm","price":17.50}]';
begin
 insert into public."Products"(name,description_de,price_50,stock,active,color_mode,size_options)
 values('SIZE ROLLBACK TEST','Synthetic',1,4,true,'original',opts) returning id into p;
 payload:=jsonb_build_object('request_key',gen_random_uuid(),'payment_method','PayPal','expected_total',40,
 'customer',jsonb_build_object('first_name','Size','last_name','Test','email',gen_random_uuid()||'@example.invalid','street','Test 1','postal_code','1000','city','Test','country','CH'),
 'items',jsonb_build_array(jsonb_build_object('product_id',p,'size','small','colors','{}'::jsonb,'quantity',2)));
 begin perform public.submit_shop_order(jsonb_set(payload,'{items,0,size}','"50"'),repeat('9',64));raise exception 'FAIL legacy size accepted for configured product';exception when others then if sqlerrm<>'INVALID_OPTIONS' then raise;end if;end;
 begin perform public.submit_shop_order(jsonb_set(payload,'{expected_total}','7'),repeat('9',64));raise exception 'FAIL forged total';exception when others then if sqlerrm<>'PRICE_CHANGED' then raise;end if;end;
 result:=public.submit_shop_order(payload,repeat('9',64));
 if result->>'payment_status'<>'unpaid' or (result->>'total')::numeric<>40 or (result->>'shipping')::numeric<>5 then raise exception 'FAIL custom size amounts';end if;
 if (select stock from public."Products" where id=p)<>2 then raise exception 'FAIL stock';end if;
 if not exists(select 1 from public."OrderItems" where product_id=p and size='Klein 12 cm / Petit 12 cm' and unit_price=17.50 and quantity=2 and line_total=35) then raise exception 'FAIL size snapshot';end if;
 update public."Products" set size_options='[]' where id=p;
 begin perform public.submit_shop_order(jsonb_set(payload,'{request_key}',to_jsonb(gen_random_uuid())),repeat('9',64));raise exception 'FAIL removed size accepted';exception when others then if sqlerrm<>'INVALID_OPTIONS' then raise;end if;end;
 update public."Products" set size_options='[{"id":"fixed","name_de":"Mini","name_fr":"Mini","price":40}]',stock=null where id=p;
 payload:=jsonb_set(jsonb_set(jsonb_set(payload,'{request_key}',to_jsonb(gen_random_uuid())),'{items,0,size}','"fixed"'),'{expected_total}','80');
 result:=public.submit_shop_order(payload,repeat('9',64));
 if (result->>'shipping')::numeric<>0 or (result->>'total')::numeric<>80 then raise exception 'FAIL fixed size free shipping';end if;
 foreach bad in array array['{}'::jsonb,opts||opts,jsonb_set(opts,'{0,price}','-1'),jsonb_set(opts,'{0,price}','1.001'),jsonb_set(opts,'{0,name_fr}','null')] loop
  begin update public."Products" set size_options=bad where id=p;raise exception 'FAIL invalid options saved';exception when others then if sqlerrm<>'INVALID_SIZE_OPTIONS' then raise;end if;end;
 end loop;
 if not has_column_privilege('anon','public."Products"','size_options','SELECT') or has_column_privilege('anon','public."Products"','model_url','SELECT') then raise exception 'FAIL catalog column permissions';end if;
 if has_function_privilege('anon','public.submit_shop_order(jsonb,text)','EXECUTE') or has_function_privilege('authenticated','public.submit_shop_order(jsonb,text)','EXECUTE') then raise exception 'FAIL public order RPC';end if;
 perform set_config('sizes.test_product',p::text,true);
end;$$;
set local role authenticated;
select set_config('request.jwt.claim.sub','0e780550-3efb-4d78-b940-9566af5a398d',true);
do $$ begin
 update public."Products" set size_options='[{"id":"admin","name_de":"Admin Test","name_fr":"Test admin","price":25}]' where id=current_setting('sizes.test_product')::bigint;
 if not found then raise exception 'FAIL admin size update';end if;
end;$$;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$ begin
 update public."Products" set size_options='[]' where id=current_setting('sizes.test_product')::bigint;
 if found then raise exception 'FAIL non-admin size update';end if;
end;$$;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$ begin
 perform size_options from public."Products" where active=true;
 update public."Products" set size_options='[]' where id=current_setting('sizes.test_product')::bigint;
 if found then raise exception 'FAIL anonymous size update';end if;
end;$$;
select 'PASS: custom/fixed/removed sizes, server prices, CHF shipping, immutable size labels, stock, validation and actual admin/non-admin/anon permissions' as result;
rollback;
