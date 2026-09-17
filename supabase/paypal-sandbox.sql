-- Additive PayPal Sandbox metadata. Existing order/stock/photo RPC is unchanged.
begin;
alter table public."Orders"
 add column payment_environment text check(payment_environment is null or payment_environment='sandbox'),
 add column paypal_order_id text unique,
 add column paypal_capture_id text unique;
create function public.attach_paypal_sandbox(p_id uuid,p_paypal_id text)
returns void language plpgsql security invoker set search_path='' as $$
declare o public."Orders"%rowtype;
begin
 select * into o from public."Orders" where id=p_id for update;
 if not found or o.kind<>'order' or o.payment_method<>'PayPal' or o.status='Storniert'
 or p_paypal_id is null or p_paypal_id !~ '^[A-Z0-9]{5,40}$'
 or (o.paypal_order_id is not null and o.paypal_order_id<>p_paypal_id)
 then raise exception 'INVALID_PAYMENT';end if;
 update public."Orders" set paypal_order_id=p_paypal_id,payment_environment='sandbox' where id=p_id;
end;$$;
create function public.confirm_paypal_sandbox(p_id uuid,p_paypal_id text,p_capture_id text,p_currency text,p_amount numeric)
returns void language plpgsql security invoker set search_path='' as $$
declare o public."Orders"%rowtype;
begin
 select * into o from public."Orders" where id=p_id for update;
 if not found or o.payment_method<>'PayPal' or o.kind<>'order'
 or o.payment_environment is distinct from 'sandbox' or o.paypal_order_id is distinct from p_paypal_id
 or p_capture_id is null or p_capture_id !~ '^[A-Z0-9]{5,40}$'
 or p_currency is distinct from 'CHF' or p_amount is distinct from o.total
 or (o.paypal_capture_id is not null and o.paypal_capture_id<>p_capture_id)
 then raise exception 'INVALID_PAYMENT';end if;
 -- Only the Edge Function calls this after verifying PayPal's completed capture.
 -- Concurrent retries are serialized; no stock changes or duplicate orders here.
 update public."Orders" set paypal_capture_id=p_capture_id,payment_status='paid' where id=p_id;
end;$$;
revoke all on function public.attach_paypal_sandbox(uuid,text),public.confirm_paypal_sandbox(uuid,text,text,text,numeric) from public,anon,authenticated;
grant execute on function public.attach_paypal_sandbox(uuid,text),public.confirm_paypal_sandbox(uuid,text,text,text,numeric) to service_role;
commit;
