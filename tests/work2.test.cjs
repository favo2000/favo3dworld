const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require('jsdom'),{webcrypto}=require('node:crypto'),{stripTypeScriptTypes}=require('node:module');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const tick=()=>new Promise(r=>setTimeout(r,25));
async function storefront(){
 const dom=new JSDOM(read('index.html'),{url:'https://shop.example.test',runScripts:'outside-only'}),w=dom.window,$=id=>w.document.getElementById(id);
 Object.defineProperty(w,'crypto',{value:webcrypto});w.TextEncoder=TextEncoder;w.AbortSignal=AbortSignal;w.alert=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
 const row={id:6,name:'Frugo',active:true,description_de:'Test',description_fr:'Essai',stock:null,price_50:10,price_60:79.99,price_70:80,category:'gifts',seasons:[],photo_mode:'none',allow_wish_text:true,color_regions:[]};
 let requests=[],fail=false;
 w.fetch=async(url,options)=>{
  if(!String(url).includes('/functions/'))return {ok:true,json:async()=>[row]};
  const body=JSON.parse(options.body);requests.push(body);if(fail)throw new Error('Network interrupted');
  return {ok:true,json:async()=>({order_number:'FW-TEST',kind:body.kind,payment_method:body.payment_method,payment_status:'unpaid',subtotal:body.kind==='order'?body.items[0].quantity*10:210,shipping:body.kind==='order'?5:0,total:body.expected_total||210})};
 };
 const inline=[...w.document.querySelectorAll('script:not([src])')].map(x=>x.textContent).join('\n');
 w.eval(read('supabase-config.js')+'\n'+inline+'\n'+read('product-options.js')+'\n'+read('products.js')+'\n'+read('bulk-inquiry.js')+'\n'+read('checkout.js')+'\nwindow.setCartForTest=x=>{cart=x;renderCart();};window.getCartForTest=()=>cart;');
 await tick();
 const entry={productId:6,name:'Frugo',size:'50 cm',quantity:1,price:10,colorSelections:[],personalization:{text:'Marie',cart_item_id:'test-cart'}};
 for(const [price,shipping,total] of [[10,5,15],[79.99,5,84.99],[80,0,80],[80.01,0,80.01]]){
  w.setCartForTest([{...entry,price}]);$('toCheckout').click();
  for(const prefix of ['cart','checkout']){assert.equal($(prefix+'Subtotal').textContent,'CHF '+price.toFixed(2));assert.equal($(prefix+'Shipping').textContent,'CHF '+shipping.toFixed(2));assert.equal($(prefix+'Total').textContent,'CHF '+total.toFixed(2));}
 }
 w.setCartForTest([{...entry,quantity:2}]);assert.equal($('cartTotal').textContent,'CHF 25.00');
 $('langFR').click();assert.match($('freeShipping').textContent,/Encore CHF 60.00/);assert.match($('checkoutModal').textContent,/Sous-total/);assert.match($('placeOrder').textContent,/non payée/);
 assert.doesNotMatch($('cartDrawer').textContent+$('checkoutModal').textContent,/Rechnung|facture/i);
 $('langDE').click();
 for(const [id,value] of Object.entries({firstName:'Test',lastName:'Only',email:'test@example.invalid',street:'Test 1',zip:'1000',city:'Test'}))$(id).value=value;
 $('paymentMethod').value='TWINT';fail=true;$('placeOrder').click();await tick();
 assert.equal(requests[0].expected_total,25);assert.equal(requests[0].payment_method,'TWINT');assert.equal(requests[0].items[0].quantity,2);assert.equal(requests[0].payment_status,undefined);assert.equal($('paymentMethod').disabled,true);
 fail=false;$('placeOrder').click();await tick();assert.deepEqual(requests[1],requests[0]);assert.equal(w.getCartForTest().length,0);assert.match($('orderStatus').textContent,/Noch nicht bezahlt/);assert.equal($('checkoutTotal').textContent,'CHF 25.00');
 $('langFR').click();assert.match($('orderStatus').textContent,/Non payée/);assert.equal(w.localStorage.getItem('favoLang'),'fr');
 w.openCatalogSimple(row,'assets/frugo-real.jpg');
 const host=$('simpleModal').querySelector('.product-option-fields');const plus=host.querySelector('.quantity-control button:last-of-type');
 for(let n=0;n<25;n++)plus.click();assert.equal(host.querySelector('output').textContent,'20');assert.equal(plus.disabled,true);
 [...host.querySelectorAll('button')].find(b=>b.textContent==='Demander plus de 20 pièces').click();
 const bulk=$('bulkInquiry');assert.equal(bulk.classList.contains('open'),true);assert.match(bulk.textContent,/Aucun achat/);
 const inputs=bulk.querySelectorAll('input');['Test','Bulk','bulk@example.invalid','25'].forEach((v,i)=>inputs[i].value=v);
 fail=true;bulk.querySelector('form').dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();const attempt=requests.at(-1);assert.equal(attempt.kind,'inquiry');assert.equal(attempt.items[0].quantity,25);assert.equal(attempt.payment_method,null);
 fail=false;bulk.querySelector('form').dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();assert.deepEqual(requests.at(-1),attempt);assert.match(bulk.textContent,/enregistrée/);assert.match(bulk.textContent,/Aucune commande/);
 dom.window.close();
 console.log('PASS Work 2 DOM: shipping boundaries, quantity totals, unpaid TWINT receipt, unchanged retries, DE/FR, POD cap and stored inquiry flow.');
}
async function edge(){
 let handler,calls=[];const secret='test-only-secret';
 vm.runInNewContext(stripTypeScriptTypes(read('supabase/functions/place-order/index.ts')),{Deno:{serve:fn=>handler=fn,env:{get:key=>key==='SUPABASE_SERVICE_ROLE_KEY'?secret:key==='SUPABASE_URL'?'https://example.supabase.co':undefined}},crypto:webcrypto,Request,Response,Uint8Array,TextEncoder,TextDecoder,AbortSignal,fetch:async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify({payment_status:'unpaid'}));}});
 const headers={apikey:'sb_publishable_sboMkfayulaAF7AZPtsp1Q_hgNaE_pq',origin:'https://favo2000.github.io','Content-Type':'application/json'};
 const post=(payload,extra={})=>handler(new Request('https://example.supabase.co/functions/v1/place-order-work2',{method:'POST',headers:{...headers,...extra},body:JSON.stringify(payload)}));
 for(const payload of [{payment_method:'Rechnung'},{payment_method:'Cash'},{payment_method:'PayPal',payment_status:'paid'},{kind:'inquiry',payment_method:'TWINT'}])assert.equal((await post(payload)).status,400);
 assert.equal((await post({payment_method:'PayPal'},{origin:'https://attacker.test'})).status,403);
 assert.equal((await post({payment_method:'PayPal'},{apikey:'wrong'})).status,401);assert.equal(calls.length,0);
 for(const payload of [{payment_method:'PayPal'},{payment_method:'TWINT'},{kind:'inquiry',payment_method:null}]){
  const response=await post(payload);assert.equal(response.status,200);assert.doesNotMatch(await response.text(),new RegExp(secret));
  const call=calls.at(-1);assert.match(call.url,/rpc\/submit_shop_order$/);assert.equal(call.options.headers.apikey,secret);const body=JSON.parse(call.options.body);assert.match(body.p_client_hash,/^[a-f0-9]{64}$/);assert.deepEqual(body.p_request,payload);
 }
 assert.equal((await post({payment_method:'PayPal',oversized:'x'.repeat(33000)})).status,413);
 console.log('PASS Work 2 Edge mock: invoice/spoofed-paid/method/origin/key rejection, bounded request, server-only credential, RPC routing. Database behavior still requires SQL integration tests.');
}
async function admin(){
 const dom=new JSDOM(read('index.html'),{url:'https://shop.example.test',runScripts:'outside-only'}),w=dom.window;
 w.eval("window.ProductOptions={t:(de,fr)=>document.documentElement.lang==='fr'?fr:de,node:(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;},localized:(n,de,fr)=>{n.dataset.optionDe=de;n.dataset.optionFr=fr;n.textContent=window.ProductOptions.t(de,fr);return n;}};");
 let downloads=0,revoked=0,updates=[];
 w.URL.createObjectURL=()=> 'blob:private-admin';w.URL.revokeObjectURL=()=>revoked++;
 const order={id:'order-one',order_number:'FW-TEST',kind:'order',created_at:new Date().toISOString(),first_name:'Test',last_name:'Only',email:'test@example.invalid',street:'Test 1',postal_code:'1000',city:'Test',country:'CH',subtotal:20,shipping:5,total:25,payment_method:'TWINT',payment_status:'unpaid',status:'Neu'};
 const items=[{id:'item',product_id:15,product_id_snapshot:15,product_name:'FIRE',size:'60',quantity:2,unit_price:10,line_total:20,wish_text:'<script>no execution</script>',color_details:[{region_de:'Modell',region_fr:'Modèle',name_de:'Rot',name_fr:'Rouge'}],customer_photo_id:'photo'}];
 const client={from(table){let one=false,update=null;const filters={};const query={select(){return query;},order(){return query;},range(){return query;},eq(k,v){filters[k]=v;return query;},single(){one=true;return query;},update(v){update=v;updates.push(v);return query;},then(resolve){if(update)return Promise.resolve({data:[{id:order.id,status:update.status}],error:null}).then(resolve);if(table==='CustomerPhotos'){assert.equal(filters.order_id,order.id);assert.equal(filters.status,'attached');}return Promise.resolve({data:table==='Orders'?(one?order:[order]):table==='OrderItems'?items:{object_path:'private-path.png'},error:null}).then(resolve);}};return query;},storage:{from(bucket){assert.equal(bucket,'customer-photos');return {download:async file=>{downloads++;assert.equal(file,'private-path.png');return {data:new w.Blob(['private']),error:null};}};}}};
 w.eval(read('admin-orders.js'));const host=w.document.getElementById('adminOrders');
 w.OrdersAdmin.setAccess(client,false);assert.equal(host.hidden,true);assert.equal(downloads,0);
 w.OrdersAdmin.setAccess(client,true);await tick();[...host.querySelectorAll('button')].find(b=>b.textContent.includes('FW-TEST')).click();await tick();
 assert.match(host.textContent,/FIRE × 2/);assert.match(host.textContent,/Nicht bezahlt/);assert.match(host.textContent,/CHF 25.00/);assert.equal(host.querySelector('script'),null);
 [...host.querySelectorAll('button')].find(b=>b.textContent==='Privates Kundenfoto anzeigen').click();await tick();assert.equal(downloads,1);assert.equal(host.querySelector('img').src,'blob:private-admin');
 const select=host.querySelector('select');select.value='Versendet';[...host.querySelectorAll('button')].find(b=>b.textContent==='Status speichern').click();await tick();assert.equal(JSON.stringify(updates),JSON.stringify([{status:'Versendet'}]));
 w.document.documentElement.lang='fr';w.OrdersAdmin.refresh();assert.match(host.textContent,/Modèle: Rouge/);assert.match(host.textContent,/Non payé/);assert.ok(revoked>0);
 w.OrdersAdmin.setAccess(client,false);assert.equal(host.hidden,true);assert.doesNotMatch(host.textContent,/test@example.invalid/);assert.equal(host.querySelector('img'),null);
 dom.window.close();console.log('PASS Work 2 admin mock: list/detail, snapshot text escaping, status-only update, private authenticated photo download, DE/FR and logout cleanup.');
}
(async()=>{await storefront();await edge();await admin();})().catch(e=>{console.error(e);process.exit(1)});
