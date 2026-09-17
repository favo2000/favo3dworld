const {JSDOM}=require('jsdom');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
async function boot(language){
 const dom=new JSDOM(read('index.html'),{url:'https://shop.example.test',runScripts:'outside-only'}),w=dom.window;
 Object.defineProperty(w,'crypto',{value:webcrypto});w.alert=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
 if(language)w.localStorage.setItem('favoLang',language);
 const rows=[{id:15,name:'FIRE',active:true,description_de:'Deutscher Produkttext',description_fr:'Description française',stock:null,price_50:12,price_60:10,price_70:null,category:'gifts',seasons:['valentine'],photo_mode:'required',allow_wish_text:true,color_regions:[{id:'primary',name_de:'Ganzes Modell',name_fr:'Modèle entier',colors:[{id:'red',name_de:'Rot',name_fr:'Rouge',hex:'#ff0000'}]}]}];
 w.fetch=async()=>({ok:true,json:async()=>rows});w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};
 const inline=[...w.document.querySelectorAll('script:not([src])')].map(s=>s.textContent).join('\n');
 w.eval(read('supabase-config.js')+'\n'+inline+'\n'+read('product-options.js')+'\n'+read('products.js')+'\n'+read('checkout.js'));
 await new Promise(r=>setTimeout(r,30));return {dom,w,$:id=>w.document.getElementById(id)};
}
(async()=>{
 let {dom,w,$}=await boot('fr');
 assert.equal(w.document.documentElement.lang,'fr');assert.equal($('langFR').getAttribute('aria-pressed'),'true');
 assert.equal($('langFR').closest('.nav'),null);assert.ok($('langFR').closest('.shop-navigation'));
 assert.match(w.document.querySelector('.hero h1').textContent,/Impression/);
 assert.match(w.document.querySelector('.catalog-description').textContent,/Description française/);
 assert.match(w.document.querySelector('[data-category="valentine"]').textContent,/Saint-Valentin/);
 w.document.querySelector('[data-catalog-id="15"] button').click();
 assert.match($('simpleModal').textContent,/Modèle entier/);assert.match($('simpleModal').textContent,/Rouge/);assert.match($('simpleModal').textContent,/Quantité/);assert.match($('simpleModal').textContent,/Ta photo \(obligatoire\)/);
 const text=$('simpleModal').querySelector('[data-wish-text]');text.value='Texte inchangé';text.dispatchEvent(new w.Event('input'));
 $('simpleAdd').click();await new Promise(r=>setTimeout(r,0));assert.match($('simpleModal').textContent,/Choisis d’abord une photo/);
 $('langDE').click();assert.match($('simpleModal').textContent,/Bitte zuerst ein Foto/);assert.match($('simpleModal').textContent,/Ganzes Modell/);assert.match($('simpleModal').textContent,/Menge/);assert.equal(text.value,'Texte inchangé');
 $('langFR').click();assert.match($('simpleModal').textContent,/Choisis d’abord une photo/);assert.equal(text.value,'Texte inchangé');
 $('simpleSize').value='custom';$('simpleSize').dispatchEvent(new w.Event('change'));assert.equal($('simplePrice').textContent,'Prix sur demande');
 let question='';w.prompt=s=>{question=s;return null;};$('simpleRequest').click();assert.match(question,/Quelle hauteur/);
 $('langDE').click();$('simpleRequest').click();assert.match(question,/Welche Höhe/);
 $('langFR').click();$('placeOrder').click();assert.match($('orderStatus').textContent,/panier est vide/);$('langDE').click();assert.match($('orderStatus').textContent,/Warenkorb ist leer/);
 const saved=w.localStorage.getItem('favoLang');dom.window.close();
 ({dom,w,$}=await boot(saved));assert.equal(w.document.documentElement.lang,'de');assert.equal($('langDE').getAttribute('aria-pressed'),'true');assert.match(w.document.querySelector('.catalog-description').textContent,/Deutscher Produkttext/);dom.window.close();
 console.log('PASS language: saved DE/FR, pinned switch structure, database translations, categories, colors, quantities, photo/text labels, validation/status switching, custom size, checkout and preserved input.');
})().catch(e=>{console.error(e);process.exit(1)});
