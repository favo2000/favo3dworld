// Isolated PostgreSQL/WASM fixture: not a substitute for live Supabase verification.
const {PGlite}=require('@electric-sql/pglite'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const db=new PGlite();
 const base=fs.readFileSync('supabase/product-options-setup.sql','utf8');
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create table public."Products"(id bigint primary key,active boolean,photo_mode text);
 create table public."Orders"(id uuid primary key);
 insert into public."Products" values(1,true,'required');
 ${base.slice(base.indexOf('create table public."CustomerPhotos"'),base.indexOf('create index customer_photos_rate'))}
 alter table public."CustomerPhotos" enable row level security;
 grant select on public."CustomerPhotos" to authenticated;
 grant all on public."CustomerPhotos" to service_role;
 grant select on public."Products" to service_role;
 create policy admin_only on public."CustomerPhotos" for select to authenticated using(current_setting('test.admin',true)='true');
 ${base.slice(base.indexOf('create function public.reserve_customer_photo('),base.indexOf('alter table public."OrderItems"'))}`);
 const args=[1,'22222222-2222-4222-8222-222222222222','a'.repeat(64),'b'.repeat(64),'image/png'];
 await db.query('select public.reserve_customer_photo($1,$2,$3,$4,$5)',args);
 const migration=fs.readFileSync('supabase/migrations/20260928161947_photo_consents.sql','utf8');await db.exec(migration);
 const legacy=await db.query('select processing_consent,reference_consent from public."CustomerPhotos"');assert.equal(legacy.rows[0].processing_consent,null);assert.equal(legacy.rows[0].reference_consent,null);
 const call='select public.reserve_customer_photo_consented($1,$2,$3,$4,$5,$6,$7,$8,$9) as reservation';
 await db.exec('set role service_role');
 for(const reference of [false,true]){
  const result=await db.query(call,[...args,true,reference,'2026-09-28',reference?'fr':'de']);
  const {rows}=await db.query('select * from public."CustomerPhotos" where id=$1',[result.rows[0].reservation.id]);
  assert.equal(rows[0].processing_consent,true);assert.equal(rows[0].reference_consent,reference);assert.ok(rows[0].consent_recorded_at);
 }
 for(const consent of [[false,false,'2026-09-28','de'],[null,false,'2026-09-28','de'],[true,null,'2026-09-28','de'],[true,false,null,'de'],[true,false,'old','de'],[true,false,'2026-09-28',null],[true,false,'2026-09-28','en']])await assert.rejects(db.query(call,[...args,...consent]),/CONSENT_REQUIRED/);
 assert.equal((await db.query('select count(*)::int as n from public."CustomerPhotos"')).rows[0].n,3);
 await assert.rejects(db.exec('update public."CustomerPhotos" set reference_consent=true where processing_consent is null'),/customer_photo_consent_complete/);
 // Original rate limiter is still used by the wrapper.
 for(let i=0;i<2;i++)await db.query(call,[...args,true,false,'2026-09-28','de']);
 await assert.rejects(db.query(call,[...args,true,false,'2026-09-28','de']),/RATE_LIMIT/);
 for(const role of ['anon','authenticated']){
  await db.exec('reset role;set role '+role);
  await assert.rejects(db.query(call,[...args,true,false,'2026-09-28','de']),/permission denied/);
  if(role==='anon')await assert.rejects(db.exec('select * from public."CustomerPhotos"'),/permission denied/);
  else assert.equal((await db.query('select * from public."CustomerPhotos"')).rows.length,0);
 }
 await db.exec("reset role;set role authenticated;set test.admin='true'");
 assert.equal((await db.query('select * from public."CustomerPhotos"')).rows.length,5);
 await assert.rejects(db.exec('update public."CustomerPhotos" set reference_consent=true'),/permission denied/);
 await db.close();console.log('PASS isolated PostgreSQL: additive migration, legacy nulls, separate false/true consent, timestamps, invalid/missing consent rejection, unchanged rate limit, service-only RPC, guest/non-admin rejection, read-only admin fixture. Live RLS/Storage remain unverified.');
})().catch(e=>{console.error(e);process.exit(1)});
