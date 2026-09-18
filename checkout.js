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
   const data={product_id:item.productId,size:item.size==='Feste Grösse'?'fixed':item.size.split(' ')[0],colors:invoiceColors(item),quantity:itemQuantity(item),personalization:item.personalization||null};
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
 if(checkoutSending||window.PayPalSandbox?.completed)return;
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
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),paypal?60000:25000);
 try{
   const response=await fetch(window.FAVO_SUPABASE.url+'/functions/v1/'+(paypal?window.PayPalSandbox.endpoint:'place-order-work2'),{method:'POST',headers:{'Content-Type':'application/json',apikey:window.FAVO_SUPABASE.publishableKey},body:JSON.stringify(paypal?{action:'create',order:pendingInvoice}:pendingInvoice),signal:controller.signal});
   const data=await response.json();
   if(!response.ok){
     const known=checkoutErrors[data.error];
     if(known){pendingInvoice=null;lockCheckout(false);setOrderStatus(orderMessage(...known));return;}
     throw new Error('Unknown outcome');
   }
   if(typeof data.order_number!=='string'||data.payment_method!==pendingInvoice.payment_method||!(paypal?['unpaid','paid']:['unpaid']).includes(data.payment_status)||data.kind!=='order'||!Number.isFinite(Number(data.total))||(paypal&&(!window.PayPalSandbox.valid(data)||!data.payment_token)))throw new Error('Invalid receipt');
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
 }finally{clearTimeout(timer);checkoutSending=false;orderButton.disabled=!!window.PayPalSandbox?.completed;}
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
