/* Product-owned options. No model files, public customer-photo URLs or secrets. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 const t=(de,fr)=>document.documentElement.lang==='fr'?fr:de;
 const label=o=>document.documentElement.lang==='fr'?o.name_fr:o.name_de;
 const categories=[
 ['fantasy','🏰','Fantasy & Figuren','Fantasy & figurines'],['decor','⚱️','Deko & Zubehör','Décoration & accessoires'],
 ['animals','🐾','Tiere & Natur','Animaux & nature'],['scifi','🤖','Sci-Fi & Technik','Science-fiction & technologie'],
 ['vehicles','🚗','Fahrzeuge & Modelle','Véhicules & modèles'],['gifts','🎁','Geschenke & Personalisierte','Cadeaux & personnalisation'],
 ['statues','🗿','Büsten & Statuen','Bustes & statues'],['tabletop','⚔️','Wargaming & Tabletop','Wargaming & jeux de figurines'],
 ['wedding','💍','Hochzeit','Mariage'],['christmas','🎄','Weihnachten','Noël'],['easter','🐰','Ostern','Pâques'],
 ['halloween','🎃','Halloween','Halloween'],['valentine','❤️','Valentinstag','Saint-Valentin']];
 const states=new Map();let selectedCategory='',simpleId;
 const special={1:'horse',2:'hoodie',4:'zen',5:'pika'};
 const modalFor=p=>special[p.id]||'simple';
 function node(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
 function localized(n,de,fr){n.dataset.optionDe=de;n.dataset.optionFr=fr;n.textContent=t(de,fr);return n;}
 function categoryName(c){return c[1]+' '+t(c[2],c[3]);}
 function regions(p){return Array.isArray(p.color_regions)?p.color_regions:[];}
 function validate(rs){
  if(!Array.isArray(rs))throw new Error(t('Ungültige Farbbereiche.','Zones de couleur invalides.'));
  const ids=new Set();
  for(const r of rs){
   if(!/^[a-z0-9_-]{1,64}$/.test(r.id)||ids.has(r.id)||!r.name_de?.trim()||!r.name_fr?.trim()||r.name_de.length>100||r.name_fr.length>100||!Array.isArray(r.colors)||!r.colors.length)throw new Error(t('Jeder Farbbereich braucht einen Namen in DE/FR und mindestens eine Farbe.','Chaque zone nécessite un nom DE/FR et au moins une couleur.'));
   ids.add(r.id);const colors=new Set();
   for(const c of r.colors){if(!/^[a-z0-9_-]{1,64}$/.test(c.id)||colors.has(c.id)||!c.name_de?.trim()||!c.name_fr?.trim()||c.name_de.length>100||c.name_fr.length>100||!/^#[0-9a-f]{6}$/i.test(c.hex))throw new Error(t('Jede Farbe braucht einen Namen in DE/FR und eine Farbfläche.','Chaque couleur nécessite un nom DE/FR et un échantillon.'));colors.add(c.id);}
  }
  return rs;
 }
 function categoryRefresh(){
  const rows=typeof catalogProducts==='undefined'?[]:catalogProducts;
  const available=categories.filter(c=>rows.some(p=>p.active&&(p.category===c[0]||(p.seasons||[]).includes(c[0]))));
  if(!available.some(c=>c[0]===selectedCategory))selectedCategory='';
  const grid=document.querySelector('.category-grid');grid.replaceChildren();
  for(const c of available){const b=node('button',categoryName(c));b.type='button';b.dataset.category=c[0];b.setAttribute('aria-pressed',String(c[0]===selectedCategory));b.onclick=()=>{selectedCategory=c[0];categoryRefresh();$('shop').scrollIntoView({behavior:'smooth'});};grid.append(b);}
  $('kategorien').hidden=!available.length;
  document.querySelectorAll('#shop [data-catalog-id]').forEach(card=>{const p=rows.find(x=>String(x.id)===card.dataset.catalogId);card.hidden=!p||!p.active||!!selectedCategory&&p.category!==selectedCategory&&!(p.seasons||[]).includes(selectedCategory);});
  const all=document.querySelector('.all-products button');all.textContent=t('Alle Produkte ansehen','Voir tous les produits');all.onclick=()=>{selectedCategory='';categoryRefresh();};
  $('kategorien').querySelector('h2').textContent=t('Kategorien entdecken →','Découvrir les catégories →');
  document.querySelectorAll('a[href="#kategorien"]').forEach(a=>a.textContent=t('Kategorien','Catégories'));
 }
 function selected(s){return regions(s.p).map(r=>{const c=r.colors.find(c=>c.id===s.choices[r.id]);return{region_id:r.id,region_de:r.name_de,region_fr:r.name_fr,color_id:c?.id,name_de:c?.name_de,name_fr:c?.name_fr,hex:c?.hex};});}
 function describe(item){return (item.colorSelections||[]).map(c=>(document.documentElement.lang==='fr'?c.region_fr:c.region_de)+': '+label(c));}
 function cartDetails(item){
  const escape=escapeCatalogText;
  let lines=item.colorSelections?describe(item):[item.horseLabel,item.baseLabel].filter(Boolean);
  if(item.personalization?.text)lines.push(t('Wunschtext: ','Texte souhaité : ')+item.personalization.text);
  if(item.personalization?.id)lines.push(t('Kundenfoto zugeordnet','Photo personnelle associée'));
  return lines.map(l=>'<small>'+escape(l)+'</small>').join('');
 }
 function sync(id){
  const s=states.get(Number(id));if(!s)return;
  const prefix=modalFor(s.p),modal=$(prefix+'Modal');
  if(s.p.id===1){horse=s.choices.primary||'schwarz';base=s.choices.secondary||'schwarz';horseLabel=regions(s.p).find(r=>r.id==='primary')?.colors.find(c=>c.id===horse)?.name_de||'';baseLabel=regions(s.p).find(r=>r.id==='secondary')?.colors.find(c=>c.id===base)?.name_de||'';}
  const summary=$(prefix+'Summary'),chosen=$(prefix==='horse'?'chosenPreview':prefix+'Chosen');
  const sel=$(prefix+'Size');let size=s.p.id===3?t('Feste Grösse','Taille fixe'):sel.value==='custom'?t('Andere Grösse','Autre taille'):(prefix==='simple'?['50','60','70'][Number(sel.value)]:sel.value)+' cm';
  const text=[...describe({colorSelections:selected(s)}),size].join(' · ');
  if(summary)summary.textContent=text;if(chosen)chosen.textContent=text;
  const image=modal.querySelector('.horse-preview img');
  image.src=s.image;
  image.onerror=()=>{image.onerror=null;image.src=s.image;};
  modal.querySelector('h2').textContent=s.p.name;
  let help=modal.querySelector('.horse-options > p');if(!help){help=node('p');modal.querySelector('.horse-options h2').after(help);}help.textContent=t('Wähle die verfügbaren Optionen. Das Foto zeigt ein Beispielmodell.','Choisis les options disponibles. La photo montre un exemple du modèle.');
 }
 function paint(s){
  const host=s.host;host.querySelector('.product-color-regions').replaceChildren();
  for(const r of regions(s.p)){
   const group=node('fieldset',undefined,'product-color-region'),legend=node('legend',label(r));group.append(legend);
   const buttons=node('div',undefined,'product-color-choices');
   for(const c of r.colors){const b=node('button',undefined,'product-color-choice');b.type='button';b.dataset.colorId=c.id;b.dataset.regionId=r.id;b.setAttribute('aria-pressed',String(s.choices[r.id]===c.id));const chip=node('span',undefined,'color-chip');chip.style.backgroundColor=c.hex;chip.setAttribute('aria-hidden','true');b.append(chip,node('span',label(c)));b.onclick=()=>{s.choices[r.id]=c.id;paint(s);sync(s.p.id);};buttons.append(b);}
   group.append(buttons);host.querySelector('.product-color-regions').append(group);
  }
 }
 function mount(p,image){
  const prefix=modalFor(p);if(prefix==='simple')simpleId=p.id;
  let s=states.get(p.id);if(!s){s={p,choices:{},file:null,photo:null,preview:null,cartId:crypto.randomUUID()};states.set(p.id,s);}s.p=p;s.image=image;
  for(const r of regions(p)){if(!r.colors.some(c=>c.id===s.choices[r.id]))s.choices[r.id]=r.colors[0]?.id;}
  const modal=$(prefix+'Modal');
  if(prefix==='simple'){$('simpleSize').querySelector('[value="custom"]').hidden=p.id===3;if(p.id===3)$('simpleSize').options[0].textContent=t('Feste Grösse','Taille fixe')+' — CHF '+Number(p.price_50).toFixed(2);}
  modal.querySelectorAll('.horse-options .option').forEach(n=>n.hidden=true);
  modal.querySelector('.product-option-fields')?.remove();
  const host=node('div',undefined,'product-option-fields');host.dataset.productId=p.id;host.append(node('div',undefined,'product-color-regions'));s.host=host;
  const first=modal.querySelector('.select-label');first.before(host);
  if(p.photo_mode&&p.photo_mode!=='none'){
   const l=node('label');l.append(localized(node('span'),p.photo_mode==='required'?'Dein Foto (erforderlich)':'Dein Foto (optional)',p.photo_mode==='required'?'Ta photo (obligatoire)':'Ta photo (facultative)'));
   const input=node('input');input.type='file';input.accept='image/jpeg,image/png,image/webp';input.dataset.customerPhoto='';input.hidden=true;
   const choose=localized(node('button'),'Foto auswählen','Choisir une photo');choose.type='button';choose.onclick=()=>input.click();
   const help=localized(node('p',undefined,'field-help'),'JPG, PNG oder WebP bis 5 MB. Dein Foto wird privat gespeichert und nur zur Bearbeitung deines Artikels verwendet. Nicht abgesendete Uploads laufen nach 7 Tagen ab und werden beim nächsten Upload bereinigt.','JPG, PNG ou WebP, 5 Mo maximum. Ta photo est conservée en privé et utilisée uniquement pour préparer ton article. Les fichiers non envoyés expirent après 7 jours et sont supprimés lors d’un prochain envoi.');
   const status=node('p',s.file?s.file.name:'','photo-selection');
   input.onchange=()=>{const file=input.files[0];if(file&&(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5242880)){input.value='';localized(status,'Bitte JPG, PNG oder WebP bis 5 MB wählen.','Choisis un JPG, PNG ou WebP de 5 Mo maximum.');return;}if(s.preview)URL.revokeObjectURL(s.preview);s.file=file||null;s.photo=null;s.preview=file?URL.createObjectURL(file):null;localized(status,file?.name||'',file?.name||'');};
   l.append(choose,input);host.append(l,help,status);
   const remove=localized(node('button'),'Foto entfernen','Retirer la photo');remove.type='button';remove.onclick=()=>{input.value='';if(s.preview)URL.revokeObjectURL(s.preview);s.file=null;s.photo=null;s.preview=null;localized(status,'','');};host.append(remove);
  }
  if(p.allow_wish_text){const l=node('label');l.append(localized(node('span'),'Wunschtext / Bemerkungen','Texte souhaité / remarques'));const a=node('textarea');a.maxLength=2000;a.rows=3;a.value=s.text||'';a.dataset.wishText='';a.oninput=()=>s.text=a.value;l.append(a);host.append(l);}
  s.quantity=s.quantity||1;
  const quantity=node('div',undefined,'quantity-control');
  quantity.append(localized(node('span'),'Menge','Quantité'));
  const minus=node('button','−'),value=node('output',String(s.quantity)),plus=node('button','+');
  minus.type=plus.type='button';minus.setAttribute('aria-label',t('Menge verringern','Diminuer la quantité'));plus.setAttribute('aria-label',t('Menge erhöhen','Augmenter la quantité'));
  const subtotal=node('span');
  const update=()=>{value.textContent=s.quantity;minus.disabled=s.quantity<=1;plus.disabled=s.quantity>=20||(!catalogOnDemand(p)&&s.quantity+cartProductQuantity(p.id)>=Number(p.stock));const select=$(prefix+'Size');const size=p.id===3?'50':prefix==='simple'?['50','60','70'][Number(select.value)]:select.value;const price=catalogPrice(p,size);subtotal.textContent=price===null?'':t('Positionssumme: ','Sous-total : ')+'CHF '+(price*s.quantity).toFixed(2);};
  minus.onclick=()=>{if(s.quantity>1)s.quantity--;update();};plus.onclick=()=>{if(s.quantity<20&&(catalogOnDemand(p)||s.quantity+cartProductQuantity(p.id)<Number(p.stock)))s.quantity++;update();};
  quantity.append(minus,value,plus,subtotal);host.append(quantity);s.updateQuantity=update;update();
  host.append(localized(node('small'),'Maximal 20 Exemplare je Auswahl.','20 exemplaires maximum par configuration.'));
  if(catalogOnDemand(p)){
   const bulk=localized(node('button'),'Mehr als 20 Stück anfragen','Demander plus de 20 pièces');bulk.type='button';bulk.className='btn secondary wide';
   bulk.onclick=()=>{const sel=$(prefix+'Size');if(sel.value==='custom'){localized(host.querySelector('.product-option-status'),'Bitte zuerst eine verfügbare Größe wählen.','Choisis d’abord une taille disponible.');return;}
    const size=p.id===3?'fixed':prefix==='simple'?['50','60','70'][Number(sel.value)]:sel.value;
    window.BulkInquiry.open({product_id:p.id,size,colors:Object.fromEntries(selected(s).map(c=>[c.region_id,c.color_id])),personalization:{text:s.text||''}},p.name,()=>modal.classList.add('open'));modal.classList.remove('open');};host.append(bulk);
  }
  host.append(node('p','','product-option-status'));paint(s);sync(p.id);
 }
 async function add(id){
  const s=states.get(Number(id));if(!s||s.busy)return;
  const prefix=modalFor(s.p),sel=$(prefix+'Size'),button=$(prefix+'Add'),status=s.host.querySelector('.product-option-status');
  if(sel.value==='custom')return;
  const size=s.p.id===3?'Feste Grösse':(prefix==='simple'?['50','60','70'][Number(sel.value)]:sel.value)+' cm';
  if(s.p.photo_mode==='required'&&!s.file){localized(status,'Bitte zuerst ein Foto auswählen.','Choisis d’abord une photo.');return;}
  if(selected(s).some(c=>!c.color_id)){localized(status,'Bitte alle Farben auswählen.','Choisis toutes les couleurs.');return;}
  s.busy=true;button.disabled=true;sel.disabled=true;
  const inputs=[...s.host.querySelectorAll('input,textarea,button')];inputs.forEach(i=>i.disabled=true);
  const selections=selected(s),wishText=s.p.allow_wish_text?(s.text||'').trim():'';
  try{
   if(s.file&&!s.photo){localized(status,'Foto wird privat hochgeladen …','Envoi privé de la photo …');const c=window.FAVO_SUPABASE;const url=new URL(c.url+'/functions/v1/customer-photo');url.searchParams.set('product_id',s.p.id);url.searchParams.set('cart_item_id',s.cartId);
    const response=await fetch(url,{method:'POST',headers:{apikey:c.publishableKey,'Content-Type':s.file.type},body:s.file,signal:AbortSignal.timeout(45000)});const data=await response.json();if(!response.ok||!data.id||!data.token)throw new Error(t('Foto-Upload fehlgeschlagen. Bitte erneut versuchen.','Échec de l’envoi de la photo. Réessaie.'));s.photo={id:data.id,token:data.token};
   }
   const entry={productId:s.p.id,name:s.p.name,size,image:s.image,quantity:s.quantity,colorSelections:selections,cartItemId:s.cartId,personalization:{...(s.photo||{}),cart_item_id:s.cartId,text:wishText}};
   if(!addCatalogItem(entry))return;
   // Cart metadata is copied, never shared with a later selection.
   s.quantity=1;s.file=null;s.photo=null;s.text='';s.cartId=crypto.randomUUID();if(s.preview){URL.revokeObjectURL(s.preview);s.preview=null;}
   $(prefix+'Modal').classList.remove('open');renderCart();$('cartDrawer').classList.add('open');mount(s.p,s.image);
  }catch(e){localized(status,'Foto-Upload fehlgeschlagen. Bitte erneut versuchen.','Échec de l’envoi de la photo. Réessaie.');}finally{s.busy=false;button.disabled=false;sel.disabled=false;inputs.forEach(i=>i.disabled=false);}
 }
 document.addEventListener('click',event=>{
  if(event.target.closest('#openHorseConfig,#openHoodieConfig,#openZenConfig,#openPikaConfig'))for(const s of states.values())s.updateQuantity?.();
  const b=event.target.closest('#horseAdd,#hoodieAdd,#zenAdd,#pikaAdd,#simpleAdd');if(!b)return;
  const id={horseAdd:1,hoodieAdd:2,zenAdd:4,pikaAdd:5,simpleAdd:simpleId}[b.id];if(!states.has(Number(id)))return;
  event.preventDefault();event.stopImmediatePropagation();if(typeof pendingInvoice!=='undefined'&&pendingInvoice)return;add(id);
 },true);
 document.addEventListener('change',event=>{if(event.target.matches('select[id$="Size"]'))for(const s of states.values())s.updateQuantity?.();});
 function refresh(){
  document.querySelectorAll('[data-option-de]').forEach(n=>n.textContent=t(n.dataset.optionDe,n.dataset.optionFr));
  document.querySelectorAll('.product-option-fields .quantity-control').forEach(n=>{const buttons=n.querySelectorAll('button');buttons[0]?.setAttribute('aria-label',t('Menge verringern','Diminuer la quantité'));buttons[1]?.setAttribute('aria-label',t('Menge erhöhen','Augmenter la quantité'));});
  for(const s of states.values()){if(s.host?.isConnected){paint(s);sync(s.p.id);s.updateQuantity?.();const sel=$(modalFor(s.p)+'Size');if(s.p.id===3)sel.options[0].textContent=t('Feste Grösse','Taille fixe')+' — CHF '+Number(s.p.price_50).toFixed(2);}}
  categoryRefresh();if(typeof renderCart==='function')renderCart();
  const h=document.querySelector('.hero h1'),p=document.querySelector('.hero-copy > p');h.textContent=t('3D-Druck mit Leidenschaft.','Impression 3D avec passion.');p.textContent=t('Entdecke unsere fertig gedruckten 3D-Modelle. Wähle bei vielen Produkten deine Wunschfarbe und Größe – wir fertigen dein Modell für dich an.','Découvre nos modèles imprimés en 3D. Pour de nombreux produits, choisis ta couleur et ta taille préférées : nous fabriquons ton modèle pour toi.');
  $('qualityTitle').textContent=t('❤️ Mit Liebe gefertigt','❤️ Fabriqué avec amour');$('qualityText').textContent=t('Jedes Modell wird sorgfältig für dich gedruckt.','Chaque modèle est imprimé avec soin pour toi.');
 }
 window.ProductOptions={categories,t,label,node,localized,validate,mount,sync,refresh,cartDetails,describe,categoryRefresh};
})();
