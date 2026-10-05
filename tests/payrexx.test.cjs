const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module'),{webcrypto}=require('node:crypto'),{JSDOM}=require('jsdom');
const read=p=>fs.readFileSync(p,'utf8'),tick=()=>new Promise(r=>setTimeout(r,35));
async function edge(){
 let handler,creates=0,confirms=0,remote={currency:'CHF',test:false,status:'waiting',amount:2500};
 const row={id:'11111111-1111-4111-8111-111111111111',order_number:'FW-TEST',currency:'CHF',payment_method:'TWINT',payment_status:'unpaid',kind:'order',status:'Neu',total:25,subtotal:20,shipping:5};
 vm.runInNewContext(stripTypeScriptTypes(read('supabase/functions/payrexx/index.ts')),{Deno:{serve:f=>handler=f,env:{get:n=>({SUPABASE_URL:'https://db.test',SUPABASE_SERVICE_ROLE_KEY:'fake-service-key',PAYREXX_API_KEY:'fake-api-key'})[n]}},crypto:webcrypto,Request,Response,URL,Uint8Array,TextEncoder,AbortSignal,fetch:async(url,o)=>{
  if(url.startsWith('https://api.payrexx.com')){
   assert.equal(o.headers['X-API-KEY'],'fake-api-key');
   if(o.method==='POST'){creates++;const b=JSON.parse(o.body);assert.equal(b.amount,2500);assert.equal(b.currency,'CHF');assert.equal(b.referenceId,row.id);assert.deepEqual(b.pm,['twint']);assert.equal(b.test,false);assert.equal(b.successRedirectUrl,'https://favo3dworld.ch/?payrexx=return');return new Response(JSON.stringify({data:[{id:123,hash:'testhash'}]}));}
   return new Response(JSON.stringify({data:[{referenceId:row.id,invoices:[{currency:remote.currency,test:remote.test,transactions:[{status:remote.status,amount:remote.amount}]}]}]}));
  }
  assert.equal(o.headers.apikey,'fake-service-key');
  if(url.includes('submit_shop_order')){if(JSON.parse(o.body).p_request.expected_total!==25)return new Response(JSON.stringify({message:'PRICE_CHANGED'}),{status:400});return new Response('{}');}
  if(url.includes('attach_payrexx')){row.payrexx_gateway_id=123;row.payrexx_gateway_hash='testhash';return new Response('null');}
  if(url.includes('confirm_payrexx')){confirms++;row.payment_status='paid';return new Response('null');}
  return new Response(JSON.stringify([row]));
 }});
 const post=(body,origin='https://favo3dworld.ch',apikey='sb_publishable_sboMkfayulaAF7AZPtsp1Q_hgNaE_pq')=>handler(new Request('https://db.test/functions/v1/payrexx',{method:'POST',headers:{origin,apikey,'Content-Type':'application/json'},body:JSON.stringify(body)}));
 const payload={action:'create',order:{request_key:'22222222-2222-4222-8222-222222222222',payment_method:'TWINT',kind:'order',expected_total:25}};
 assert.equal((await post(payload,'https://evil.test')).status,403);assert.equal((await post(payload,'toString')).status,403);assert.equal((await post(payload,undefined,'bad')).status,401);
 assert.equal((await post({...payload,order:{...payload.order,expected_total:1}})).status,400);assert.equal(creates,0);
 const created=await (await post(payload)).json();assert.equal(created.payment_status,'unpaid');assert.equal(created.payment_url,'https://favo3dworld.payrexx.com/?payment=testhash');assert.doesNotMatch(JSON.stringify(created),/fake-service-key|fake-api-key/);
 await post(payload);assert.equal(creates,1);
 const verify={action:'verify',request_key:payload.order.request_key,payment_token:created.payment_token};
 assert.equal((await post({...verify,payment_token:'wrong'})).status,403);
 for(const change of [{status:'waiting'},{status:'confirmed',currency:'EUR'},{currency:'CHF',test:true},{test:false,amount:1}]){Object.assign(remote,change);const d=await (await post(verify)).json();assert.equal(d.payment_status,'unpaid');assert.equal(confirms,0);}
 Object.assign(remote,{status:'confirmed',currency:'CHF',test:false,amount:2500});assert.equal((await (await post(verify)).json()).payment_status,'paid');assert.equal(confirms,1);await post(verify);assert.equal(confirms,1);
 console.log('PASS Payrexx Edge: server pricing, CHF/live-only confirmation, pending/mismatch rejection, token/origin/key guards, retry reuse, no exposed secrets.');
}
async function dom(returnStatus){
 const url='https://favo3dworld.ch/'+(returnStatus?'?payrexx=return':''),d=new JSDOM(read('index.html'),{url,runScripts:'outside-only'}),w=d.window,$=id=>w.document.getElementById(id);
 Object.defineProperty(w,'crypto',{value:webcrypto});w.TextEncoder=TextEncoder;w.AbortSignal=AbortSignal;w.HTMLElement.prototype.scrollIntoView=()=>{};w.alert=()=>{};
 let calls=0,status=returnStatus||'unpaid';if(returnStatus)w.sessionStorage.setItem('favoPayrexxReturn',JSON.stringify({request_key:'test-key',payment_token:'test-token'}));
 w.fetch=async(url,o)=>{if(String(url).includes('/functions/')){calls++;const b=JSON.parse(o.body);assert.equal(b.action,'verify');assert.equal(b.payment_token,'test-token');return {ok:true,json:async()=>({kind:'order',payment_method:'TWINT',payment_status:status,currency:'CHF',order_number:'FW-TWINT',subtotal:20,shipping:5,total:25,payment_url:'https://favo3dworld.payrexx.com/?payment=testhash'})};}return {ok:true,json:async()=>[]};};
 const inline=[...w.document.querySelectorAll('script:not([src])')].map(x=>x.textContent).join('\n');
 w.eval(read('supabase-config.js')+'\n'+inline+'\n'+read('product-options.js')+'\n'+read('products.js')+'\n'+read('checkout.js')+'\n'+read('paypal-sandbox.js')+'\nwindow.seed=()=>{cart=[{productId:6,name:"Frugo",size:"50 cm",price:20,quantity:1,colorSelections:[]}];renderCart()};');await tick();
 if(!returnStatus){$('paymentMethod').value='TWINT';$('paymentMethod').dispatchEvent(new w.Event('change'));assert.match($('placeOrder').textContent,/TWINT/);assert.doesNotMatch($('checkoutModal').textContent,/nicht angebunden|Unbezahlte Bestellung/);$('langFR').click();assert.match($('placeOrder').textContent,/Démarrer le paiement avec TWINT/);assert.match($('checkoutModal').textContent,/via Payrexx/);assert.equal(calls,0);}
 else {assert.equal(calls,1);assert.equal($('checkoutModal').classList.contains('open'),true);assert.equal($('checkoutTotal').textContent,'CHF 25.00');assert.equal(w.PayrexxPayment.completed,status==='paid');if(status==='paid'){assert.equal($('placeOrder').disabled,true);assert.equal($('payrexxStatus').hidden,true);assert.equal(w.sessionStorage.getItem('favoPayrexxReturn'),null);}else{assert.equal($('payrexxStatus').hidden,false);status='paid';$('payrexxStatus').querySelector('button').click();await tick();assert.equal(w.PayrexxPayment.completed,true);assert.equal(calls,2);}assert.match($('orderStatus').textContent,/TWINT-Zahlung.*bestätigt/);$('langFR').click();assert.match($('orderStatus').textContent,/paiement TWINT.*confirmé/);}
 w.close();
}
(async()=>{await edge();await dom();await dom('paid');await dom('unpaid');console.log('PASS TWINT DOM: DE/FR payment selection, verified paid/unpaid return, retry and completed-payment lock.');})().catch(e=>{console.error(e);process.exit(1)});
