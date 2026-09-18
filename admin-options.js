/* Extends the existing authenticated product form; existing RLS remains authoritative. */
(() => {
 const {node,localized,t,validate,categories}=window.ProductOptions;
 const $=id=>document.getElementById(id);
 const host=node('section');host.id='adminProductOptions';
 $('adminColorMode').closest('label').hidden=true;
 $('adminColorMode').closest('label').nextElementSibling.hidden=true;
 $('adminColorMode').closest('label').after(host);
 const categoryLabel=node('label');categoryLabel.append(localized(node('span'),'Kategorie','Catégorie'));const category=node('select');category.id='adminCategory';categoryLabel.append(category);
 const seasonTitle=localized(node('p'),'Saisonale Anlässe (zusätzlich zur Kategorie)','Occasions saisonnières (en plus de la catégorie)');
 const seasons=node('div',undefined,'admin-seasons');
 for(const c of categories.slice(9)){const l=node('label'),input=node('input');input.type='checkbox';input.value=c[0];l.append(input,localized(node('span'),c[1]+' '+c[2],c[1]+' '+c[3]));seasons.append(l);}
 const photoLabel=node('label');photoLabel.append(localized(node('span'),'Kundenfoto','Photo personnelle'));const photo=node('select');photo.id='adminPhotoMode';photoLabel.append(photo);
 for(const [v,de,fr] of [['none','Kein Foto','Aucune photo'],['optional','Foto optional','Photo facultative'],['required','Foto erforderlich','Photo obligatoire']]){const o=localized(node('option'),de,fr);o.value=v;photo.append(o);}
 const textLabel=node('label',undefined,'check'),wish=node('input');wish.type='checkbox';wish.id='adminWishText';textLabel.append(wish,localized(node('span'),'Wunschtext erlauben','Autoriser un texte personnalisé'));
 const title=localized(node('h3'),'Farbbereiche und Farben','Zones et couleurs');
 const help=localized(node('p',undefined,'field-help'),'Keine Farbbereiche = keine Farbauswahl. Namen für Deutsch und Französisch ausfüllen. Änderungen werden mit „Produkt speichern“ übernommen.','Aucune zone = aucun sélecteur de couleur. Renseigne les noms en allemand et en français. Les changements sont appliqués lors de l’enregistrement du produit.');
 const list=node('div');list.id='adminColorRegions';
 const add=localized(node('button'),'Farbbereich hinzufügen','Ajouter une zone');add.type='button';add.id='adminAddColorRegion';add.onclick=()=>region();
 host.append(categoryLabel,seasonTitle,seasons,photoLabel,textLabel,title,help,list,add);
 const input=(parent,de,fr,value='',type='text')=>{const l=node('label');l.append(localized(node('span'),de,fr));const i=node('input');i.type=type;i.value=value;i.maxLength=100;l.append(i);parent.append(l);return i;};
 function color(parent,c={id:crypto.randomUUID(),name_de:'',name_fr:'',hex:'#808080'}){
  const row=node('div',undefined,'admin-color-row');row.dataset.colorId=c.id;
  input(row,'Farbe DE','Couleur DE',c.name_de).dataset.colorDe='';input(row,'Farbe FR','Couleur FR',c.name_fr).dataset.colorFr='';input(row,'Farbfläche','Échantillon',c.hex,'color').dataset.colorHex='';
  const remove=localized(node('button'),'Farbe entfernen','Retirer la couleur');remove.type='button';remove.onclick=()=>row.remove();row.append(remove);parent.append(row);
 }
 function region(r={id:crypto.randomUUID(),name_de:'',name_fr:'',colors:[]}){
  const group=node('div',undefined,'admin-color-region');group.dataset.regionId=r.id;const labels=node('div',undefined,'admin-region-labels');
  input(labels,'Farbbereich DE','Zone DE',r.name_de).dataset.regionDe='';input(labels,'Farbbereich FR','Zone FR',r.name_fr).dataset.regionFr='';group.append(labels);
  const colors=node('div',undefined,'admin-region-colors');for(const c of r.colors)color(colors,c);group.append(colors);
  const add=localized(node('button'),'Farbe hinzufügen','Ajouter une couleur');add.type='button';add.onclick=()=>color(colors);
  const remove=localized(node('button'),'Farbbereich entfernen','Retirer la zone');remove.type='button';remove.onclick=()=>group.remove();group.append(add,remove);list.append(group);
 }
 function load(p={}){
  category.replaceChildren();const none=localized(node('option'),'Keine Kategorie','Aucune catégorie');none.value='';category.append(none);
  for(const c of categories.slice(0,9)){const o=localized(node('option'),c[1]+' '+c[2],c[1]+' '+c[3]);o.value=c[0];category.append(o);}category.value=p.category||'';
  seasons.querySelectorAll('input').forEach(i=>i.checked=(p.seasons||[]).includes(i.value));photo.value=p.photo_mode||'none';wish.checked=p.allow_wish_text===true;list.replaceChildren();for(const r of p.color_regions||[])region(r);
 }
 function read(){
  const rs=[...list.children].map(g=>({id:g.dataset.regionId,name_de:g.querySelector('[data-region-de]').value.trim(),name_fr:g.querySelector('[data-region-fr]').value.trim(),colors:[...g.querySelectorAll('.admin-color-row')].map(c=>({id:c.dataset.colorId,name_de:c.querySelector('[data-color-de]').value.trim(),name_fr:c.querySelector('[data-color-fr]').value.trim(),hex:c.querySelector('[data-color-hex]').value}))}));
  validate(rs);return{category:category.value||null,seasons:[...seasons.querySelectorAll('input:checked')].map(i=>i.value),photo_mode:photo.value,allow_wish_text:wish.checked,color_regions:rs};
 }
 window.OptionsAdmin={load,read};load();
})();

