const {JSDOM}=require('jsdom');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const admin='00000000-0000-4000-8000-000000000001';
const initial={id:1,name:'Cavallo',description_de:'Testprodukt',description_fr:'Produit',price_50:15,price_60:20,price_70:25,stock:5,image_url:null,color_mode:'mehrfarbig',active:true};
async function run(){
const dom=new JSDOM(read('index.html'),{url:'https://shop.example.test',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window,$=id=>w.document.getElementById(id);
let current=null,loginId=admin,rows=[{...initial}],uploads=0,callbacks=[],failSave=false;
w.confirm=()=>true;w.alert=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
w.URL.createObjectURL=()=> 'blob:https://shop.example.test/test';w.URL.revokeObjectURL=()=>{};
Object.defineProperty(w,'crypto',{value:webcrypto});
w.fetch=async()=>({ok:true,json:async()=>rows.filter(p=>p.active)});
const client={rpc:async()=>({data:current?.id===admin}),auth:{
 getSession:async()=>({data:{session:null}}),getUser:async()=>({data:{user:current},error:!current}),
 onAuthStateChange:fn=>callbacks.push(fn),
 signInWithPassword:async()=>{current={id:loginId};callbacks.forEach(f=>f('SIGNED_IN',{user:current}));return{data:{user:current}}},
 signOut:async()=>{current=null;callbacks.forEach(f=>f('SIGNED_OUT',null));return{};}
},from(){let method='select',values,id;return{
 select:asyncOrChain,
 order:async()=>({data:structuredClone(rows)}),
 update(v){method='update';values=v;return this;},insert(v){method='insert';values=v;return this;},delete(){method='delete';return this;},eq(k,v){id=v;return this;}
};function asyncOrChain(){if(method==='select')return this; if(failSave)return Promise.resolve({error:{message:'Simulated failure'}});
 if(method==='insert'){id=8;rows.push({...values,id});}if(method==='update')rows=rows.map(p=>p.id===id?{...p,...values}:p);if(method==='delete')rows=rows.filter(p=>p.id!==id);return Promise.resolve({data:[{id}]});}
},storage:{from(){return{upload:async()=>{uploads++;return{}},getPublicUrl:p=>({data:{publicUrl:'https://storage.example.test/product-images/'+p}})}}}};
w.supabase={createClient:()=>client};
w.eval(read('supabase-config.js'));
// Concatenate scripts to preserve the shared lexical scope of classic scripts.
const inline=[...w.document.querySelectorAll('script:not([src])')].map(s=>s.textContent).join('\n');
w.eval(inline+'\n'+read('products.js')+'\n'+read('admin.js'));
const tick=()=>new Promise(r=>setTimeout(r,20));const submit=id=>$(id).dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
await tick();assert.equal($('adminWorkspace').hidden,true);
$('adminEmail').value='admin@example.test';$('adminPassword').value='test';submit('adminLogin');await tick();
assert.equal($('adminWorkspace').hidden,false);assert.equal($('adminPassword').value,'');
$('adminProducts').querySelector('button').click();$('adminName').value='Cavallo neu';$('adminPrice50').value='19.50';
Object.defineProperty($('adminImage'),'files',{configurable:true,value:[new w.File(['test'],'test.png',{type:'image/png'})]});
submit('adminProductForm');await tick();assert.equal(uploads,1);assert.equal(rows[0].price_50,19.5);assert.match(rows[0].image_url,/product-images/);
assert.equal(w.document.querySelector('#shop .product:not([hidden]) h3').textContent,'Cavallo neu');
$('horseAdd').click();assert.match($('cartItems').textContent,/Cavallo neu/);
Object.defineProperty($('adminImage'),'files',{configurable:true,value:[]});
$('adminProducts').querySelector('button').click();$('adminActive').checked=false;submit('adminProductForm');await tick();
assert.equal(w.document.querySelectorAll('#shop .product:not([hidden])').length,0);
$('adminName').value='Neues Modell';$('adminDescriptionDe').value='Beschreibung';$('adminPrice50').value='5';submit('adminProductForm');await tick();assert.equal(rows.length,2);
const remove=[...$('adminProducts').querySelectorAll('button')].at(-1);remove.click();await tick();assert.equal(rows.length,1);
$('adminProducts').querySelector('button').click();failSave=true;submit('adminProductForm');await tick();assert.match($('adminStatus').textContent,/fehlgeschlagen/);assert.equal($('adminFields').disabled,false);failSave=false;
$('adminLogout').click();await tick();assert.equal($('adminWorkspace').hidden,true);
loginId='11111111-1111-4111-8111-111111111111';$('adminPassword').value='test';submit('adminLogin');await tick();assert.equal($('adminWorkspace').hidden,true);assert.match($('adminStatus').textContent,/keine Admin-Berechtigung/);
dom.window.close();console.log('PASS simulated DOM: admin login, rejected non-admin login, update, upload, shop refresh, renamed configurator/cart, inactive product, create, delete, save error, logout.');
}
run().catch(e=>{console.error(e);process.exit(1)});
