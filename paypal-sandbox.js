/* Live by default; explicit Sandbox URLs retain separate receipts and server endpoints. */
(() => {
 'use strict';
 const mode=new URL(location.href).searchParams.get('paypal');
 const sandbox=['sandbox','return','cancel'].includes(mode);
 const environment=sandbox?'sandbox':'live';
 const endpoint='paypal-'+environment;
 const storageKey=sandbox?'favoPayPalSandbox':'favoPayPalLive';
 let saved=null;try{saved=JSON.parse(sessionStorage.getItem(storageKey)||'null');}catch{}
 const enabled=true;
 const valid=data=>data?.sandbox===sandbox&&data?.payment_environment===environment;
 // Previous Sandbox receipts can still be checked with their existing capability.
 if(saved&&!(valid(saved)||(sandbox&&saved.sandbox===true&&!saved.payment_environment)))saved=null;
 const {node,localized}=window.ProductOptions;
 const box=node('div');box.id='paypalSandboxStatus';box.hidden=true;
 const status=node('p');status.setAttribute('role','status');
 const open=localized(node('a',undefined,'btn primary wide'),sandbox?'PayPal Sandbox öffnen':'PayPal öffnen',sandbox?'Ouvrir PayPal Sandbox':'Ouvrir PayPal');open.referrerPolicy='no-referrer';
 const check=localized(node('button',undefined,'btn secondary wide'),sandbox?'Sandbox-Zahlung prüfen':'PayPal-Zahlung prüfen',sandbox?'Vérifier le paiement Sandbox':'Vérifier le paiement PayPal');check.type='button';
 box.append(status,open,check);document.getElementById('orderStatus').after(box);
 function approval(value){try{const u=new URL(value);return u.protocol==='https:'&&u.hostname===(sandbox?'www.sandbox.paypal.com':'www.paypal.com')&&!u.username&&!u.password?u.href:null;}catch{return null;}}
 function render(data){
  if(!valid(data)&&!(sandbox&&data.sandbox===true&&!data.payment_environment))return;
  saved=data;box.hidden=false;
  try{sessionStorage.setItem(storageKey,JSON.stringify(data));}catch{}
  const paid=data.payment_status==='paid';const url=approval(data.approval_url);open.hidden=paid||!url;if(url)open.href=url;else open.removeAttribute('href');check.hidden=paid;
  if(sandbox)localized(status,paid?'PayPal-Sandbox-Testzahlung bestätigt. Kein echtes Geld.':'PayPal Sandbox: Nur Testgeld. Die Bestellung bleibt bis zur bestätigten Zahlung unbezahlt.',paid?'Paiement test PayPal Sandbox confirmé. Aucun argent réel.':'PayPal Sandbox : argent fictif uniquement. La commande reste non payée jusqu’à la confirmation du paiement.');
  else localized(status,paid?'PayPal-Zahlung bestätigt.':'Die Bestellung ist noch unbezahlt. Öffne PayPal, um sicher zu bezahlen.',paid?'Paiement PayPal confirmé.':'La commande n’est pas encore payée. Ouvre PayPal pour payer en toute sécurité.');
  if(paid&&sandbox)setOrderStatus(orderMessage(`Bestellung ${data.order_number}: Sandbox-Testzahlung bestätigt, CHF ${Number(data.total).toFixed(2)}.`,`Commande ${data.order_number} : paiement test Sandbox confirmé, CHF ${Number(data.total).toFixed(2)}.`));
  if(paid&&!sandbox)setOrderStatus(orderMessage(`Bestellung ${data.order_number}: PayPal-Zahlung bestätigt, CHF ${Number(data.total).toFixed(2)}.`,`Commande ${data.order_number} : paiement PayPal confirmé, CHF ${Number(data.total).toFixed(2)}.`));
 }
 async function verify(){
  if(!saved?.request_key||!saved?.payment_token)return;
  check.disabled=true;localized(status,'PayPal-Zahlung wird serverseitig geprüft …','Vérification du paiement PayPal sur le serveur …');
  try{
   const c=window.FAVO_SUPABASE;
   const res=await fetch(c.url+'/functions/v1/'+endpoint,{method:'POST',headers:{apikey:c.publishableKey,'Content-Type':'application/json'},body:JSON.stringify({action:'capture',request_key:saved.request_key,payment_token:saved.payment_token}),signal:AbortSignal.timeout(60000)});
   const data=await res.json();if(!res.ok||!valid(data)||!['paid','unpaid'].includes(data.payment_status))throw new Error('Not confirmed');
   render(data);
  }catch{localized(status,'Zahlung noch nicht bestätigt. Bitte erneut prüfen; keine zweite Bestellung anlegen.','Paiement non confirmé. Vérifie à nouveau sans créer une deuxième commande.');}
  finally{check.disabled=false;}
 }
 check.onclick=verify;
 window.PayPalSandbox={enabled,environment,endpoint,valid,show:render};
 if(enabled){
  const button=document.getElementById('placeOrder');
  const note=document.querySelector('#checkoutModal > .checkout-card > .demo-note:last-child');
  const method=document.getElementById('paymentMethod');
  const update=()=>{
   if(method.value==='PayPal'){
    localized(button,sandbox?'Mit PayPal Sandbox testen':'Mit PayPal bezahlen',sandbox?'Tester avec PayPal Sandbox':'Payer avec PayPal');
    if(sandbox)localized(note,'Sandbox-Test mit Testgeld. Die Bestellung wird gespeichert; bezahlt erst nach bestätigter PayPal-Testzahlung. TWINT ist nicht angebunden.','Test Sandbox avec de l’argent fictif. La commande est enregistrée ; elle n’est payée qu’après confirmation du paiement test PayPal. TWINT n’est pas connecté.');
    else localized(note,'Die Bestellung wird gespeichert und erst nach bestätigter PayPal-Zahlung als bezahlt markiert. TWINT ist noch nicht angebunden.','La commande est enregistrée et n’est marquée comme payée qu’après confirmation du paiement PayPal. TWINT n’est pas encore connecté.');
   }else{
    localized(button,'Unbezahlte Bestellung absenden','Envoyer la commande non payée');
    localized(note,'TWINT ist noch nicht angebunden. Es wird keine Zahlung ausgelöst.','TWINT n’est pas encore connecté. Aucun paiement n’est effectué.');
   }
  };method.addEventListener('change',update);update();
 }
 if(saved&&['return','cancel','live-return','live-cancel'].includes(mode)){
  document.getElementById('checkoutModal').classList.add('open');
  lastOrderReceipt={subtotal:Number(saved.subtotal),shipping:Number(saved.shipping),total:Number(saved.total)};renderCheckoutSummary();render(saved);
  if(['return','live-return'].includes(mode))verify();
  else localized(status,sandbox?'PayPal Sandbox wurde abgebrochen. Keine Zahlung bestätigt. Du kannst den Test fortsetzen oder den Status prüfen.':'PayPal wurde abgebrochen. Keine Zahlung bestätigt. Du kannst die Zahlung fortsetzen oder den Status prüfen.',sandbox?'PayPal Sandbox a été annulé. Aucun paiement confirmé. Tu peux reprendre le test ou vérifier le statut.':'PayPal a été annulé. Aucun paiement confirmé. Tu peux reprendre le paiement ou vérifier le statut.');
  history.replaceState(null,'',location.pathname+(sandbox?'?paypal=sandbox':''));
 }
})();
