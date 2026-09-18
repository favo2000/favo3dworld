-- All fixtures roll back. No provider calls or real payments.
begin;
do $$ declare o uuid; env text; other text; sig text;begin
 foreach env in array array['live','sandbox'] loop
 other:=case when env='live' then 'sandbox' else 'live' end;
 insert into public."Orders"(first_name,last_name,email,street,postal_code,city,total,subtotal,shipping,payment_method,request_key,request_hash,client_hash)
 values('Live mode','Rollback','live@example.invalid','Test','1000','Test',15,10,5,'PayPal',gen_random_uuid(),repeat('a',64),repeat('b',64)) returning id into o;
 perform public.reserve_paypal_environment(o,env);
 perform public.reserve_paypal_environment(o,env);
 begin perform public.reserve_paypal_environment(o,other);raise exception 'FAIL cross-mode reservation';exception when others then if sqlerrm<>'INVALID_PAYMENT' then raise;end if;end;
 begin update public."Orders" set payment_environment=other where id=o;raise exception 'FAIL cross-mode legacy patch';exception when others then if sqlerrm<>'INVALID_PAYMENT' then raise;end if;end;
 begin update public."Orders" set payment_environment=null where id=o;raise exception 'FAIL reset environment';exception when others then if sqlerrm<>'INVALID_PAYMENT' then raise;end if;end;
 begin perform public.attach_paypal(o,'PAYPALTEST123',other);raise exception 'FAIL cross-mode attach';exception when others then if sqlerrm<>'INVALID_PAYMENT' then raise;end if;end;
 perform public.attach_paypal(o,'PAYPAL'||upper(env)||'123',env);
 if (select payment_status from public."Orders" where id=o)<>'unpaid' then raise exception 'FAIL attach marked paid';end if;
 begin perform public.confirm_paypal(o,'PAYPAL'||upper(env)||'123','CAPTURE'||upper(env)||'123','CHF',15,other);raise exception 'FAIL cross-mode confirmation';exception when others then if sqlerrm<>'INVALID_PAYMENT' then raise;end if;end;
 begin perform public.confirm_paypal(o,'PAYPAL'||upper(env)||'123','CAPTURE'||upper(env)||'123','CHF',1,env);raise exception 'FAIL amount mismatch';exception when others then if sqlerrm<>'INVALID_PAYMENT' then raise;end if;end;
 begin perform public.confirm_paypal(o,'PAYPAL'||upper(env)||'123','CAPTURE'||upper(env)||'123','EUR',15,env);raise exception 'FAIL currency mismatch';exception when others then if sqlerrm<>'INVALID_PAYMENT' then raise;end if;end;
 if env='live' then
  begin perform public.attach_paypal_sandbox(o,'PAYPALLIVE123');raise exception 'FAIL sandbox wrapper attach';exception when others then if sqlerrm<>'INVALID_PAYMENT' then raise;end if;end;
  begin perform public.confirm_paypal_sandbox(o,'PAYPALLIVE123','CAPTURELIVE123','CHF',15);raise exception 'FAIL sandbox wrapper confirmation';exception when others then if sqlerrm<>'INVALID_PAYMENT' then raise;end if;end;
 end if;
 perform public.confirm_paypal(o,'PAYPAL'||upper(env)||'123','CAPTURE'||upper(env)||'123','CHF',15,env);
 perform public.confirm_paypal(o,'PAYPAL'||upper(env)||'123','CAPTURE'||upper(env)||'123','CHF',15,env);
 if not exists(select 1 from public."Orders" where id=o and payment_status='paid' and payment_environment=env) then raise exception 'FAIL confirmation';end if;
 end loop;
 foreach sig in array array['public.reserve_paypal_environment(uuid,text)','public.attach_paypal(uuid,text,text)','public.confirm_paypal(uuid,text,text,text,numeric,text)'] loop
  if has_function_privilege('anon',sig,'EXECUTE') or has_function_privilege('authenticated',sig,'EXECUTE') or not has_function_privilege('service_role',sig,'EXECUTE') then raise exception 'FAIL RPC privileges';end if;
 end loop;
end;$$;
select 'PASS: Live/Sandbox isolation, immutable environment, legacy Sandbox wrappers, amount/currency checks, idempotency, service-only grants' as result;
rollback;
