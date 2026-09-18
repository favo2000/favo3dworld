-- Additive Live support. No order, product, stock, photo or RLS data changes.
begin;
alter table public."Orders" drop constraint "Orders_payment_environment_check";
alter table public."Orders" add constraint "Orders_payment_environment_check"
 check(payment_environment is null or payment_environment in ('sandbox','live'));

-- Also protects against an old Sandbox deployment attempting to switch a Live order.
create function public.protect_paypal_environment()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if old.payment_environment is not null and new.payment_environment is distinct from old.payment_environment
 then raise exception 'INVALID_PAYMENT';end if;
 return new;
end;$$;
create trigger protect_paypal_environment before update of payment_environment on public."Orders"
 for each row execute function public.protect_paypal_environment();
revoke all on function public.protect_paypal_environment() from public,anon,authenticated;

create function public.reserve_paypal_environment(p_id uuid,p_environment text)
returns void language plpgsql security invoker set search_path='' as $$
declare o public."Orders"%rowtype;
begin
 select * into o from public."Orders" where id=p_id for update;
 if not found or o.kind<>'order' or o.payment_method<>'PayPal' or o.status='Storniert'
 or p_environment is null or p_environment not in ('sandbox','live')
 or (o.payment_environment is not null and o.payment_environment<>p_environment)
 then raise exception 'INVALID_PAYMENT';end if;
 update public."Orders" set payment_environment=p_environment where id=p_id;
end;$$;

create function public.attach_paypal(p_id uuid,p_paypal_id text,p_environment text)
returns void language plpgsql security invoker set search_path='' as $$
declare o public."Orders"%rowtype;
begin
 perform public.reserve_paypal_environment(p_id,p_environment);
 select * into o from public."Orders" where id=p_id for update;
 if p_paypal_id is null or p_paypal_id !~ '^[A-Z0-9]{5,40}$'
 or (o.paypal_order_id is not null and o.paypal_order_id<>p_paypal_id)
 then raise exception 'INVALID_PAYMENT';end if;
 update public."Orders" set paypal_order_id=p_paypal_id where id=p_id;
end;$$;

create function public.confirm_paypal(p_id uuid,p_paypal_id text,p_capture_id text,p_currency text,p_amount numeric,p_environment text)
returns void language plpgsql security invoker set search_path='' as $$
declare o public."Orders"%rowtype;
begin
 select * into o from public."Orders" where id=p_id for update;
 if not found or o.payment_method<>'PayPal' or o.kind<>'order'
 or p_environment is null or p_environment not in ('sandbox','live')
 or o.payment_environment is distinct from p_environment or o.paypal_order_id is distinct from p_paypal_id
 or p_capture_id is null or p_capture_id !~ '^[A-Z0-9]{5,40}$'
 or p_currency is distinct from 'CHF' or p_amount is distinct from o.total
 or (o.paypal_capture_id is not null and o.paypal_capture_id<>p_capture_id)
 then raise exception 'INVALID_PAYMENT';end if;
 -- Only server-verified completed captures reach this service-only function.
 update public."Orders" set paypal_capture_id=p_capture_id,payment_status='paid' where id=p_id;
end;$$;

-- Preserve deployed Sandbox RPC signatures and make their environment immutable.
create or replace function public.attach_paypal_sandbox(p_id uuid,p_paypal_id text)
returns void language sql security invoker set search_path='' as $$
 select public.attach_paypal(p_id,p_paypal_id,'sandbox');
$$;
create or replace function public.confirm_paypal_sandbox(p_id uuid,p_paypal_id text,p_capture_id text,p_currency text,p_amount numeric)
returns void language sql security invoker set search_path='' as $$
 select public.confirm_paypal(p_id,p_paypal_id,p_capture_id,p_currency,p_amount,'sandbox');
$$;
revoke all on function public.reserve_paypal_environment(uuid,text),public.attach_paypal(uuid,text,text),public.confirm_paypal(uuid,text,text,text,numeric,text) from public,anon,authenticated;
grant execute on function public.reserve_paypal_environment(uuid,text),public.attach_paypal(uuid,text,text),public.confirm_paypal(uuid,text,text,text,numeric,text) to service_role;
commit;
