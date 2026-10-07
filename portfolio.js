/* Portfolio is independent of the product catalogue and cart. Public reads only. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id),config=window.FAVO_SUPABASE;
 const copy={
  nav:['Meine Arbeiten','Mes réalisations'],eyebrow:['AUS MEINER WERKSTATT','DANS MON ATELIER'],heading:['Meine Arbeiten','Mes réalisations'],
  intro:['Einblicke in meine 3D-Druck-Projekte: besondere Modelle, Einzelstücke und persönliche Arbeiten.','Un aperçu de mes projets d’impression 3D : modèles particuliers, pièces uniques et créations personnelles.'],
  notice:['Einzelprojekte · nicht zum Verkauf','Projets uniques · pas à vendre'],loading:['Die Galerie wird geladen …','Chargement de la galerie…'],
  empty:['Hier zeige ich bald ausgewählte Arbeiten aus meiner Werkstatt.','Je présenterai bientôt ici une sélection de créations de mon atelier.'],
  error:['Die Galerie konnte nicht geladen werden. Bitte versuche es später erneut.','La galerie n’a pas pu être chargée. Merci de réessayer plus tard.'],
  all:['Alle Arbeiten ansehen','Voir toutes les réalisations'],less:['Weniger anzeigen','Afficher moins'],manage:['Galerie verwalten','Gérer la galerie'],
  open:['Arbeit ansehen','Voir la réalisation'],close:['Galerie schliessen','Fermer la galerie'],previous:['Vorheriges Foto','Photo précédente'],next:['Nächstes Foto','Photo suivante'],
  photo:['Foto','Photo'],unavailable:['Foto momentan nicht verfügbar.','Photo momentanément indisponible.']
 };
 const t=key=>copy[key][document.documentElement.lang==='fr'?1:0];
 const description=p=>document.documentElement.lang==='fr'?(p.description_fr||p.description_de):(p.description_de||p.description_fr);
 const validPath=p=>typeof p==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/.test(p);
 const imageURL=path=>validPath(path)?config.url+'/storage/v1/object/public/portfolio-images/'+path:'';
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 let projects=[],expanded=false,state='loading',selected=null,photoIndex=0,opener=null,request=0;
 const dialog=el('dialog','portfolio-dialog');dialog.id='portfolioDialog';dialog.setAttribute('aria-labelledby','portfolioDialogHeading');
 const close=el('button','portfolio-close','×');close.type='button';
 const visual=el('div','portfolio-viewer'),image=el('img'),imageStatus=el('p','portfolio-image-status'),controls=el('div','portfolio-photo-controls');
 const previous=el('button','btn secondary','←'),counter=el('span'),next=el('button','btn secondary','→');previous.type=next.type='button';controls.append(previous,counter,next);
 const thumbs=el('div','portfolio-thumbnails'),details=el('div','portfolio-details'),eyebrow=el('span','eyebrow'),heading=el('h2');heading.id='portfolioDialogHeading';
 const note=el('p','portfolio-label'),fullDescription=el('p','portfolio-description');details.append(eyebrow,heading,note,fullDescription);visual.append(image,imageStatus,controls,thumbs);dialog.append(close,visual,details);document.body.append(dialog);
 function drawPhoto(){
  if(!selected)return;
  imageStatus.hidden=true;image.hidden=false;image.src=imageURL(selected.image_paths[photoIndex]);image.alt=selected.name+' — '+t('photo')+' '+(photoIndex+1);
  counter.textContent=`${photoIndex+1} / ${selected.image_paths.length}`;controls.hidden=selected.image_paths.length<2;thumbs.hidden=selected.image_paths.length<2;
  previous.setAttribute('aria-label',t('previous'));next.setAttribute('aria-label',t('next'));
  thumbs.replaceChildren();selected.image_paths.forEach((path,i)=>{const b=el('button');b.type='button';b.setAttribute('aria-label',t('photo')+' '+(i+1));b.setAttribute('aria-pressed',String(i===photoIndex));
   const img=el('img');img.src=imageURL(path);img.alt='';img.loading='lazy';b.append(img);b.onclick=()=>{photoIndex=i;drawPhoto();};thumbs.append(b);});
 }
 image.onerror=()=>{image.hidden=true;imageStatus.hidden=false;imageStatus.textContent=t('unavailable');};
 function refreshDialog(){if(!selected)return;close.setAttribute('aria-label',t('close'));eyebrow.textContent=t('eyebrow');heading.textContent=selected.name;note.textContent=t('notice');fullDescription.textContent=description(selected)||'';drawPhoto();}
 function open(p,button){selected=p;photoIndex=0;opener=button;refreshDialog();dialog.showModal();document.body.classList.add('portfolio-dialog-open');close.focus();}
 close.onclick=()=>dialog.close();dialog.addEventListener('close',()=>{document.body.classList.remove('portfolio-dialog-open');opener?.focus();selected=null;});
 previous.onclick=()=>{photoIndex=(photoIndex+selected.image_paths.length-1)%selected.image_paths.length;drawPhoto();};
 next.onclick=()=>{photoIndex=(photoIndex+1)%selected.image_paths.length;drawPhoto();};
 dialog.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'){e.preventDefault();previous.click();}if(e.key==='ArrowRight'){e.preventDefault();next.click();}});
 function render(){
  document.querySelectorAll('[data-portfolio-text]').forEach(n=>n.textContent=t(n.dataset.portfolioText));
  const grid=$('portfolioGrid');grid.replaceChildren();
  for(const p of projects.slice(0,expanded?projects.length:3)){
   const card=el('article','portfolio-card'),button=el('button','portfolio-card-open');button.type='button';button.setAttribute('aria-label',t('open')+': '+p.name);
   const photo=el('img');photo.src=imageURL(p.image_paths[0]);photo.alt=p.name;photo.loading='lazy';button.append(photo);
   const body=el('div','portfolio-card-copy'),title=el('h3',null,p.name),summary=el('p','portfolio-card-description',description(p)||''),label=el('span','portfolio-label',t('notice'));
   const action=el('span','portfolio-card-action',t('open')+' →');body.append(label,title,summary,action);button.append(body);button.onclick=()=>open(p,button);card.append(button);grid.append(card);
  }
  $('portfolioEmpty').hidden=projects.length>0;$('portfolioEmpty').textContent=t(state==='loading'?'loading':state==='error'?'error':'empty');
  $('portfolioMore').hidden=projects.length<=3;$('portfolioMore').textContent=t(expanded?'less':'all');refreshDialog();
 }
 async function load(){
  const ticket=++request;state='loading';render();
  try{const r=await fetch(config.url+'/rest/v1/portfolio_projects?select=id,name,description_de,description_fr,image_paths&published=eq.true&order=sort_order.asc,created_at.desc,id.desc',{headers:{apikey:config.publishableKey,Accept:'application/json'}});
   if(!r.ok)throw new Error('Gallery unavailable');const data=await r.json();if(!Array.isArray(data))throw new Error('Invalid gallery');if(ticket!==request)return;
   projects=data.filter(p=>Array.isArray(p.image_paths)&&p.image_paths.length&&p.image_paths.every(validPath));state='ready';
  }catch{if(ticket!==request)return;projects=[];state='error';}render();
 }
 $('portfolioMore').onclick=()=>{expanded=!expanded;render();if(!expanded)$('portfolioHeading').scrollIntoView({block:'start'});};
 $('openPortfolioAdmin').onclick=()=>{$('openAdmin').click();window.PortfolioAdmin?.focus();};
 window.FavoPortfolio={reload:load,refreshLanguage:render,imageURL,validPath};load();
})();
