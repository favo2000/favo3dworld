const INSTANCE='favo3dworld';
const API='https://api.payrexx.com/v1.17';
const sites:Record<string,string>={'https://favo2000.github.io':'https://favo2000.github.io/favo3dworld/','https://favo3dworld.ch':'https://favo3dworld.ch/','https://www.favo3dworld.ch':'https://www.favo3dworld.ch/'};
const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9-]{36}$/i.test(v);
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('origin')||'https://favo2000.github.io',site=sites[origin];
 const cors={'Access-Control-Allow-Origin':site?origin:'https://favo2000.github.io','Access-Control-Allow-Headers':'apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};
 const reply=(s:number,d:unknown)=>new Response(JSON.stringify(d),{status:s,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
 if(!site)return reply(403,{error:'ORIGIN_DENIED'}); if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(req.method!=='POST'||req.headers.get('apikey')!==Deno.env.get('SUPABASE_ANON_KEY'))return reply(401,{error:'UNAUTHORIZED'});
 try{
  const body=await req.json(); if(!body||!['create','verify'].includes(body.action)||!uuid(body.request_key))return reply(400,{error:'INVALID_REQUEST'});
  const secret=Deno.env.get('PAYREXX_API_KEY'),service=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}').default||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),base=Deno.env.get('SUPABASE_URL');
  if(!secret||!service||!base)throw new Error('CONFIG');
  const db=async(path:string,method='GET',value?:unknown)=>{const r=await fetch(base+'/rest/v1/'+path,{method,headers:{apikey:service,'Content-Type':'application/json',...(!service.startsWith('sb_secret_')?{Authorization:'Bearer '+service}:{})},...(value?{body:JSON.stringify(value)}:{}),signal:AbortSignal.timeout(18000)});const t=await r.text(),d=t?JSON.parse(t):null;if(!r.ok)throw new Error(d?.message||'DB');return d;};
  const rows=await db('Orders?request_key=eq.'+encodeURIComponent(body.request_key)+'&select=id,order_number,total,currency,payment_method,payment_status,kind,status,payrexx_gateway_id,payrexx_gateway_hash');
  const order=rows?.[0]; if(!order||order.payment_method!=='TWINT'||order.kind!=='order')return reply(404,{error:'ORDER_NOT_FOUND'});
  if(order.status==='Storniert')return reply(409,{error:'ORDER_CANCELLED'});
  const api=async(path:string,method='GET',value?:unknown)=>{const r=await fetch(API+path+(path.includes('?')?'&':'?')+'instance='+encodeURIComponent(INSTANCE),{method,headers:{'X-API-KEY':secret,'Content-Type':'application/json','Accept':'application/json'},...(value?{body:JSON.stringify(value)}:{}),signal:AbortSignal.timeout(18000)});const d=await r.json();if(!r.ok||d?.status==='error')throw new Error('PAYREXX');return d;};
  if(body.action==='create'&&!order.payrexx_gateway_id){
   const amount=Math.round(Number(order.total)*100); if(order.currency!=='CHF'||!Number.isSafeInteger(amount)||amount<1)throw new Error('MISMATCH');
   const created=await api('/Gateway/','POST',{amount,currency:'CHF',purpose:'Favo3DWorld '+order.order_number,referenceId:order.id,pm:['twint'],language:body.language==='fr'?'fr':'de',successRedirectUrl:site+'?payrexx=return',failedRedirectUrl:site+'?payrexx=failed',cancelRedirectUrl:site+'?payrexx=cancel',skipResultPage:true,validity:60});
   const g=created?.data?.[0],id=Number(g?.id),hash=typeof g?.hash==='string'?g.hash:'';
   if(!Number.isInteger(id)||id<1||!hash)throw new Error('PAYREXX');
   await db('rpc/attach_payrexx','POST',{p_id:order.id,p_gateway_id:id,p_gateway_hash:hash});order.payrexx_gateway_id=id;order.payrexx_gateway_hash=hash;
  }
  if(!order.payrexx_gateway_id)return reply(409,{error:'PAYMENT_NOT_READY'});
  const remote=await api('/Gateway/'+order.payrexx_gateway_id+'/');
  const gateway=remote?.data?.[0]; if(!gateway||String(gateway.referenceId)!==String(order.id))throw new Error('MISMATCH');
  const amount=Math.round(Number(order.total)*100),transactions=(gateway.invoices||[]).flatMap((i:any)=>i.transactions||[]);
  const paid=transactions.some((t:any)=>t.status==='confirmed'&&Number(t.amount)===amount&&String(t.currency||'CHF')==='CHF');
  if(paid&&order.payment_status!=='paid'){await db('rpc/confirm_payrexx','POST',{p_id:order.id,p_gateway_id:Number(order.payrexx_gateway_id),p_currency:'CHF',p_amount:order.total});order.payment_status='paid';}
  const payment_url='https://'+INSTANCE+'.payrexx.com/?payment='+encodeURIComponent(order.payrexx_gateway_hash);
  return reply(200,{order_number:order.order_number,kind:'order',payment_method:'TWINT',payment_status:paid?'paid':order.payment_status,currency:'CHF',total:order.total,request_key:body.request_key,payment_url});
 }catch{return reply(503,{error:'PAYREXX_UNAVAILABLE'});}
});