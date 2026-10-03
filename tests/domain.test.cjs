const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{stripTypeScriptTypes}=require('node:module');
const origins=['https://favo2000.github.io','https://favo3dworld.ch','https://www.favo3dworld.ch'];
(async()=>{
 for(const name of ['place-order','customer-photo','paypal-live','paypal-sandbox']){
  let handler;const paypal=name.startsWith('paypal');
  const source=fs.readFileSync(paypal?'supabase/functions/_shared/paypal.ts':'supabase/functions/'+name+'/index.ts','utf8').replace('export function','function')+(paypal?`\nDeno.serve(paypalHandler('${name.endsWith('live')?'live':'sandbox'}'));`:'');
  vm.runInNewContext(stripTypeScriptTypes(source),{Deno:{serve:f=>handler=f,env:{get:()=>{throw Error('Unexpected secret access')}}},URL,Response,Request});
  const responses=await Promise.all(origins.map(origin=>handler(new Request('https://example.test/'+name,{method:'OPTIONS',headers:{origin}}))));
  responses.forEach((r,i)=>{assert.equal(r.status,204);assert.equal(r.headers.get('access-control-allow-origin'),origins[i]);assert.equal(r.headers.get('vary'),'Origin');});
  for(const origin of ['https://attacker.test','http://favo3dworld.ch','https://favo3dworld.ch.attacker.test','null','toString','__proto__']){
   const r=await handler(new Request('https://example.test/'+name,{method:'OPTIONS',headers:{origin}}));assert.equal(r.status,403);assert.notEqual(r.headers.get('access-control-allow-origin'),origin);
  }
  for(const origin of origins){const r=await handler(new Request('https://example.test/'+name,{method:'POST',headers:{origin}}));assert.equal(r.status,401);assert.equal(r.headers.get('access-control-allow-origin'),origin);}
  console.log('PASS '+name+': old/new/www HTTPS origins, concurrent preflights, request-scoped CORS, hostile origins denied, application key still required.');
 }
})().catch(e=>{console.error(e);process.exit(1)});
