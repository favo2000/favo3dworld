/* Server-validated checkout. Browser prices are never authoritative. */
let checkoutSending = false;
let pendingInvoice = null;
let lastOrderReceipt = null;
const orderButton = document.getElementById('placeOrder');
const orderStatus = document.getElementById('orderStatus');
orderStatus.style.overflowWrap = 'anywhere';
const customerFields = ['firstName','lastName','email','street','zip','city'];
let lastOrderMessage=null;
const orderMessage = (de,fr) => {lastOrderMessage={de,fr};return document.documentElement.lang==='fr'?fr:de;};
function setOrderStatus(message) { orderStatus.textContent=message;if(message&&lastOrderMessage){orderStatus.dataset.optionDe=lastOrderMessage.de;orderStatus.dataset.optionFr=lastOrderMessage.fr;}else{delete orderStatus.dataset.optionDe;delete orderStatus.dataset.optionFr;} }
function invoiceColors(item) {
 if(item.colorSelections)return Object.fromEntries(item.colorSelections.map(c=>[c.region_id,c.color_id]));
 const normalize = value => String(value || '').toLowerCase().replace('grün','gruen').replace('weiß','weiss');
 if (['Cavallo','Hoodie Drache','Pika Urban'].includes(item.name)) return {primary:normalize(item.horse),secondary:normalize(item.base)};
 if (item.name==='Zen Schildkröte') return {primary:normalize(item.horse)};
 if (item.horseLabel?.startsWith('Farbe: ')) return {primary:normalize(item.horseLabel.slice(7))};
 return {};
}
function invoiceItems() {
 const grouped = new Map();
 for (const item of cart) {
   const data={product_id:item.productId,size:item.sizeId||(item.size==='Feste Grösse'?'fixed':item.size.split(' ')[0]),colors:invoiceColors(item),quantity:itemQuantity(item),personalization:item.personalization||null};
   const key=cartConfigurationKey(item);
   if(grouped.has(key))grouped.get(key).quantity+=data.quantity;else grouped.set(key,data);
 }
 return [...grouped.values()];
}
async function invoiceRequestKey(payload) {
 // Store only a digest and random request ID, never customer/address data.
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({payment_environment:payload.payment_method==='PayPal'?window.PayPalSandbox?.environment:null,order:payload})));
 const fingerprint=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
 try {
   const saved=JSON.parse(sessionStorage.getItem('favoInvoiceAttempt')||'null');
   if(saved?.fingerprint===fingerprint)return saved.key;
 }catch{}
 const key=crypto.randomUUID();
 try{sessionStorage.setItem('favoInvoiceAttempt',JSON.stringify({fingerprint,key}));}catch{}
 return key;
}
function lockCheckout(locked) {
 customerFields.forEach(id=>document.getElementById(id).readOnly=locked);
 document.getElementById('paymentMethod').disabled=locked;
 // Block cart/configurator changes while an outcome is unknown.
 document.querySelectorAll('#cartItems button, #horseAdd, #hoodieAdd, #zenAdd, #pikaAdd, #simpleAdd, #addScheiben').forEach(el=>el.disabled=locked);
}
const checkoutErrors={
 INVALID_CUSTOMER:['Bitte prüfe Name, E-Mail und Lieferadresse.','Vérifiez votre nom, e-mail et adresse.'],
 INVALID_ITEMS:['Bitte prüfe die Mengen (maximal 20 je Auswahl).','Vérifiez les quantités (20 maximum par configuration).'],
 INVALID_OPTIONS:['Eine Produktauswahl ist nicht verfügbar. Bitte wähle Größe und Farben erneut.','Une configuration est indisponible. Sélectionnez à nouveau la taille et les couleurs.'],
 PRODUCT_UNAVAILABLE:['Ein Produkt oder eine Größe ist nicht mehr verfügbar. Bitte lade die Seite neu.','Un produit ou une taille est indisponible. Rechargez la page.'],
 OUT_OF_STOCK:['Der Lagerbestand reicht nicht aus. Bitte passe den Warenkorb an.','Stock insuffisant. Modifiez votre panier.'],
 PRICE_CHANGED:['Preise haben sich geändert. Bitte lade die Seite neu und prüfe den Warenkorb. Es wurde keine Bestellung gespeichert.','Les prix ont changé. Rechargez la page et vérifiez votre panier. Aucune commande enregistrée.'],
 RATE_LIMIT:['Zu viele Bestellversuche. Bitte versuche es später erneut.','Trop de tentatives. Réessayez plus tard.'],
 INVALID_REQUEST:['Die Bestellung konnte nicht verarbeitet werden. Bitte prüfe deine Angaben.','Impossible de traiter la commande. Vérifiez vos informations.']
};
orderButton.onclick=async()=>{
 if(checkoutSending||window.PayPalSandbox?.completed||window.PayrexxPayment?.completed)return;
 if(window.PayrexxPayment?.returnPending){window.PayrexxPayment.verify();return;}
 if(!pendingInvoice){
   if(!cart.length){setOrderStatus(orderMessage('Dein Warenkorb ist leer.','Votre panier est vide.'));return;}
   if(customerFields.some(id=>!document.getElementById(id).value.trim()) || !document.getElementById('email').checkValidity()){
     setOrderStatus(orderMessage(...checkoutErrors.INVALID_CUSTOMER));return;
   }
   checkoutSending=true;orderButton.disabled=true;
   const value=id=>document.getElementById(id).value.trim();
   const payload={kind:'order',payment_method:document.getElementById('paymentMethod').value,customer:{first_name:value('firstName'),last_name:value('lastName'),email:value('email'),street:value('street'),postal_code:value('zip'),city:value('city'),country:'CH'},items:invoiceItems(),expected_total:cartTotals().total};
   try{payload.request_key=await invoiceRequestKey(payload);pendingInvoice=payload;}
   catch{checkoutSending=false;orderButton.disabled=false;setOrderStatus(orderMessage('Bitte öffne den Shop über die sichere HTTPS-Adresse.','Ouvrez la boutique via HTTPS.'));return;}
 }
 checkoutSending=true;orderButton.disabled=true;lockCheckout(true);
 setOrderStatus(orderMessage('Bestellung wird gespeichert …','Enregistrement de la commande …'));
 const paypal=window.PayPalSandbox?.enabled&&pendingInvoice.payment_method==='PayPal';
 const twint=pendingInvoice.payment_method==='TWINT';
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),(paypal||twint)?60000:25000);
 try{
   const response=await fetch(window.FAVO_SUPABASE.url+'/functions/v1/'+(paypal?window.PayPalSandbox.endpoint:(twint?'payrexx':'place-order-work2')),{method:'POST',headers:{'Content-Type':'application/json',apikey:window.FAVO_SUPABASE.publishableKey},body:JSON.stringify(paypal?{action:'create',order:pendingInvoice}:(twint?{action:'create',order:pendingInvoice,language:document.documentElement.lang}:pendingInvoice)),signal:controller.signal});
   const data=await response.json();
   if(!response.ok){
     const known=checkoutErrors[data.error];
     if(known){pendingInvoice=null;lockCheckout(false);setOrderStatus(orderMessage(...known));return;}
     throw new Error('Unknown outcome');
   }
   if(typeof data.order_number!=='string'||data.payment_method!==pendingInvoice.payment_method||!((paypal||twint)?['unpaid','paid']:['unpaid']).includes(data.payment_status)||data.kind!=='order'||!Number.isFinite(Number(data.total))||(paypal&&(!window.PayPalSandbox.valid(data)||!data.payment_token))||(twint&&(!data.payment_token||(!data.payment_url&&data.payment_status!=='paid'))))throw new Error('Invalid receipt');
   if(twint){
     window.PayrexxPayment.accept(data);return;
   }
   setOrderStatus(orderMessage(`Bestellung ${data.order_number} gespeichert. Gesamtbetrag: CHF ${Number(data.total).toFixed(2)}. Noch nicht bezahlt; keine Zahlung wurde ausgelöst. Bitte bewahre die Bestellnummer auf.`,`Commande ${data.order_number} enregistrée. Total : CHF ${Number(data.total).toFixed(2)}. Non payée ; aucun paiement effectué. Conservez le numéro de commande.`));
   lastOrderReceipt={subtotal:Number(data.subtotal),shipping:Number(data.shipping),total:Number(data.total)};
   pendingInvoice=null;try{sessionStorage.removeItem('favoInvoiceAttempt');}catch{}
   cart=[];renderCart();lockCheckout(false);
   document.getElementById('checkoutItems').replaceChildren();
   for(const key of ['subtotal','shipping','total'])document.getElementById('checkout'+key[0].toUpperCase()+key.slice(1)).textContent='CHF '+Number(data[key]).toFixed(2);
   customerFields.forEach(id=>document.getElementById(id).value='');
   // Keep confirmation visible; refresh inventory without removing the receipt.
   loadCatalog();
   if(paypal)window.PayPalSandbox.show(data);
 }catch{
   setOrderStatus(orderMessage('Die Bestätigung ist noch offen. Bitte klicke erneut auf den Bestellbutton. Derselbe Auftrag wird sicher wiederholt, ohne eine zweite Bestellung anzulegen.','La confirmation est en attente. Cliquez à nouveau sur le bouton de commande : la même demande sera répétée sans créer de doublon.'));
 }finally{clearTimeout(timer);checkoutSending=false;orderButton.disabled=!!(window.PayPalSandbox?.completed||window.PayrexxPayment?.completed);}
};
// A pending request must be retried unchanged, even if a configurator was left open.
document.addEventListener('click',event=>{
 if(pendingInvoice && event.target.closest('.product button, .remove, #horseAdd, #hoodieAdd, #zenAdd, #pikaAdd, #simpleAdd, #addScheiben')){
   event.preventDefault();event.stopImmediatePropagation();
 }
},true);

