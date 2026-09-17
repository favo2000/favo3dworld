const {JSDOM}=require('jsdom'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const seed=require('./product-options-seed.json');
async function run(){
 const dom=new JSDOM(read('index.html'),{url:'https://shop.example.test',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,$=id=>w.document.getElementById(id);Object.defineProperty(w,'crypto',{value:webcrypto});
 w.HTMLElement.prototype.scrollIntoView=()=>{};w.alert=()=>{};w.URL.createObjectURL=()=> 'blob:local-preview';w.URL.revokeObjectURL=()=>{};
 const names={1:'Cavallo',2:'Hoodie Drache',3:'Scheiben',4:'Zen Schildkröte',5:'Pika Urban',6:'Frugo',7:'Papa Sch.',15:'FIRE'};
 const rows=seed.map(p=>({...p,name:names[p.id],description_de:'Test',description_fr:'Essai',price_50:15,price_60:p.id===3?null:20,price_70:p.id===3?null:25,stock:null,active:true,image_url:null,color_mode:'einfarbig',seasons:[],photo_mode:'none',allow_wish_text:false}));
 rows.push({id:50,name:'Foto Hochzeit',description_de:'Foto',description_fr:'Photo',price_50:30,price_60:null,price_70:null,stock:3,active:true,image_url:null,color_mode:'original',color_regions:[],category:'wedding',seasons:['valentine'],photo_mode:'required',allow_wish_text:true});
 rows.push({...rows.at(-1),id:51,name:'Inactive Christmas',active:false,category:'gifts',seasons:['christmas']});
 let uploads=0,failUpload=false;
 w.fetch=async url=>{if(String(url).includes('customer-photo')){uploads++;return{ok:!failUpload,json:async()=>({id:'11111111-1111-4111-8111-111111111111',token:'a'.repeat(64)})};}return{ok:true,json:async()=>rows.filter(p=>p.active)};};
 w.eval(read('supabase-config.js'));const inline=[...w.document.querySelectorAll('script:not([src])')].map(s=>s.textContent).join('\n');
 w.eval(inline+'\n'+read('product-options.js')+'\n'+read('products.js')+'\n'+read('checkout.js')+'\n'+read('admin-options.js')+'\nwindow.testCart=()=>cart;window.resetTestCart=()=>{cart=[];renderCart();};');
 const tick=()=>new Promise(r=>setTimeout(r,20));await tick();
 assert.equal(w.document.querySelector('[src*="product-3d"]'),null);assert.equal($('adminGlb'),null);
 assert.match(w.document.querySelector('.hero h1').textContent,/3D-Druck mit Leidenschaft/);
 assert.equal(w.document.querySelector('[data-category="christmas"]'),null);assert.ok(w.document.querySelector('[data-category="wedding"]'));
 w.document.querySelector('[data-category="valentine"]').click();assert.deepEqual([...w.document.querySelectorAll('#shop .product:not([hidden])')].map(c=>c.dataset.catalogId),['50']);
 documentAll();
 function documentAll(){w.document.querySelector('.all-products button').click();}
 $('openHorseConfig').click();const horseChoice=$('horseModal').querySelector('[data-region-id="primary"][data-color-id="rot"]');horseChoice.click();
 assert.match($('horsePreview').src,/cavallo-real.jpg/);$('horseSize').value='60';$('horseSize').dispatchEvent(new w.Event('change'));$('horseAdd').click();await tick();
 assert.match($('cartItems').textContent,/Pferd: Rot/);assert.match($('cartItems').textContent,/Sockel: Schwarz/);assert.match($('cartItems').textContent,/20.00/);
 $('horseModal').querySelector('[data-color-id="gold"]').click();assert.match($('cartItems').textContent,/Pferd: Rot/);
 $('openPikaConfig').click();const image=$('pikaPreview').src;$('pikaModal').querySelector('[data-region-id="primary"][data-color-id="rot"]').click();$('pikaModal').querySelector('[data-region-id="secondary"][data-color-id="schwarz"]').click();assert.equal($('pikaPreview').src,image);
 $('pikaAdd').click();await tick();assert.match($('cartItems').textContent,/Körper: Rot/);assert.match($('cartItems').textContent,/Hoodie: Schwarz/);
 $('langFR').click();assert.equal(w.localStorage.getItem('favoLang'),'fr');assert.equal($('langFR').getAttribute('aria-pressed'),'true');assert.match($('cartItems').textContent,/Corps: Rouge/);assert.match($('qualityTitle').textContent,/Fabriqué avec amour/);assert.match(w.document.querySelector('[data-category="wedding"]').textContent,/Mariage/);
 const photo=rows.find(p=>p.id===50);w.eval('openCatalogSimple')(photo,'assets/logo-reference.png');assert.equal($('simpleModal').querySelectorAll('.product-color-choice').length,0);
 $('simpleAdd').click();await tick();assert.equal(uploads,0);assert.match($('simpleModal').textContent,/Choisis d’abord une photo/);
 const file=$('simpleModal').querySelector('[data-customer-photo]');Object.defineProperty(file,'files',{value:[new w.File(['fake'],'test.png',{type:'image/png'})],configurable:true});file.dispatchEvent(new w.Event('change'));
 const txt=$('simpleModal').querySelector('[data-wish-text]');txt.value='<img onerror=alert(1)> Marie & Alex';txt.dispatchEvent(new w.Event('input'));
 failUpload=true;$('simpleAdd').click();await tick();assert.equal(w.testCart().length,2);assert.match($('simpleModal').textContent,/Échec/);
 failUpload=false;$('simpleAdd').click();await tick();assert.equal(w.testCart().length,3);assert.match($('cartItems').textContent,/Photo personnelle associée/);assert.match($('cartItems').textContent,/<img onerror/);assert.equal($('cartItems').querySelector('[onerror]'),null);
 const item=w.testCart()[2];assert.equal(item.personalization.id,'11111111-1111-4111-8111-111111111111');assert.equal(item.personalization.cart_item_id,item.cartItemId);assert.equal(item.colorSelections.length,0);
 w.changeCartQuantity(2,1);assert.equal(item.quantity,2);assert.equal(w.invoiceItems()[2].quantity,2);assert.equal(w.invoiceItems()[2].personalization.id,item.personalization.id);
 $('toCheckout').click();assert.match($('checkoutItems').textContent,/Foto Hochzeit × 2/);assert.match($('checkoutItems').textContent,/60.00/);$('langDE').click();assert.match($('checkoutItems').textContent,/Kundenfoto zugeordnet/);assert.equal(w.document.documentElement.lang,'de');
 // Exact configurations merge, with quantities bounded across all product variants.
 w.resetTestCart();const discs=rows.find(p=>p.id===3);discs.stock=5;discs.price_50=10;
 w.openCatalogSimple(discs,'assets/logo-reference.png');$('simpleModal').querySelector('.quantity-control button:last-of-type').click();assert.match($('simpleModal').querySelector('.quantity-control').textContent,/20.00/);$('simpleAdd').click();await tick();
 w.openCatalogSimple(discs,'assets/logo-reference.png');$('simpleAdd').click();await tick();assert.equal(w.testCart().length,1);assert.equal(w.testCart()[0].quantity,3);assert.equal($('cartTotal').textContent,'CHF 30.00');
 w.changeCartQuantity(0,1);w.changeCartQuantity(0,1);w.changeCartQuantity(0,1);assert.equal(w.testCart()[0].quantity,5);assert.equal($('cartTotal').textContent,'CHF 50.00');assert.equal(w.addCatalogItem({...w.testCart()[0],quantity:1}),false);
 w.changeCartQuantity(0,-1);assert.equal(w.testCart()[0].quantity,4);
 // Zero-stock Scheiben is made-to-order; zero-stock ordinary products stay unavailable.
 w.resetTestCart();discs.stock=0;await w.loadCatalog();
 const discCard=w.document.querySelector('[data-catalog-id="3"]');assert.equal(discCard.querySelector('.badge').textContent,'Auf Bestellung');assert.equal(discCard.querySelector('button:not(.heart)').disabled,false);
 $('langFR').click();assert.equal(discCard.querySelector('.badge').textContent,'Sur commande');
 discCard.querySelector('button:not(.heart)').click();assert.match($('simpleSize').textContent,/Taille fixe/);const more=$('simpleModal').querySelector('.quantity-control button:last-of-type');more.click();more.click();$('simpleAdd').click();await tick();assert.equal(w.testCart()[0].quantity,3);assert.equal($('cartTotal').textContent,'CHF 30.00');w.changeCartQuantity(0,1);assert.equal(w.testCart()[0].quantity,4);
 const ordinary=rows.find(p=>p.id===6);ordinary.stock=0;await w.loadCatalog();assert.equal(w.document.querySelector('[data-catalog-id="6"] button:not(.heart)').disabled,true);ordinary.stock=null;
 // Replenishing stock re-enables the limit, including amounts already in the cart.
 discs.stock=5;await w.loadCatalog();assert.match(w.document.querySelector('[data-catalog-id="3"] .badge').textContent,/En stock/);w.changeCartQuantity(0,1);w.changeCartQuantity(0,1);assert.equal(w.testCart()[0].quantity,5);$('langDE').click();
 w.resetTestCart();const frugo=rows.find(p=>p.id===6);frugo.stock=3;
 const entry={productId:6,name:'Frugo',size:'50 cm',image:'assets/frugo-real.jpg',colorSelections:[{region_id:'primary',color_id:'petrol',region_de:'Modell',region_fr:'Modèle',name_de:'Petrol',name_fr:'Bleu pétrole'}],personalization:{text:'A',cart_item_id:'ignored'}};
 assert.equal(w.addCatalogItem(entry),true);assert.equal(w.addCatalogItem({...entry,personalization:{text:'A',cart_item_id:'different'}}),true);assert.equal(w.testCart().length,1);assert.equal(w.testCart()[0].quantity,2);
 assert.equal(w.addCatalogItem({...entry,size:'60 cm'}),true);assert.equal(w.testCart().length,2);assert.equal(w.addCatalogItem({...entry,personalization:{text:'B'}}),false);
 frugo.stock=null;assert.equal(w.addCatalogItem({...entry,personalization:{text:'B'}}),true);assert.equal(w.testCart().length,3);
 assert.equal(w.addCatalogItem({...entry,colorSelections:[{...entry.colorSelections[0],color_id:'rot'}]}),true);assert.equal(w.testCart().length,4);
 assert.equal(w.addCatalogItem({...entry,personalization:{id:'photo-one',cart_item_id:'one',text:'A'}}),true);assert.equal(w.addCatalogItem({...entry,personalization:{id:'photo-two',cart_item_id:'two',text:'A'}}),true);assert.equal(w.testCart().length,6);
 assert.equal(w.addCatalogItem({...entry,quantity:10,size:'70 cm'}),true);assert.equal(w.invoiceItems().at(-1).quantity,10);
 // Editor supports arbitrary zones, bilingual labels, individual removal and independent seasons.
 w.OptionsAdmin.load(photo);$('adminAddColorRegion').click();const group=$('adminColorRegions').firstElementChild;group.querySelector('[data-region-de]').value='Haare';group.querySelector('[data-region-fr]').value='Cheveux';group.querySelector('button').click();const color=group.querySelector('.admin-color-row');color.querySelector('[data-color-de]').value='Weiss';color.querySelector('[data-color-fr]').value='Blanc';color.querySelector('[data-color-hex]').value='#ffffff';const edited=w.OptionsAdmin.read();assert.equal(edited.color_regions[0].name_fr,'Cheveux');assert.deepEqual(Array.from(edited.seasons),['valentine']);
 color.querySelector('button').click();assert.throws(()=>w.OptionsAdmin.read());group.querySelector('button:last-child').click();assert.equal(w.OptionsAdmin.read().color_regions.length,0);
 photo.active=false;await w.eval('loadCatalog()');assert.equal(w.document.querySelector('[data-category="wedding"]'),null);assert.equal(w.document.querySelector('[data-category="valentine"]'),null);
 dom.window.close();console.log('PASS options: category visibility/filtering, seasons, DE/FR, Cavallo preview/size/cart, independent Pika colors/static photo, cart snapshots, required private photo/upload failure/retry/text escaping, editor zones/colors/removal.');
}
run().catch(e=>{console.error(e);process.exit(1)});
