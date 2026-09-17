/* Opt-in Sandbox test link; no credentials and no PayPal live endpoint. */
(() => {
 'use strict';
 const storageKey='favoPayPalSandbox';
 const mode=new URL(location.href).searchParams.get('paypal');
 let saved=null;try{saved=JSON.parse(sessionStorage.getItem(storageKey)||'null');}catch{}
 const enabled=mode==='sandbox'||(['return','cancel'].includes(mode)&&!!saved);
 const {node,localized}=window.ProductOptions;
 const box=node('div');box.id='paypalSandboxStatus';box.hidden=true;
 const status=node('p');status.setAttribute('role','status');
 const open=localized(node('a',undefined,'btn primary wide'),'PayPal Sandbox öffnen','Ouvrir PayPal Sandbox');open.referrerPolicy='no-referrer';
 const check=localized(node('button',undefined,'btn secondary wide'),'Sandbox-Zahlung prüfen','Vérifier le paiement Sandbox');check.type='button';
 box.append(status,open,check);document.getElementById('orderStatus').after(box);
 function approval(value){try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='www.sandbox.paypal.com'&&!u.username&&!u.password?u.href:null;}catch{return null;}}
 function render(data){
  saved=data;box.hidden=false;
  try{sessionStorage.setItem(storageKey,JSON.stringify(data));}catch{}
  const paid=data.payment_status==='paid';const url=approval(data.approval_url);open.hidden=paid||!url;if(url)open.href=url;else open.removeAttribute('href');check.hidden=paid;
  localized(status,paid?'PayPal-Sandbox-Testzahlung bestätigt. Kein echtes Geld.':'PayPal Sandbox: Nur Testgeld. Die Bestellung bleibt bis zur bestätigten Zahlung unbezahlt.',paid?'Paiement test PayPal Sandbox confirmé. Aucun argent réel.':'PayPal Sandbox : argent fictif uniquement. La commande reste non payée jusqu’à la confirmation du paiement.');
  if(paid)setOrderStatus(orderMessage(`Bestellung ${data.order_number}: Sandbox-Testzahlung bestätigt, CHF ${Number(data.total).toFixed(2)}.`,`Commande ${data.order_number} : paiement test Sandbox confirmé, CHF ${Number(data.total).toFixed(2)}.`));
 }
 async function verify(){
  if(!saved?.request_key||!saved?.payment_token)return;
  check.disabled=true;localized(status,'Sandbox-Zahlung wird serverseitig geprüft …','Vérification du paiement Sandbox sur le serveur …');
  try{
   const c=window.FAVO_SUPABASE;
   const res=await fetch(c.url+'/functions/v1/paypal-sandbox',{method:'POST',headers:{apikey:c.publishableKey,'Content-Type':'application/json'},body:JSON.stringify({action:'capture',request_key:saved.request_key,payment_token:saved.payment_token}),signal:AbortSignal.timeout(60000)});
   const data=await res.json();if(!res.ok||data.sandbox!==true||!['paid','unpaid'].includes(data.payment_status))throw new Error('Not confirmed');
   render(data);
  }catch{localized(status,'Zahlung noch nicht bestätigt. Bitte erneut prüfen; keine zweite Bestellung anlegen.','Paiement non confirmé. Vérifie à nouveau sans créer une deuxième commande.');}
  finally{check.disabled=false;}
 }
 check.onclick=verify;
 window.PayPalSandbox={enabled,show:render};
 if(enabled){
  const button=document.getElementById('placeOrder');
  const note=document.querySelector('#checkoutModal > .checkout-card > .demo-note:last-child');
  const method=document.getElementById('paymentMethod');
  const update=()=>{
   if(method.value==='PayPal'){
    localized(button,'Mit PayPal Sandbox testen','Tester avec PayPal Sandbox');
    localized(note,'Sandbox-Test mit Testgeld. Die Bestellung wird gespeichert; bezahlt erst nach bestätigter PayPal-Testzahlung. TWINT ist nicht angebunden.','Test Sandbox avec de l’argent fictif. La commande est enregistrée ; elle n’est payée qu’après confirmation du paiement test PayPal. TWINT n’est pas connecté.');
   }else{
    localized(button,'Unbezahlte Bestellung absenden','Envoyer la commande non payée');
    localized(note,'TWINT ist noch nicht angebunden. Es wird keine Zahlung ausgelöst.','TWINT n’est pas encore connecté. Aucun paiement n’est effectué.');
   }
  };method.addEventListener('change',update);update();
 }
 if(saved&&['return','cancel'].includes(mode)){
  document.getElementById('checkoutModal').classList.add('open');
  lastOrderReceipt={subtotal:Number(saved.subtotal),shipping:Number(saved.shipping),total:Number(saved.total)};renderCheckoutSummary();render(saved);
  if(mode==='return')verify();
  else localized(status,'PayPal Sandbox wurde abgebrochen. Keine Zahlung bestätigt. Du kannst den Test fortsetzen oder den Status prüfen.','PayPal Sandbox a été annulé. Aucun paiement confirmé. Tu peux reprendre le test ou vérifier le statut.');
  history.replaceState(null,'',location.pathname+'?paypal=sandbox');
 }
})();