const openInvoiceCheckout = document.getElementById('toCheckout').onclick;
document.getElementById('toCheckout').onclick = () => {
  openInvoiceCheckout();
  if (!pendingInvoice) setOrderStatus('');
};

// A redirect alone is never proof of payment. Verify the saved capability
// against the existing server endpoint before clearing the cart.
(() => {
 const key='favoPayrexxReturn', {node,localized}=window.ProductOptions;
 let saved=null,completed=false,verifying=false;
 try{saved=JSON.parse(sessionStorage.getItem(key)||'null');}catch{}
 const box=node('div');box.id='payrexxStatus';box.hidden=true;
 const resume=localized(node('a',undefined,'btn primary wide'),'TWINT über Payrexx öffnen','Ouvrir TWINT via Payrexx');resume.referrerPolicy='no-referrer';
 const check=localized(node('button',undefined,'btn secondary wide'),'TWINT-Zahlung prüfen','Vérifier le paiement TWINT');check.type='button';
 box.append(resume,check);orderStatus.after(box);
 function paymentURL(value){try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='favo3dworld.payrexx.com'&&!u.username&&!u.password?u.href:null;}catch{return null;}}
 function valid(data){return data?.kind==='order'&&data.payment_method==='TWINT'&&data.currency==='CHF'&&['paid','unpaid','pending'].includes(data.payment_status)&&typeof data.order_number==='string'&&data.order_number.length>0&&['total','subtotal','shipping'].every(k=>Number.isFinite(Number(data[k]))&&Number(data[k])>=0)&&Number(data.total)>0;}
 function show(data){
  if(!valid(data))throw new Error('Invalid receipt');
  lastOrderReceipt={subtotal:Number(data.subtotal),shipping:Number(data.shipping),total:Number(data.total)};
  if(data.payment_status==='paid'){
   completed=true;box.hidden=true;pendingInvoice=null;cart=[];renderCart();lockCheckout(false);orderButton.disabled=true;
   try{sessionStorage.removeItem(key);sessionStorage.removeItem('favoInvoiceAttempt');}catch{}
   setOrderStatus(orderMessage(`Vielen Dank! Deine TWINT-Zahlung über CHF ${Number(data.total).toFixed(2)} wurde bestätigt. Bestellnummer: ${data.order_number}.`,`Merci ! Ton paiement TWINT de CHF ${Number(data.total).toFixed(2)} a été confirmé. Numéro de commande : ${data.order_number}.`));
   loadCatalog();
  }else{
   completed=false;box.hidden=false;const url=paymentURL(data.payment_url);resume.hidden=!url;if(url)resume.href=url;else resume.removeAttribute('href');
   setOrderStatus(orderMessage(`Bestellung ${data.order_number}: TWINT-Zahlung noch nicht bestätigt. Du kannst die Zahlung fortsetzen oder erneut prüfen.`,`Commande ${data.order_number} : paiement TWINT non confirmé. Tu peux reprendre le paiement ou vérifier à nouveau.`));
  }
  renderCheckoutSummary();document.getElementById('checkoutModal').classList.add('open');
 }
 async function verify(){
  if(verifying||completed||!saved?.request_key||!saved?.payment_token)return;
  verifying=true;check.disabled=true;
  setOrderStatus(orderMessage('TWINT-Zahlung wird geprüft …','Vérification du paiement TWINT …'));
  try{
   const r=await fetch(window.FAVO_SUPABASE.url+'/functions/v1/payrexx',{method:'POST',headers:{'Content-Type':'application/json',apikey:window.FAVO_SUPABASE.publishableKey},body:JSON.stringify({action:'verify',request_key:saved.request_key,payment_token:saved.payment_token}),signal:AbortSignal.timeout(60000)});
   const d=await r.json();if(!r.ok)throw new Error('Not confirmed');show(d);
  }catch{box.hidden=false;resume.hidden=true;document.getElementById('checkoutModal').classList.add('open');setOrderStatus(orderMessage('Die TWINT-Zahlung konnte noch nicht bestätigt werden. Bitte erneut prüfen; keine zweite Bestellung anlegen.','Le paiement TWINT n’a pas encore pu être confirmé. Vérifie à nouveau sans créer une deuxième commande.'));}
  finally{verifying=false;check.disabled=completed;}
 }
 check.onclick=verify;
 window.PayrexxPayment={get completed(){return completed;},get returnPending(){return new URLSearchParams(location.search).has('payrexx')&&!!saved&&!completed;},verify,accept(data){
  if(!valid(data)||!data.request_key||!data.payment_token)throw new Error('Invalid receipt');
  if(data.payment_status==='paid'){show(data);return;}
  const url=paymentURL(data.payment_url);if(!url)throw new Error('Invalid redirect');
  saved={request_key:data.request_key,payment_token:data.payment_token};
  sessionStorage.setItem(key,JSON.stringify(saved));window.location.assign(url);
 }};
 document.getElementById('toCheckout').addEventListener('click',()=>{if(completed&&cart.length){completed=false;orderButton.disabled=false;box.hidden=true;setOrderStatus('');}},true);
 if(new URLSearchParams(location.search).has('payrexx')&&saved?.request_key&&saved?.payment_token){
  orderButton.disabled=true;verify().finally(()=>{orderButton.disabled=completed;});
 }
})();
