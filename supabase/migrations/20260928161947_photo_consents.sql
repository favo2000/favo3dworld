-- DRAFT: inspect the live schema/policies before applying. No backfilled consent.
begin;
alter table public."CustomerPhotos"
 add column processing_consent boolean,
 add column reference_consent boolean,
 add column consent_version text,
 add column consent_language text,
 add column consent_recorded_at timestamptz,
 add constraint customer_photo_consent_complete check (
  (processing_consent is null and reference_consent is null and consent_version is null
   and consent_language is null and consent_recorded_at is null)
  or
  (processing_consent is true and reference_consent is not null
   and consent_version is not null and consent_version = '2026-09-28'
   and consent_language is not null and consent_language in ('de','fr')
   and consent_recorded_at is not null)
 );

-- Reuse the existing validation, rate limit and reservation in one transaction.
-- Both old and new RPCs remain service-only. No change to RLS or Storage.
create function public.reserve_customer_photo_consented(
 p_product bigint,p_cart uuid,p_token_hash text,p_client_hash text,p_mime text,
 p_processing boolean,p_reference boolean,p_version text,p_language text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare reservation jsonb;
begin
 if p_processing is distinct from true or p_reference is null
  or p_version is distinct from '2026-09-28' or p_language is null or p_language not in ('de','fr')
 then raise exception 'CONSENT_REQUIRED';end if;
 reservation:=public.reserve_customer_photo(p_product,p_cart,p_token_hash,p_client_hash,p_mime);
 update public."CustomerPhotos" set processing_consent=true,reference_consent=p_reference,
  consent_version=p_version,consent_language=p_language,consent_recorded_at=now()
 where id=(reservation->>'id')::uuid;
 if not found then raise exception 'PHOTO_RESERVATION_FAILED';end if;
 return reservation;
end;$$;
revoke all on function public.reserve_customer_photo_consented(bigint,uuid,text,text,text,boolean,boolean,text,text) from public,anon,authenticated;
grant execute on function public.reserve_customer_photo_consented(bigint,uuid,text,text,text,boolean,boolean,text,text) to service_role;
commit;
