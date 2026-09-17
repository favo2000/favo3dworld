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
