-- Provider verification is tested separately in the Edge tests. SQL fixtures roll back.
begin;
do $$ declare o uuid;begin
 insert into public."Orders"(first_name,last_name,email,street,postal_code,city,total,subtotal,shipping,payment_method,request_key,request_hash,client_hash)
 values('Sandbox','Rollback','sandbox@example.invalid','Test','1000','Test',15,10,5,'PayPal',gen_random_uuid(),repeat('a',64),repeat('b',64)) returning id into o;
 perform public.attach_paypal_sandbox(o,'PAYPALTEST123');
 if (select payment_status from public."Orders" where id=o)<>'unpaid' then raise exception 'FAIL attach marked paid';end if;
 begin perform public.confirm_paypal_sandbox(o,'PAYPALTEST123','CAPTURETEST123','CHF',1);raise exception 'FAIL wrong amount';exception when others then if sqlerrm<>'INVALID_PAYMENT' then raise;end if;end;
 begin perform public.confirm_paypal_sandbox(o,'OTHERPAYPAL','CAPTURETEST123','CHF',15);raise exception 'FAIL wrong order';exception when others then if sqlerrm<>'INVALID_PAYMENT' then raise;end if;end;
 begin perform public.confirm_paypal_sandbox(o,'PAYPALTEST123','CAPTURETEST123','EUR',15);raise exception 'FAIL wrong currency';exception when others then if sqlerrm<>'INVALID_PAYMENT' then raise;end if;end;
 perform public.confirm_paypal_sandbox(o,'PAYPALTEST123','CAPTURETEST123','CHF',15);
 perform public.confirm_paypal_sandbox(o,'PAYPALTEST123','CAPTURETEST123','CHF',15);
 if not exists(select 1 from public."Orders" where id=o and payment_status='paid' and payment_environment='sandbox' and paypal_capture_id='CAPTURETEST123') then raise exception 'FAIL confirmed state';end if;
 if has_function_privilege('anon','public.confirm_paypal_sandbox(uuid,text,text,text,numeric)','EXECUTE') or has_function_privilege('authenticated','public.confirm_paypal_sandbox(uuid,text,text,text,numeric)','EXECUTE') or has_function_privilege('anon','public.attach_paypal_sandbox(uuid,text)','EXECUTE') or has_column_privilege('authenticated','public."Orders"','paypal_capture_id','UPDATE') then raise exception 'FAIL public payment mutation';end if;
end;$$;
select 'PASS: payment association remains unpaid, wrong amount/currency/order denied, confirmation/retry and guest/admin grants' as result;
rollback;
