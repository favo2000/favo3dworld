// No third-party dependencies. Guest application key is checked here because
// publishable keys are not JWTs. Database RPC is executable only by service_role.
const origin = 'https://favo2000.github.io';
const cors = {'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};
const reply = (status:number, body:unknown) => new Response(JSON.stringify(body), {status, headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
const publicKey = 'sb_publishable_sboMkfayulaAF7AZPtsp1Q_hgNaE_pq';
Deno.serve(async (req:Request) => {
 if (req.headers.get('origin') && req.headers.get('origin') !== origin) return reply(403,{error:'ORIGIN_DENIED'});
 if (req.method === 'OPTIONS') return new Response(null,{status:204,headers:cors});
 if (req.method !== 'POST') return reply(405,{error:'METHOD_NOT_ALLOWED'});
 if (req.headers.get('apikey') !== publicKey) return reply(401,{error:'UNAUTHORIZED'});
 if (!req.headers.get('content-type')?.includes('application/json')) return reply(415,{error:'INVALID_REQUEST'});
 try {
   // Bound streaming input, not just Content-Length (which callers control).
   const reader=req.body?.getReader(); if(!reader)return reply(400,{error:'INVALID_REQUEST'});
   let size=0;const chunks:Uint8Array[]=[];
   while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>32768){await reader.cancel();return reply(413,{error:'INVALID_REQUEST'});}chunks.push(part.value);}
   const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
   let payload;try{payload=JSON.parse(new TextDecoder().decode(bytes));}catch{return reply(400,{error:'INVALID_REQUEST'});}
   if(!payload || (!['order','inquiry'].includes(payload.kind||'order') || ((payload.kind||'order')==='order' && !['PayPal','TWINT'].includes(payload.payment_method)) || (payload.kind==='inquiry' && payload.payment_method!=null) || Object.hasOwn(payload,'payment_status')))return reply(400,{error:'INVALID_REQUEST'});
   const key = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
   if(!key) return reply(503,{error:'SERVICE_UNAVAILABLE'});
   // Only a keyed digest is stored, never the raw network address.
   const ip=req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
   const hmac=await crypto.subtle.importKey('raw',new TextEncoder().encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);
   const digest=await crypto.subtle.sign('HMAC',hmac,new TextEncoder().encode(ip));
   const clientHash=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
   const headers:Record<string,string>={'Content-Type':'application/json',apikey:key};
   if(!key.startsWith('sb_secret_'))headers.Authorization='Bearer '+key;
   const response=await fetch(Deno.env.get('SUPABASE_URL')+'/rest/v1/rpc/submit_shop_order',{method:'POST',headers,body:JSON.stringify({p_request:payload,p_client_hash:clientHash}),signal:AbortSignal.timeout(20000)});
   const data=await response.json();
   if(!response.ok){
     const allowed=['INVALID_REQUEST','INVALID_CUSTOMER','INVALID_ITEMS','INVALID_OPTIONS','PRODUCT_UNAVAILABLE','OUT_OF_STOCK','PRICE_CHANGED','REQUEST_CONFLICT','RATE_LIMIT'];
     const code=allowed.includes(data.message)?data.message:'SERVICE_UNAVAILABLE';
     return reply(code==='RATE_LIMIT'?429:code==='SERVICE_UNAVAILABLE'?503:400,{error:code});
   }
   return reply(200,data);
 } catch { return reply(503,{error:'SERVICE_UNAVAILABLE'}); }
});
