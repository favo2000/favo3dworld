/* Authenticated SELECT and status-only UPDATE; RLS enforces the admin account.
 * Private photos use authenticated downloads and ephemeral local blob URLs. */
(() => {
 'use strict';
 const host=document.getElementById('adminOrders');
 const {node,localized,t}=window.ProductOptions;
 const statuses=[['Neu','Nouveau'],['In Bearbeitung','En cours'],['Versendet','Expédié'],['Abgeschlossen','Terminé'],['Storniert','Annulé']];
 let client,authorized=false,epoch=0,view=0,rows=[],selected=null,items=[],productImages=[],photoURLs=[];
 const money=v=>'CHF '+Number(v).toFixed(2);
 const clearPhotos=()=>{photoURLs.forEach(URL.revokeObjectURL);photoURLs=[];};
 const title=localized(node('h3'),'Bestellungen und Mengenanfragen','Commandes et demandes de quantité');
 const reload=localized(node('button'),'Bestellungen laden','Charger les commandes');reload.type='button';
 const more=localized(node('button'),'Weitere laden','Charger la suite');more.type='button';more.hidden=true;
 const status=node('p');status.setAttribute('role','status');
 const filterHost=node('div');filterHost.className='admin-order-filters';
 const search=node('input');search.type='search';search.placeholder=t('Bestellnummer, Name oder E-Mail','Numéro, nom ou e-mail');
 const statusFilter=node('select');let allOption=localized(node('option'),'Alle Status','Tous les statuts');allOption.value='';statusFilter.append(allOption);
 for(const [de,fr] of statuses){const option=localized(node('option'),de,fr);option.value=de;statusFilter.append(option);}
 const paymentFilter=node('select');let allPayment=localized(node('option'),'Alle Zahlungsstatus','Tous les statuts de paiement');allPayment.value='';paymentFilter.append(allPayment);
 for(const [value,de,fr] of [['unpaid','Nicht bezahlt','Non payé'],['pending','Zahlung ausstehend','Paiement en attente'],['paid','Bezahlt','Payé'],['failed','Zahlung fehlgeschlagen','Paiement échoué'],['refunded','Erstattet','Remboursé']]){const option=localized(node('option'),de,fr);option.value=value;paymentFilter.append(option);}
 for(const [input,de,fr] of [[search,'Suche in geladenen Bestellungen','Rechercher dans les commandes chargées'],[statusFilter,'Bestellstatus','Statut de commande'],[paymentFilter,'Zahlungsstatus','Statut du paiement']]){const label=node('label');label.append(localized(node('span'),de,fr),input);filterHost.append(label);}
 const list=node('div'),detail=node('section');detail.style.overflowWrap='anywhere';host.append(title,reload,status,filterHost,list,more,detail);
 const message=(de,fr)=>localized(status,de,fr);
 function renderList(){
  list.replaceChildren();
  const query=search.value.trim().toLocaleLowerCase();const statusValue=statusFilter.value;const paymentValue=paymentFilter.value;
  for(const row of rows){
   const hay=[row.order_number,row.first_name,row.last_name,row.email].filter(Boolean).join(' ').toLocaleLowerCase();
   if((query&&!hay.includes(query))||(statusValue&&row.status!==statusValue)||(paymentValue&&row.payment_status!==paymentValue))continue;
   const button=node('button');button.type='button';button.className='admin-order-row';button.style.display='block';button.style.maxWidth='100%';button.style.overflowWrap='anywhere';
   button.textContent=[row.kind==='inquiry'?t('Anfrage','Demande'):t('Bestellung','Commande'),row.order_number,new Date(row.created_at).toLocaleDateString(document.documentElement.lang==='fr'?'fr-CH':'de-CH'),row.first_name,row.last_name,money(row.total),t(...(statuses.find(s=>s[0]===row.status)||[row.status,row.status]))].join(' · ');
   button.onclick=()=>open(row.id);list.append(button);
  }
 }
 async function load(append=false){
  if(!authorized)return;const token=epoch;reload.disabled=more.disabled=true;
  try{
   const start=append?rows.length:0;
   const {data,error}=await client.from('Orders').select('id,order_number,created_at,first_name,last_name,email,total,status,payment_status,payment_method,kind').order('created_at',{ascending:false}).order('id').range(start,start+49);
   if(token!==epoch)return;if(error)throw error;rows=append?rows.concat(data):data;renderList();more.hidden=data.length<50;
   message(rows.length?'Liste aktualisiert.':'Noch keine Bestellungen oder Anfragen.',rows.length?'Liste actualisée.':'Aucune commande ou demande.');
  }catch{if(token===epoch)message('Bestellungen konnten nicht geladen werden. Bitte Anmeldung prüfen und erneut versuchen.','Impossible de charger les commandes. Vérifie la connexion et réessaie.');}
  finally{if(token===epoch)reload.disabled=more.disabled=false;}
 }
 async function open(id){
  if(!authorized)return;const token=epoch,currentView=++view;clearPhotos();selected=null;detail.replaceChildren();
  try{
   const results=await Promise.all([
    client.from('Orders').select('id,order_number,created_at,first_name,last_name,email,street,postal_code,city,country,subtotal,shipping,total,currency,payment_method,payment_status,payment_environment,status,kind').eq('id',id).single(),
    client.from('OrderItems').select('id,product_id_snapshot,product_id,product_name,size,color_details,quantity,unit_price,line_total,wish_text,customer_photo_id').eq('order_id',id).order('id')
   ]);
   if(token!==epoch||currentView!==view)return;if(results[0].error||results[1].error)throw new Error('Read failed');
   const ids=[...new Set(results[1].data.map(item=>item.product_id_snapshot??item.product_id).filter(id=>id!=null))];
   let images=[];
   if(ids.length){try{const result=await client.from('Products').select('id,image_url').in('id',ids);if(!result.error&&Array.isArray(result.data))images=result.data;}catch{ /* Current catalog images are optional; snapshots remain available. */ }}
   if(token!==epoch||currentView!==view)return;
   selected=results[0].data;items=results[1].data;productImages=images;renderDetail();
  }catch{if(token===epoch)message('Bestellung konnte nicht geöffnet werden.','Impossible d’ouvrir la commande.');}
 }
 function renderDetail(){
  clearPhotos();detail.replaceChildren();if(!selected)return;
  const order=selected;detail.append(node('h3',order.order_number));
  detail.append(node('p',new Date(order.created_at).toLocaleString(document.documentElement.lang==='fr'?'fr-CH':'de-CH')));
  detail.append(node('h4',t('Kunde und Lieferadresse','Client et adresse de livraison')),
   node('p',[order.first_name,order.last_name].filter(Boolean).join(' ')),node('p',order.email),node('p',order.street),node('p',[order.postal_code,order.city,order.country].filter(Boolean).join(' ')));
  if(order.kind==='inquiry')detail.append(localized(node('p'),'Unverbindliche Anfrage. Beträge sind Richtwerte, kein Angebot. Keine Zahlung oder Lagerabbuchung.','Demande sans engagement. Montants indicatifs, pas une offre. Aucun paiement ni prélèvement de stock.'));
  const paymentLabels={unpaid:['Nicht bezahlt','Non payé'],pending:['Zahlung ausstehend','Paiement en attente'],paid:['Bezahlt','Payé'],failed:['Zahlung fehlgeschlagen','Paiement échoué'],refunded:['Erstattet','Remboursé']};
  detail.append(node('p',t('Zahlungsart: ','Mode de paiement : ')+(order.payment_method||'—')+' · '+t(...paymentLabels[order.payment_status])));
  if(order.payment_environment==='sandbox')detail.append(localized(node('p'),'PayPal Sandbox – Testzahlung, kein echtes Geld.','PayPal Sandbox – paiement test, aucun argent réel.'));
  for(const item of items){
   const box=node('div',undefined,'admin-product admin-order-item');box.style.display='block';
   const imageMeta=productImages.find(image=>String(image.id)===String(item.product_id_snapshot??item.product_id));
   if(imageMeta?.image_url&&/^https?:\/\//i.test(imageMeta.image_url)){const image=node('img');image.className='admin-order-item-image';image.src=imageMeta.image_url;image.alt=item.product_name||t('Produktbild','Image du produit');image.loading='lazy';box.append(image);}
   box.append(node('h4',item.product_name+' × '+item.quantity),node('p','ID: '+(item.product_id_snapshot??item.product_id)+' · '+t('Größe: ','Taille : ')+(item.size==='fixed'?t('Feste Größe','Taille fixe'):['50','60','70'].includes(item.size)?item.size+' cm':item.size)));
   for(const c of item.color_details||[])box.append(node('p',document.documentElement.lang==='fr'?(c.region_fr||c.region_de)+': '+(c.name_fr||c.name_de):c.region_de+': '+c.name_de));
   box.append(node('p',t('Stückpreis: ','Prix unitaire : ')+money(item.unit_price)+' · '+t('Positionssumme: ','Sous-total de l’article : ')+money(item.line_total)));
   if(item.wish_text)box.append(node('p',t('Wunschtext: ','Texte souhaité : ')+item.wish_text));
   if(item.customer_photo_id){
    const button=localized(node('button'),'Privates Kundenfoto anzeigen','Afficher la photo privée');button.type='button';const target=node('div');
    button.onclick=async()=>{
     if(!authorized)return;const token=epoch;button.disabled=true;
     try{
      const meta=await client.from('CustomerPhotos').select('object_path').eq('id',item.customer_photo_id).eq('order_id',order.id).eq('status','attached').single();
      if(token!==epoch||selected?.id!==order.id||!target.isConnected)return;if(meta.error)throw meta.error;
      const photo=await client.storage.from('customer-photos').download(meta.data.object_path);
      if(token!==epoch||selected?.id!==order.id||!target.isConnected)return;if(photo.error)throw photo.error;
      const url=URL.createObjectURL(photo.data);photoURLs.push(url);const image=node('img');image.src=url;image.alt=t('Privates Kundenfoto','Photo personnelle privée');image.style.maxWidth='100%';target.replaceChildren(image);
     }catch{localized(target,'Foto konnte nicht geladen werden.','Impossible de charger la photo.');}
     finally{if(token===epoch)button.disabled=false;}
    };box.append(button,target);
   }detail.append(box);
  }
  const totals=node('dl',undefined,'admin-order-totals');
  for(const [de,fr,value] of [['Zwischensumme','Sous-total',order.subtotal],['Versand','Livraison',order.shipping],['Gesamt','Total',order.total]])totals.append(node('dt',t(de,fr)),node('dd',money(value)));
  detail.append(totals);
  const label=node('label'),select=node('select');label.append(localized(node('span'),'Bestellstatus','Statut de commande'));
  for(const [de,fr] of statuses){const option=node('option',t(de,fr));option.value=de;select.append(option);}select.value=order.status;label.append(select);
  const save=localized(node('button'),'Status speichern','Enregistrer le statut');save.type='button';
  save.onclick=async()=>{
   if(!authorized)return;const token=epoch;save.disabled=true;
   try{
    const result=await client.from('Orders').update({status:select.value}).eq('id',order.id).eq('status',order.status).select('id,status');
    if(token!==epoch)return;if(result.error||result.data.length!==1)throw new Error('Conflict');
    order.status=result.data[0].status;const row=rows.find(r=>r.id===order.id);if(row)row.status=order.status;renderList();message('Status gespeichert. Zahlungsstatus und Lagerbestand bleiben unverändert.','Statut enregistré. Le paiement et le stock restent inchangés.');
   }catch{if(token===epoch)message('Status nicht bestätigt. Bitte Bestellung neu öffnen und prüfen.','Statut non confirmé. Rouvre la commande pour vérifier.');}
   finally{if(token===epoch)save.disabled=false;}
  };detail.append(label,save);
 }
 search.oninput=renderList;statusFilter.onchange=renderList;paymentFilter.onchange=renderList;
 reload.onclick=()=>load();more.onclick=()=>load(true);
 window.OrdersAdmin={setAccess(value,allowed){epoch++;client=value;authorized=allowed;host.hidden=!allowed;clearPhotos();rows=[];selected=null;items=[];productImages=[];search.value='';statusFilter.value='';paymentFilter.value='';list.replaceChildren();detail.replaceChildren();status.textContent='';if(allowed)load();},refresh(){if(authorized){renderList();renderDetail();}}};
})();
