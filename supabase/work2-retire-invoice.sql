-- RELEASE GATE ONLY: do not apply while the old frontend is live.
-- Apply after all integration/browser tests and the coordinated frontend/Edge cutover.
-- Historical invoice records stay readable; new invoice orders are prohibited.
begin;
alter table public."Orders" alter column payment_method drop default;
create or replace function public.reject_new_invoice_orders()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.kind='order' and coalesce(new.payment_method,'') not in ('PayPal','TWINT') then
  raise exception 'INVALID_REQUEST';
 end if;
 return new;
end;$$;
revoke all on function public.reject_new_invoice_orders() from public,anon,authenticated;
create trigger reject_new_invoice_orders before insert on public."Orders"
for each row execute function public.reject_new_invoice_orders();
revoke all on function public.submit_invoice_order(jsonb,text) from public,anon,authenticated,service_role;
commit;
