// Sandbox only. Secrets/tokens/provider response bodies must never be logged.
const API='https://api-m.sandbox.paypal.com';
const SITE='https://favo2000.github.io/favo3dworld/';
const KEY='sb_publishable_sboMkfayulaAF7AZPtsp1Q_hgNaE_pq';
const cors={'Access-Control-Allow-Origin':'https://favo2000.github.io','Access-Control-Allow-Headers':'apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};
const reply=(status:number,data:unknown)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
let cachedToken='',tokenExpiry=0;
async function oauth(){
 if(cachedToken&&Date.now()<tokenExpiry)return cachedToken;
 const id=Deno.env.get('PAYPAL_CLIENT_ID'),secret=Deno.env.get('PAYPAL_CLIENT_SECRET');
 if(!id||!secret)throw new Error('SANDBOX_CONFIG');
 const res=await fetch(API+'/v1/oauth2/token',{method:'POST',headers:{Authorization:'Basic '+btoa(id+':'+secret),'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials',signal:AbortSignal.timeout(15000)});
 const data=await res.json();if(!res.ok||typeof data.access_token!=='string')throw new Error('SANDBOX_AUTH');
 cachedToken=data.access_token;tokenExpiry=Date.now()+Math.max(0,Math.min(Number(data.expires_in)||0,300)-30)*1000;return cachedToken;
}
async function paypal(path:string,method='GET',body?:unknown,requestID?:string){
 const res=await fetch(API+path,{method,headers:{Authorization:'Bearer '+await oauth(),'Content-Type':'application/json',Prefer:'return=representation',...(requestID?{'PayPal-Request-Id':requestID}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(18000)});
 const data=await res.json();if(!res.ok)throw new Error('PAYPAL_UNAVAILABLE');return data;
}
async function mac(secret:string,value:string){
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value))),n=>n.toString(16).padStart(2,'0')).join('');
}
function equal(a:string,b:string){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
const cents=(value:unknown)=>typeof value==='string'&&/^\d+\.\d{2}$/.test(value)?Number(value.replace('.','')):NaN;
function verifyOrder(data:any,order:any){
 const units=data.purchase_units;
 if(data.id!==order.paypal_order_id||data.intent!=='CAPTURE'||!Array.isArray(units)||units.length!==1)throw new Error('PAYMENT_MISMATCH');
 const unit=units[0];
 if(unit.custom_id!==order.id||unit.reference_id!==order.id||unit.amount?.currency_code!=='CHF'||cents(unit.amount.value)!==Math.round(Number(order.total)*100))throw new Error('PAYMENT_MISMATCH');
 return unit;
}
Deno.serve(async(req:Request)=>{
 if(req.headers.get('origin')&&req.headers.get('origin')!=='https://favo2000.github.io')return reply(403,{error:'ORIGIN_DENIED'});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(req.method!=='POST')return reply(405,{error:'METHOD_NOT_ALLOWED'});
 if(req.headers.get('apikey')!==KEY)return reply(401,{error:'UNAUTHORIZED'});
 try{
  if(!req.headers.get('content-type')?.includes('application/json'))return reply(400,{error:'INVALID_REQUEST'});
  const reader=req.body?.getReader();if(!reader)return reply(400,{error:'INVALID_REQUEST'});
  const chunks:Uint8Array[]=[];let size=0;
  while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>32768){await reader.cancel();return reply(413,{error:'INVALID_REQUEST'});}chunks.push(part.value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  let body;try{body=JSON.parse(new TextDecoder().decode(bytes));}catch{return reply(400,{error:'INVALID_REQUEST'});}
  if(!body||!['health','create','capture'].includes(body.action))return reply(400,{error:'INVALID_REQUEST'});
  // Non-mutating connectivity check. Never returns credentials or access tokens.
  if(body.action==='health'){await oauth();return reply(200,{sandbox:true,connected:true});}
  const service=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}').default||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!service)throw new Error('SERVICE_UNAVAILABLE');
  const db=async(path:string,method='GET',value?:unknown)=>{
   const response=await fetch(Deno.env.get('SUPABASE_URL')+'/rest/v1/'+path,{method,headers:{apikey:service,'Content-Type':'application/json',...(!service.startsWith('sb_secret_')?{Authorization:'Bearer '+service}:{})},...(value?{body:JSON.stringify(value)}:{}),signal:AbortSignal.timeout(18000)});
   const text=await response.text();const data=text?JSON.parse(text):null;
   if(!response.ok){const known=['INVALID_CUSTOMER','INVALID_ITEMS','INVALID_OPTIONS','PRODUCT_UNAVAILABLE','OUT_OF_STOCK','PRICE_CHANGED','REQUEST_CONFLICT','RATE_LIMIT','INVALID_REQUEST'];throw new Error(known.includes(data?.message)?data.message:'SERVICE_UNAVAILABLE');}return data;
  };
  const requestKey=body.action==='create'?body.order?.request_key:body.request_key;
  if(!uuid(requestKey))return reply(400,{error:'INVALID_REQUEST'});
  const capability=await mac(service,'paypal-sandbox-v1:'+requestKey);
  if(body.action==='capture'&&(typeof body.payment_token!=='string'||!equal(body.payment_token,capability)))return reply(403,{error:'UNAUTHORIZED'});
  if(body.action==='create'){
   if(body.order?.payment_method!=='PayPal'||body.order?.kind!=='order')return reply(400,{error:'INVALID_REQUEST'});
   await oauth(); // Bad Sandbox credentials must not create a shop order.
   const ip=req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown';
   await db('rpc/submit_shop_order','POST',{p_request:body.order,p_client_hash:await mac(service,ip)});
  }
  const rows=await db('Orders?request_key=eq.'+encodeURIComponent(requestKey)+'&select=id,order_number,request_key,total,subtotal,shipping,currency,payment_method,payment_status,kind,status,paypal_order_id,paypal_capture_id,payment_environment');
  const order=rows?.[0];if(!order||order.payment_method!=='PayPal'||order.kind!=='order')return reply(404,{error:'ORDER_NOT_FOUND'});
  const receipt=()=>({sandbox:true,order_number:order.order_number,kind:'order',payment_method:'PayPal',payment_status:order.payment_status,currency:'CHF',total:order.total,subtotal:order.subtotal,shipping:order.shipping,request_key:requestKey,payment_token:capability});
  if(order.payment_status==='paid'){
   if(order.payment_environment!=='sandbox')throw new Error('PAYMENT_MISMATCH');
   return reply(200,receipt());
  }
  if(order.status==='Storniert')return reply(409,{error:'ORDER_CANCELLED'});
  if(order.payment_environment!=='sandbox'){
   await db('Orders?id=eq.'+order.id,'PATCH',{payment_environment:'sandbox'});order.payment_environment='sandbox';
  }
  if(!order.paypal_order_id){
   if(body.action!=='create')return reply(409,{error:'PAYMENT_NOT_READY'});
   const created=await paypal('/v2/checkout/orders','POST',{intent:'CAPTURE',purchase_units:[{reference_id:order.id,custom_id:order.id,invoice_id:order.order_number,amount:{currency_code:'CHF',value:Number(order.total).toFixed(2)}}],payment_source:{paypal:{experience_context:{user_action:'PAY_NOW',shipping_preference:'NO_SHIPPING',return_url:SITE+'?paypal=return',cancel_url:SITE+'?paypal=cancel'}}}},order.id);
   if(typeof created.id!=='string'||!/^[A-Z0-9]{5,40}$/.test(created.id))throw new Error('PAYMENT_MISMATCH');
   await db('rpc/attach_paypal_sandbox','POST',{p_id:order.id,p_paypal_id:created.id});order.paypal_order_id=created.id;
  }
  let remote=await paypal('/v2/checkout/orders/'+order.paypal_order_id);let unit=verifyOrder(remote,order);
  if(body.action==='capture'&&remote.status==='APPROVED'){
   // Verify order identity, currency and amount before moving even test money.
   try{await paypal('/v2/checkout/orders/'+order.paypal_order_id+'/capture','POST',{},order.id.replaceAll('-','')+'-cap');}catch{/* A timeout/already-captured response is resolved with a fresh authenticated read. */}
   remote=await paypal('/v2/checkout/orders/'+order.paypal_order_id);unit=verifyOrder(remote,order);
  }
  if(remote.status==='COMPLETED'){
   const captures=unit.payments?.captures;
   if(!Array.isArray(captures)||captures.length!==1||captures[0].status!=='COMPLETED'||captures[0].final_capture!==true||captures[0].amount?.currency_code!=='CHF'||cents(captures[0].amount.value)!==Math.round(Number(order.total)*100)||typeof captures[0].id!=='string')throw new Error('PAYMENT_MISMATCH');
   await db('rpc/confirm_paypal_sandbox','POST',{p_id:order.id,p_paypal_id:order.paypal_order_id,p_capture_id:captures[0].id,p_currency:'CHF',p_amount:order.total});order.payment_status='paid';
   return reply(200,receipt());
  }
  const href=remote.links?.find((l:any)=>['approve','payer-action'].includes(l.rel))?.href;
  let approvalURL=null;if(href){const url=new URL(href);if(url.protocol==='https:'&&url.hostname==='www.sandbox.paypal.com'&&!url.username&&!url.password)approvalURL=url.href;}
  return reply(200,{...receipt(),approval_url:approvalURL});
 }catch(error){
  const code=error instanceof Error?error.message:'';
  const safe=['INVALID_CUSTOMER','INVALID_ITEMS','INVALID_OPTIONS','PRODUCT_UNAVAILABLE','OUT_OF_STOCK','PRICE_CHANGED','REQUEST_CONFLICT','RATE_LIMIT','INVALID_REQUEST','SANDBOX_CONFIG','SANDBOX_AUTH','PAYMENT_MISMATCH'];
  return reply(code==='RATE_LIMIT'?429:code.startsWith('INVALID_')||['OUT_OF_STOCK','PRICE_CHANGED','PRODUCT_UNAVAILABLE','REQUEST_CONFLICT'].includes(code)?400:503,{error:safe.includes(code)?code:'PAYPAL_UNAVAILABLE',sandbox:true});
 }
});