/* Product-owned sizes use the same save/RLS path as all other product fields. */
(()=>{
 const {node,localized,t}=ProductOptions,$=id=>document.getElementById(id),base=window.OptionsAdmin;
 const host=node('section');host.id='adminSizes';
 const title=localized(node('h3'),'Angebotene Größen und Preise','Tailles proposées et prix');
 const mode=node('select');mode.id='adminSizeMode';
 for(const [id,de,fr] of [['options','Mehrere Größen','Plusieurs tailles'],['fixed','Feste Größe','Taille fixe']]){const o=localized(node('option'),de,fr);o.value=id;mode.append(o);}
 const modeLabel=node('label');modeLabel.append(localized(node('span'),'Größenangebot','Tailles proposées'),mode);
 const help=localized(node('p',undefined,'field-help'),'Nur diese Größen sind bestellbar. Namen in DE/FR und Preise in CHF angeben. Ohne Größen ist das Produkt nicht bestellbar.','Seules ces tailles peuvent être commandées. Indique les noms DE/FR et les prix en CHF. Sans taille, le produit ne peut pas être commandé.');
 const list=node('div');list.id='adminSizeList';
 const add=localized(node('button'),'Größe hinzufügen','Ajouter une taille');add.type='button';add.id='adminAddSize';
 host.append(title,modeLabel,help,list,add);$('adminPrice50').closest('label').before(host);
 let product={},original='';
 function row(value={id:crypto.randomUUID(),name_de:'',name_fr:'',price:''}){
  const box=node('div',undefined,'admin-size-row');box.dataset.sizeId=value.id;
  for(const [key,de,fr] of [['name_de','Größe DE','Taille DE'],['name_fr','Größe FR','Taille FR'],['price','Preis CHF','Prix CHF']]){
   const label=node('label'),input=node('input');label.append(localized(node('span'),de,fr));input.dataset.sizeField=key;input.value=value[key];input.required=true;
   if(key==='price'){input.type='number';input.min='0.01';input.step='0.01';}else input.maxLength=100;
   label.append(input);box.append(label);
  }
  const remove=localized(node('button'),'Größe entfernen','Retirer la taille');remove.type='button';remove.onclick=()=>{box.remove();add.disabled=mode.value==='fixed'&&list.children.length>0;};box.append(remove);list.append(box);
 }
 function values(){return [...list.children].map(el=>Object.fromEntries([['id',el.dataset.sizeId],...[...el.querySelectorAll('input')].map(i=>[i.dataset.sizeField,i.dataset.sizeField==='price'?Number(i.value):i.value.trim()]) ]));}
 add.onclick=()=>{row(mode.value==='fixed'?{id:'fixed',name_de:'Feste Grösse',name_fr:'Taille fixe',price:''}:undefined);add.disabled=mode.value==='fixed';};
 mode.onchange=()=>{
  if(mode.value==='fixed'){
   if(list.children.length>1&&!confirm(t('Nur die erste Größe als feste Größe behalten?','Conserver uniquement la première taille comme taille fixe ?'))){mode.value='options';return;}
   const first=values()[0]||{name_de:'Feste Grösse',name_fr:'Taille fixe',price:''};list.replaceChildren();row({...first,id:'fixed'});
  }else if(list.firstChild?.dataset.sizeId==='fixed')list.firstChild.dataset.sizeId=crypto.randomUUID();
  add.disabled=mode.value==='fixed'&&list.children.length>0;
 };
 function load(p={}){
  base.load(p);product=p;
  for(const id of ['50','60','70'])$('adminPrice'+id).closest('label').hidden=p.id!==3||id!=='50';
  host.hidden=p.id===3;host.querySelectorAll('input,select,button').forEach(el=>el.disabled=p.id===3);
  list.replaceChildren();const opts=ProductSizes.options(p);opts.forEach(row);
  mode.value=opts.length===1&&opts[0].id==='fixed'?'fixed':'options';add.disabled=p.id===3||(mode.value==='fixed'&&opts.length>0);mode.disabled=p.id===3;
  original=JSON.stringify(values());
 }
 function read(){
  const data=base.read();if(product.id===3)return {...data,size_options:null};
  const options=values(),ids=new Set();
  for(const o of options){if(!/^[a-z0-9_-]{1,64}$/.test(o.id)||ids.has(o.id)||!o.name_de||!o.name_fr||o.name_de.length>100||o.name_fr.length>100||!Number.isFinite(o.price)||o.price<=0||o.price>100000||Math.abs(o.price*100-Math.round(o.price*100))>1e-7)throw new Error(t('Bitte gültige Größen, DE/FR-Namen und CHF-Preise mit höchstens zwei Nachkommastellen eingeben.','Indique des tailles, des noms DE/FR et des prix CHF valides, avec deux décimales au maximum.'));ids.add(o.id);}
  return {...data,size_options:product.size_options==null&&JSON.stringify(options)===original?null:options};
 }
 window.OptionsAdmin={load,read};load();
})();
