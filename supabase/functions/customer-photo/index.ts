// Server-only credentials come from Supabase runtime. Never return a storage URL or key.
const origin='https://favo2000.github.io';
const cors={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};
const reply=(status:number,data:unknown)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
const hex=(b:ArrayBuffer)=>Array.from(new Uint8Array(b),n=>n.toString(16).padStart(2,'0')).join('');
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
Deno.serve(async(req:Request)=>{
 if(req.headers.get('origin')&&req.headers.get('origin')!==origin)return reply(403,{error:'ORIGIN_DENIED'});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(req.method!=='POST')return reply(405,{error:'METHOD_NOT_ALLOWED'});
 if(req.headers.get('apikey')!=='sb_publishable_sboMkfayulaAF7AZPtsp1Q_hgNaE_pq')return reply(401,{error:'UNAUTHORIZED'});
 const url=new URL(req.url),product=url.searchParams.get('product_id'),cart=url.searchParams.get('cart_item_id'),mime=req.headers.get('content-type')||'';
 if(!product||!/^\d{1,15}$/.test(product)||!cart||!uuid.test(cart)||!['image/jpeg','image/png','image/webp'].includes(mime))return reply(400,{error:'INVALID_REQUEST'});
 try{
  const key=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}').default||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const base=Deno.env.get('SUPABASE_URL');if(!key||!base)return reply(503,{error:'SERVICE_UNAVAILABLE'});
  const headers:Record<string,string>={apikey:key,'Content-Type':'application/json'};if(!key.startsWith('sb_secret_'))headers.Authorization='Bearer '+key;
  const api=async(path:string,method='GET',body?:unknown)=>{const r=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error((await r.json()).message||'SERVICE_UNAVAILABLE');return r.status===204?null:await r.json();};
  const token=hex(crypto.getRandomValues(new Uint8Array(32)).buffer),tokenHash=hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)));
  const ip=req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown';
  const signing=await crypto.subtle.importKey('raw',new TextEncoder().encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const clientHash=hex(await crypto.subtle.sign('HMAC',signing,new TextEncoder().encode(ip)));
  // Rate-limit before consuming the body, including invalid/aborted attempts.
  const reservation=await api('/rest/v1/rpc/reserve_customer_photo','POST',{p_product:Number(product),p_cart:cart,p_token_hash:tokenHash,p_client_hash:clientHash,p_mime:mime});
  const reader=req.body?.getReader();if(!reader)return reply(400,{error:'INVALID_IMAGE'});
  let size=0,timedOut=false;const chunks:Uint8Array[]=[];const deadline=setTimeout(()=>{timedOut=true;reader.cancel();},30000);
  try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>5242880){await reader.cancel();return reply(413,{error:'FILE_TOO_LARGE'});}chunks.push(part.value);}}finally{clearTimeout(deadline);}
  if(timedOut)return reply(408,{error:'UPLOAD_TIMEOUT'});
  const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}
  const sig=(at:number,arr:number[])=>arr.every((b,i)=>bytes[at+i]===b);
  const valid=size>=12&&(mime==='image/png'?sig(0,[137,80,78,71,13,10,26,10]):mime==='image/jpeg'?sig(0,[255,216,255]):sig(0,[82,73,70,70])&&sig(8,[87,69,66,80]));
  if(!valid)return reply(400,{error:'INVALID_IMAGE'});
  const upload=await fetch(base+'/storage/v1/object/customer-photos/'+reservation.path,{method:'POST',headers:{...headers,'Content-Type':mime,'x-upsert':'false'},body:bytes,signal:AbortSignal.timeout(30000)});
  if(!upload.ok)return reply(503,{error:'UPLOAD_FAILED'});
  await api('/rest/v1/CustomerPhotos?id=eq.'+reservation.id,'PATCH',{status:'ready'});
  // On subsequent uploads remove expired, unassociated files via Storage API (never SQL object deletion).
  const expired=await api('/rest/v1/CustomerPhotos?select=id,object_path&order_id=is.null&expires_at=lt.'+encodeURIComponent(new Date().toISOString())+'&limit=20');
  if(expired.length){try{await api('/storage/v1/object/customer-photos','DELETE',{prefixes:expired.map((p:{object_path:string})=>p.object_path)});await api('/rest/v1/CustomerPhotos?id=in.('+expired.map((p:{id:string})=>p.id).join(',')+')&order_id=is.null','DELETE');}catch{/* Retry cleanup on a later upload. */}}
  return reply(200,{id:reservation.id,token});
 }catch(e){const code=(e as Error).message;return reply(code==='RATE_LIMIT'?429:code==='PRODUCT_UNAVAILABLE'?400:503,{error:['RATE_LIMIT','PRODUCT_UNAVAILABLE'].includes(code)?code:'SERVICE_UNAVAILABLE'});}
});
