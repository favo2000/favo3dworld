/* Uses the existing admin session, with separate portfolio table and bucket. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 let client,allowed=false,busy=false,editing=null,paths=[],previewURLs=[],generation=0,rows=[];
 const status=(message,error=false)=>{$('portfolioAdminStatus').textContent=message;$('portfolioAdminStatus').dataset.error=String(error);};
 const lock=value=>{busy=value;$('portfolioAdminFields').disabled=value;$('portfolioReload').disabled=value;$('portfolioAdminList').querySelectorAll('button').forEach(b=>b.disabled=value);};
 const element=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 function clearPreviews(){previewURLs.forEach(url=>URL.revokeObjectURL(url));previewURLs=[];}
 function files(){return [...$('portfolioFiles').files];}
 function validate(selected){
  if(paths.length+selected.length>12)throw new Error('Maximal 12 Fotos pro Arbeit.');
  if(selected.some(f=>!['image/jpeg','image/png','image/webp'].includes(f.type)||f.size>5*1024*1024||f.size===0))throw new Error('Bitte JPG, PNG oder WebP bis 5 MB je Foto auswählen.');
 }
 function drawPhotos(){
  clearPreviews();const target=$('portfolioAdminPhotos');target.replaceChildren();
  paths.forEach((path,i)=>{const item=element('div');item.className='portfolio-admin-photo';const img=element('img');img.src=window.FavoPortfolio.imageURL(path);img.alt='Galeriefoto '+(i+1);
   const remove=element('button','Aus Arbeit entfernen');remove.type='button';remove.onclick=()=>{paths.splice(i,1);drawPhotos();};
   const first=element('button',i===0?'Titelbild':'Als Titelbild');first.type='button';first.disabled=i===0;first.onclick=()=>{paths.unshift(paths.splice(i,1)[0]);drawPhotos();};
   const earlier=element('button','← Foto nach vorne'),later=element('button','Foto nach hinten →');earlier.type=later.type='button';earlier.disabled=i===0;later.disabled=i===paths.length-1;
   const move=step=>{[paths[i],paths[i+step]]=[paths[i+step],paths[i]];drawPhotos();};earlier.onclick=()=>move(-1);later.onclick=()=>move(1);
   item.append(img,first,earlier,later,remove);target.append(item);});
  files().forEach(file=>{const item=element('div');item.className='portfolio-admin-photo portfolio-admin-preview';const img=element('img');const url=URL.createObjectURL(file);previewURLs.push(url);img.src=url;img.alt='Neues Foto: '+file.name;item.append(img,element('span',file.name+' · neu'));target.append(item);});
 }
 function reset(){editing=null;paths=[];$('portfolioAdminForm').reset();$('portfolioEditHeading').textContent='Neue Arbeit';drawPhotos();}
 function edit(p){reset();editing=p.id;paths=[...p.image_paths];$('portfolioName').value=p.name;$('portfolioDescriptionDe').value=p.description_de;$('portfolioDescriptionFr').value=p.description_fr||'';$('portfolioPublished').checked=p.published;$('portfolioPosition').value=p.sort_order??1000;$('portfolioEditHeading').textContent='Arbeit bearbeiten';drawPhotos();$('portfolioName').focus();}
 async function requireAdmin(){
  if(!allowed||!client)throw new Error('Bitte als Admin anmelden.');
  const {data,error}=await client.auth.getUser();if(error||!data.user)throw new Error('Bitte erneut anmelden.');
  const check=await client.rpc('is_favo_admin');if(check.error||check.data!==true)throw new Error('Keine Admin-Berechtigung.');
 }
 function render(){const list=$('portfolioAdminList');list.replaceChildren();for(const p of rows){const row=element('div');row.className='admin-product';const title=element('b',p.name),note=element('p',(p.published?'Veröffentlicht':'Entwurf')+' · '+p.image_paths.length+' Fotos · Position '+p.sort_order),button=element('button','Arbeit bearbeiten');button.type='button';button.onclick=()=>{if(!busy)edit(p);};row.append(title,note,button);list.append(row);}if(!rows.length)list.append(element('p','Noch keine Arbeiten. Füge links dein erstes Modell hinzu.'));}
 async function load(){const ticket=generation;await requireAdmin();const {data,error}=await client.from('portfolio_projects').select('id,name,description_de,description_fr,image_paths,published,created_at,sort_order').order('sort_order',{ascending:true}).order('created_at',{ascending:false}).order('id',{ascending:false});if(error)throw error;if(!allowed||ticket!==generation)return;rows=data;render();}
 $('portfolioFiles').onchange=()=>{try{validate(files());drawPhotos();status('Die ausgewählten Fotos werden beim Speichern hochgeladen.');}catch(e){$('portfolioFiles').value='';drawPhotos();status(e.message,true);}};
 $('portfolioNew').onclick=()=>{if(!busy){reset();status('Neue Arbeit');}};
 $('portfolioReload').onclick=async()=>{if(busy)return;lock(true);try{await load();status('Galerie aktualisiert.');}catch(e){status(e.message,true);}finally{lock(false);}};
 $('portfolioAdminForm').addEventListener('submit',async event=>{
  event.preventDefault();if(busy||!allowed)return;
  lock(true);let uploaded=0,saved=false;const ticket=generation,id=editing;
  try{
   await requireAdmin();const selectedFiles=files();validate(selectedFiles);
   const values={name:$('portfolioName').value.trim(),description_de:$('portfolioDescriptionDe').value.trim(),description_fr:$('portfolioDescriptionFr').value.trim()||null,published:$('portfolioPublished').checked,sort_order:Number($('portfolioPosition').value),image_paths:[...paths]};
   if(!Number.isInteger(values.sort_order)||values.sort_order<1||values.sort_order>1000000)throw new Error('Bitte eine ganze Position zwischen 1 und 1000000 eingeben.');
   if(!values.name||!values.description_de)throw new Error('Modellname und deutsche Beschreibung sind erforderlich.');
   if(values.published&&!values.image_paths.length&&!selectedFiles.length)throw new Error('Zum Veröffentlichen bitte mindestens ein Foto hinzufügen.');
   for(const file of selectedFiles){
    if(!allowed||ticket!==generation)throw new Error('Anmeldung beendet. Bitte erneut anmelden.');
    const extension={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[file.type],path=crypto.randomUUID()+'.'+extension;
    status('Foto '+(uploaded+1)+' von '+selectedFiles.length+' wird hochgeladen …');
    const {error}=await client.storage.from('portfolio-images').upload(path,file,{contentType:file.type,upsert:false});if(error)throw error;
    values.image_paths.push(path);uploaded++;
   }
   await requireAdmin();if(ticket!==generation)throw new Error('Anmeldung beendet. Bitte erneut anmelden.');
   const query=id?client.from('portfolio_projects').update(values).eq('id',id):client.from('portfolio_projects').insert(values);
   const {data,error}=await query.select('id');if(error)throw error;if(!data?.length)throw new Error('Keine Änderung gespeichert. Bitte Galerie aktualisieren.');saved=true;
   if(ticket!==generation)return;
   reset();await load();await window.FavoPortfolio.reload();status(values.published?'Arbeit gespeichert und in der Galerie veröffentlicht.':'Arbeit als Entwurf gespeichert.');
  }catch(e){status((saved?'Gespeichert, aber Aktualisierung fehlgeschlagen: ':'Speichern fehlgeschlagen: ')+e.message+(uploaded&&!saved?' Hochgeladene Fotos bleiben erhalten. Bitte vor erneutem Speichern die Galerie aktualisieren.':''),true);}finally{lock(false);}
 });
 window.PortfolioAdmin={
  setAccess(c,access){client=c;allowed=access;generation++;$('adminPortfolio').hidden=!access;if(access){load().then(()=>{if(allowed)status('Galerie bereit.');}).catch(e=>status('Galerie konnte nicht geladen werden: '+e.message,true));}else{rows=[];$('portfolioAdminList').replaceChildren();reset();}},
  focus(){if(allowed){$('adminPortfolioHeading').scrollIntoView({block:'start'});$('portfolioName').focus();}}
 };
})();
