const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module'),{webcrypto}=require('node:crypto');
const source=fs.readFileSync('supabase/functions/paypal-sandbox/index.ts','utf8');
async function scenario(){
 let handler,remoteStatus='CREATED',captureStatus='COMPLETED',wrongAmount=false,captureCalls=0,confirmCalls=0,createCalls=0,timeoutAfterCapture=false,authOK=true;
 const secret='test-server-secret',paypalSecret='test-paypal-secret';
 const order={id:'11111111-1111-4111-8111-111111111111',request_key:'22222222-2222-4222-8222-222222222222',order_number:'FW-TEST',kind:'order',status:'Neu',payment_status:'unpaid',payment_method:'PayPal',total:15,subtotal:10,shipping:5,currency:'CHF',paypal_order_id:null};
 const provider=()=>({id:'PAYPAL123456',intent:'CAPTURE',status:remoteStatus,purchase_units:[{reference_id:order.id,custom_id:order.id,amount:{currency_code:'CHF',value:wrongAmount?'1.00':'15.00'},...(remoteStatus==='COMPLETED'?{payments:{captures:[{id:'CAPTURE123456',status:captureStatus,final_capture:true,amount:{currency_code:'CHF',value:'15.00'}}]}}:{})}],links:[{rel:'payer-action',href:'https://www.sandbox.paypal.com/checkoutnow?token=PAYPAL123456'}]});
 vm.runInNewContext(stripTypeScriptTypes(source),{Deno:{serve:f=>handler=f,env:{get:n=>({SUPABASE_URL:'https://db.example',SUPABASE_SERVICE_ROLE_KEY:secret,PAYPAL_CLIENT_ID:'test-client-id',PAYPAL_CLIENT_SECRET:paypalSecret})[n]}},crypto:webcrypto,Request,Response,Uint8Array,TextEncoder,TextDecoder,AbortSignal,URL,btoa,fetch:async(url,opts)=>{
  if(url.startsWith('https://api-m.')){
   assert.ok(url.startsWith('https://api-m.sandbox.paypal.com/'));
   if(url.endsWith('/v1/oauth2/token'))return new Response(JSON.stringify(authOK?{access_token:'test-token',expires_in:300}:{error:'invalid_client'}),{status:authOK?200:401});
   assert.equal(opts.headers.Authorization,'Bearer test-token');
   if(url.endsWith('/capture')){captureCalls++;assert.ok(opts.headers['PayPal-Request-Id']);remoteStatus='COMPLETED';if(timeoutAfterCapture)throw new Error('Timeout');return new Response(JSON.stringify(provider()));}
   if(opts.method==='POST'){createCalls++;const b=JSON.parse(opts.body);assert.equal(b.purchase_units[0].amount.value,'15.00');assert.equal(b.purchase_units[0].amount.currency_code,'CHF');assert.equal(b.purchase_units[0].custom_id,order.id);assert.equal(b.payment_source.paypal.experience_context.return_url,'https://favo2000.github.io/favo3dworld/?paypal=return');assert.equal(opts.headers['PayPal-Request-Id'],order.id);}
   return new Response(JSON.stringify(provider()));
  }
  assert.equal(opts.headers.apikey,secret);
  if(opts.method==='PATCH'){order.payment_environment='sandbox';return new Response(null,{status:204});}
  if(url.includes('/rpc/submit_shop_order')){const body=JSON.parse(opts.body);assert.match(body.p_client_hash,/^[a-f0-9]{64}$/);if(body.p_request.expected_total!==15)return new Response(JSON.stringify({message:'PRICE_CHANGED'}),{status:400});return new Response('{}');}
  if(url.includes('/rpc/attach_paypal_sandbox')){order.paypal_order_id=JSON.parse(opts.body).p_paypal_id;return new Response('null');}
  if(url.includes('/rpc/confirm_paypal_sandbox')){confirmCalls++;const body=JSON.parse(opts.body);assert.equal(body.p_amount,15);assert.equal(body.p_capture_id,'CAPTURE123456');order.payment_status='paid';return new Response('null');}
  return new Response(JSON.stringify([order]));
 }});
 const post=body=>handler(new Request('https://db.example/functions/v1/paypal-sandbox',{method:'POST',headers:{apikey:'sb_publishable_sboMkfayulaAF7AZPtsp1Q_hgNaE_pq','Content-Type':'application/json',origin:'https://favo2000.github.io'},body:JSON.stringify(body)}));
 const payload={action:'create',order:{request_key:order.request_key,kind:'order',payment_method:'PayPal',expected_total:15}};
 assert.equal((await post({...payload,order:{...payload.order,payment_method:'TWINT'}})).status,400);
 assert.equal((await post({...payload,order:{...payload.order,expected_total:1}})).status,400);assert.equal(createCalls,0);
 const created=await (await post(payload)).json();assert.equal(created.payment_status,'unpaid');assert.equal(created.sandbox,true);assert.match(created.payment_token,/^[a-f0-9]{64}$/);assert.doesNotMatch(JSON.stringify(created),/test-server-secret|test-paypal-secret|test-token/);
 await post(payload);assert.equal(createCalls,1); // Retry reuses stored PayPal ID.
 const capture={action:'capture',request_key:order.request_key,payment_token:created.payment_token};
 assert.equal((await post({...capture,payment_token:'wrong'})).status,403);assert.equal(captureCalls,0);
 let result=await (await post(capture)).json();assert.equal(result.payment_status,'unpaid');assert.equal(captureCalls,0);assert.equal(confirmCalls,0); // No payer approval.
 remoteStatus='APPROVED';wrongAmount=true;assert.equal((await post(capture)).status,503);assert.equal(captureCalls,0);assert.equal(confirmCalls,0);
 wrongAmount=false;captureStatus='PENDING';assert.equal((await post(capture)).status,503);assert.equal(confirmCalls,0);assert.equal(order.payment_status,'unpaid');
 remoteStatus='APPROVED';captureStatus='COMPLETED';timeoutAfterCapture=true;
 result=await (await post(capture)).json();assert.equal(result.payment_status,'paid');assert.equal(confirmCalls,1); // Resolve uncertain capture using authenticated GET.
 const previous=captureCalls;await post(capture);assert.equal(captureCalls,previous);assert.equal(confirmCalls,1);
 console.log('PASS PayPal server: sandbox-only, server CHF total, capability authorization, approval required, amount mismatch, pending capture rejection, timeout recovery, idempotent create/capture, no exposed secrets.');
}
async function storefront(){
 const {JSDOM}=require('jsdom');const read=p=>fs.readFileSync(p,'utf8');
 const tick=()=>new Promise(r=>setTimeout(r,30));
 const dom=new JSDOM(read('index.html'),{url:'https://favo2000.github.io/favo3dworld/?paypal=sandbox',runScripts:'outside-only'}),w=dom.window,$=id=>w.document.getElementById(id);
 Object.defineProperty(w,'crypto',{value:webcrypto});w.TextEncoder=TextEncoder;w.AbortSignal=AbortSignal;w.HTMLElement.prototype.scrollIntoView=()=>{};w.alert=()=>{};
 let calls=[],paid=false;
 w.fetch=async(url,options)=>{
  if(String(url).includes('/functions/')){const body=JSON.parse(options.body);calls.push(body);return {ok:true,json:async()=>({sandbox:true,kind:'order',order_number:'FW-SANDBOX',payment_method:'PayPal',payment_status:paid?'paid':'unpaid',subtotal:15,shipping:5,total:20,request_key:'22222222-2222-4222-8222-222222222222',payment_token:'a'.repeat(64),approval_url:'https://www.sandbox.paypal.com/checkoutnow?token=TEST'})};}
  return {ok:true,json:async()=>[{id:6,name:'Frugo',active:true,price_50:15,price_60:null,price_70:null,stock:null,color_regions:[],category:'gifts',seasons:[],photo_mode:'none',allow_wish_text:false}]};
 };
 const inline=[...w.document.querySelectorAll('script:not([src])')].map(n=>n.textContent).join('\n');
 w.eval(read('supabase-config.js')+'\n'+inline+'\n'+read('product-options.js')+'\n'+read('products.js')+'\n'+read('checkout.js')+'\n'+read('paypal-sandbox.js')+'\nwindow.seed=()=>{cart=[{productId:6,name:"Frugo",size:"50 cm",price:15,quantity:1,colorSelections:[]}];renderCart();};');
 await tick();assert.equal(w.PayPalSandbox.enabled,true);assert.match($('placeOrder').textContent,/PayPal Sandbox/);
 w.seed();for(const [id,value] of Object.entries({firstName:'Test',lastName:'Only',email:'test@example.invalid',street:'Test 1',zip:'1000',city:'Test'}))$(id).value=value;
 $('placeOrder').click();await tick();assert.equal(calls[0].action,'create');assert.equal(calls[0].order.expected_total,20);
 const panel=$('paypalSandboxStatus');assert.equal(panel.hidden,false);assert.match(panel.textContent,/Nur Testgeld/);assert.match(panel.querySelector('a').href,/www.sandbox.paypal.com/);
 $('langFR').click();assert.match(panel.textContent,/argent fictif/);assert.match($('placeOrder').textContent,/Tester avec/);
 paid=true;panel.querySelector('button').click();await tick();assert.equal(calls.at(-1).action,'capture');assert.equal(calls.at(-1).payment_token,'a'.repeat(64));assert.equal(calls.at(-1).total,undefined);assert.match(panel.textContent,/confirmé/);assert.match($('orderStatus').textContent,/paiement test Sandbox confirmé/);
 $('langDE').click();assert.match($('orderStatus').textContent,/Sandbox-Testzahlung bestätigt/);
 dom.window.close();console.log('PASS PayPal DOM: opt-in test mode, existing server order payload/totals, Sandbox link, capability-only capture, paid confirmation and DE/FR.');
}
(async()=>{await scenario();await storefront();})().catch(e=>{console.error(e);process.exit(1)});
