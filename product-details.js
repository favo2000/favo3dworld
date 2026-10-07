/* Presentation only. Product choices and cart submission stay in ProductOptions. */
(() => {
 'use strict';
 const prefixes={1:'horse',2:'hoodie',4:'zen',5:'pika'};
 const states=new Map();
 const t=(de,fr)=>document.documentElement.lang==='fr'?fr:de;
 const node=(tag,cls)=>{const n=document.createElement(tag);if(cls)n.className=cls;return n;};
 // Additional views reuse existing product photographs. Crops are explicitly
 // labelled details; they do not claim to show a different product or angle.
 function photos(p,src){
  const list=[{src,de:'Gesamtansicht',fr:'Vue d’ensemble'}];
  if(p.id===4&&new URL(src,document.baseURI).pathname.endsWith('/assets/zen-real.jpg')){
   list.push({src,de:'Seitenansicht',fr:'Vue de profil',crop:{x:0,y:.33,w:.266,h:.333}},
    {src,de:'Vorderansicht',fr:'Vue de face',crop:{x:0,y:.67,w:.266,h:.33}});
  }else if(p.id===1||ProductSizes.options(p).length>1){
   list.push({src,de:'Detail des Produktfotos',fr:'Détail de la photo',crop:{x:.2,y:.08,w:.6,h:.6}});
  }
  return list;
 }
 function drawPhoto(s){
  const view=s.photos[s.selected]||s.photos[0],img=s.image;
  img.src=view.src;img.alt=s.p.name+' — '+t(view.de,view.fr);
  s.frame.classList.toggle('is-detail-crop',!!view.crop);
  for(const prop of ['width','height','left','top','maxWidth'])img.style[prop]='';
  s.frame.style.aspectRatio='';
  if(view.crop){
   const apply=()=>{if(!img.naturalWidth||!img.naturalHeight)return;const c=view.crop;
    s.frame.style.aspectRatio=(img.naturalWidth*c.w)/(img.naturalHeight*c.h);
    img.style.width=(100/c.w)+'%';img.style.height='auto';img.style.maxWidth='none';
    img.style.left=(-c.x/c.w*100)+'%';img.style.top=(-c.y/c.h*100)+'%';
   };img.onload=apply;apply();
  }else img.onload=null;
  s.caption.textContent=t(view.de,view.fr);
  s.thumbs.querySelectorAll('button').forEach((b,i)=>{
   b.setAttribute('aria-pressed',String(i===s.selected));
   b.setAttribute('aria-label',t('Bild anzeigen: ','Afficher : ')+t(s.photos[i].de,s.photos[i].fr));
  });
 }
 function sync(p,src){
  const s=states.get(prefixes[p.id]||'simple');if(!s||s.p.id!==p.id)return;
  s.p=p;
  s.description.textContent=t(p.description_de||p.description_fr||'',p.description_fr||p.description_de||'');
  s.description.hidden=!s.description.textContent;
  s.eyebrow.textContent=t('PRODUKTDETAILS','DÉTAILS DU PRODUIT');
  s.availability.textContent=catalogOnDemand(p)?t('Auf Bestellung','Sur commande'):Number(p.stock)>0?t('Auf Lager · ','En stock · ')+p.stock:t('Ausverkauft','Épuisé');
  const select=s.modal.querySelector('select[id$="Size"]');
  const option=ProductSizes.options(p).find(o=>o.id===ProductSizes.selected(select));
  s.price.textContent=option?'CHF '+Number(option.price).toFixed(2):t('Preis auf Anfrage','Prix sur demande');
  s.modal.querySelectorAll('.x').forEach(b=>b.setAttribute('aria-label',t('Produktdetails schliessen','Fermer les détails du produit')));
  s.thumbs.setAttribute('aria-label',t('Produktbilder','Photos du produit'));
  s.galleryHelp.textContent=t('Wähle ein Bild, um es grösser anzusehen.','Choisis une image pour l’agrandir.');
  drawPhoto(s);
 }
 function mount(p,src){
  const prefix=prefixes[p.id]||'simple',modal=document.getElementById(prefix+'Modal');
  if(!modal)return;
  let s=states.get(prefix);
  if(!s){
   const options=modal.querySelector('.horse-options'),preview=modal.querySelector('.horse-preview'),image=preview.querySelector('img');
   modal.classList.add('product-detail-modal');modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');
   const heading=options.querySelector('h2');heading.id=prefix+'DetailHeading';heading.tabIndex=-1;modal.setAttribute('aria-labelledby',heading.id);
   const description=node('p','product-detail-description');heading.after(description);
   const price=node('p','product-detail-price');description.before(price);
   const availability=node('span','product-detail-availability');price.after(availability);
   const frame=node('div','product-detail-photo');image.before(frame);frame.append(image);
   const caption=node('p','product-photo-caption');caption.setAttribute('aria-live','polite');
   const thumbs=node('div','product-photo-thumbnails');thumbs.setAttribute('role','group');
   const galleryHelp=node('p','product-gallery-help');preview.append(caption,thumbs,galleryHelp);
   s={modal,description,price,availability,eyebrow:options.querySelector('.eyebrow'),image,frame,caption,thumbs,galleryHelp,selected:0};states.set(prefix,s);
   let opener=null,wasOpen=false,previousOverflow='';
   const observer=new MutationObserver(()=>{
    const open=modal.classList.contains('open');if(open===wasOpen)return;wasOpen=open;
    if(open){opener=document.activeElement;previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';heading.focus();}
    else{document.body.style.overflow=previousOverflow;if(!document.querySelector('#cartDrawer.open'))opener?.focus?.();}
   });observer.observe(modal,{attributes:true,attributeFilter:['class']});
   modal.addEventListener('keydown',e=>{
    if(!modal.classList.contains('open'))return;
    if(e.key==='Escape'){e.preventDefault();modal.classList.remove('open');}
    if(e.key==='Tab'){
     const focusable=[...modal.querySelectorAll('button:not(:disabled),select:not(:disabled),input:not(:disabled),textarea:not(:disabled),a[href]')].filter(n=>!n.hidden&&n.getClientRects().length);
     const first=focusable[0],last=focusable.at(-1);if(!first)return;
     if(e.shiftKey&&(document.activeElement===first||document.activeElement===heading)){e.preventDefault();last.focus();}
     else if(!e.shiftKey&&(document.activeElement===last||document.activeElement===heading)){e.preventDefault();first.focus();}
    }
   });
  }
  s.p=p;s.selected=0;s.photos=photos(p,src);s.thumbs.replaceChildren();
  s.photos.forEach((view,i)=>{
   const b=node('button');b.type='button';const thumbnail=node('img');thumbnail.src=view.src;thumbnail.alt='';thumbnail.loading='lazy';
   b.append(thumbnail);b.onclick=()=>{s.selected=i;drawPhoto(s);};s.thumbs.append(b);
  });
  s.thumbs.hidden=s.photos.length<2;s.galleryHelp.hidden=s.photos.length<2;
  const sizeLabel=modal.querySelector('.select-label'),fields=modal.querySelector('.product-option-fields');
  if(fields)fields.before(sizeLabel);
  sync(p,src);
 }
 window.ProductDetails={mount,sync};
})();
