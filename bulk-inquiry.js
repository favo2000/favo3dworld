/* A quantity inquiry is not an order: no inventory or payment is taken. */
(() => {
 'use strict';
 const {node,localized,t}=window.ProductOptions;
 const modal=node('div',undefined,'checkout-modal');modal.id='bulkInquiry';
 const card=node('div',undefined,'checkout-card');
 const close=node('button','×','x');close.type='button';
 const title=localized(node('h2'),'Mehr als 20 Stück anfragen','Demander plus de 20 pièces');
 const product=node('p');
 const note=localized(node('p'),'Unverbindliche Mengenanfrage. Kein Kauf, keine Zahlung und keine Lagerreservierung. Ein Kundenfoto wird hier nicht übertragen; es kann nach Absprache ergänzt werden.','Demande de quantité sans engagement. Aucun achat, paiement ou stock réservé. Aucune photo personnelle n’est transmise ici ; elle pourra être ajoutée après accord.');
 const form=node('form');const fields={};
 for(const [key,de,fr,type] of [['first_name','Vorname','Prénom','text'],['last_name','Nachname','Nom','text'],['email','E-Mail','E-mail','email'],['quantity','Gewünschte Menge (ab 21)','Quantité souhaitée (à partir de 21)','number']]){
  const label=node('label');label.append(localized(node('span'),de,fr));const input=node('input');input.type=type;input.required=true;input.maxLength=200;
  if(key==='quantity'){input.min='21';input.max='9999';input.step='1';input.value='21';}fields[key]=input;label.append(input);form.append(label);
 }
 const submit=localized(node('button',undefined,'btn primary wide'),'Anfrage senden','Envoyer la demande');submit.type='submit';
 const status=node('p');status.setAttribute('role','status');status.style.overflowWrap='anywhere';
 form.append(submit,status);card.append(close,title,product,note,form);modal.append(card);document.body.append(modal);
 let item,returnToProduct,pending=null,sending=false;
 const lock=state=>Object.values(fields).forEach(n=>n.readOnly=state);
 close.onclick=()=>{if(sending)return;modal.classList.remove('open');returnToProduct?.();};
 window.BulkInquiry={open(value,name,onClose){
  if(!pending){item=JSON.parse(JSON.stringify(value));product.textContent=name;status.textContent='';delete status.dataset.optionDe;delete status.dataset.optionFr;}
  returnToProduct=onClose;modal.classList.add('open');fields.first_name.focus();
 }};
 form.onsubmit=async event=>{
  event.preventDefault();if(sending)return;
  if(!pending){
   if(!form.reportValidity())return;
   const quantity=Number(fields.quantity.value);if(!Number.isInteger(quantity)||quantity<21||quantity>9999)return;
   pending={kind:'inquiry',payment_method:null,request_key:crypto.randomUUID(),customer:{first_name:fields.first_name.value.trim(),last_name:fields.last_name.value.trim(),email:fields.email.value.trim(),country:'CH'},items:[{...item,quantity}]};
  }
  sending=true;submit.disabled=true;lock(true);localized(status,'Anfrage wird gespeichert …','Enregistrement de la demande …');
  try{
   const c=window.FAVO_SUPABASE;
   const response=await fetch(c.url+'/functions/v1/place-order-work2',{method:'POST',headers:{apikey:c.publishableKey,'Content-Type':'application/json'},body:JSON.stringify(pending),signal:AbortSignal.timeout(25000)});
   const result=await response.json();
   if(!response.ok){
    if(['INVALID_CUSTOMER','INVALID_ITEMS','INVALID_OPTIONS','PRODUCT_UNAVAILABLE','RATE_LIMIT','INVALID_REQUEST'].includes(result.error)){
     pending=null;lock(false);localized(status,'Anfrage nicht gespeichert. Bitte Angaben und Produktauswahl prüfen oder später erneut versuchen.','Demande non enregistrée. Vérifie les informations et la configuration, ou réessaie plus tard.');return;
    }throw new Error('Unknown outcome');
   }
   if(result.kind!=='inquiry'||typeof result.order_number!=='string'||result.payment_status!=='unpaid')throw new Error('Invalid receipt');
   localized(status,'Anfrage '+result.order_number+' gespeichert. Wir melden uns per E-Mail. Keine Bestellung oder Zahlung ausgelöst.','Demande '+result.order_number+' enregistrée. Nous te répondrons par e-mail. Aucune commande ni aucun paiement effectué.');
   pending=null;form.reset();fields.quantity.value='21';lock(false);submit.hidden=true;
  }catch{localized(status,'Die Bestätigung ist noch offen. Bitte erneut senden: Dieselbe Anfrage wird ohne Duplikat wiederholt.','La confirmation est en attente. Renvoie la demande : elle sera répétée sans doublon.');}
  finally{sending=false;submit.disabled=false;}
 };
 const open=window.BulkInquiry.open;window.BulkInquiry.open=(...args)=>{submit.hidden=false;open(...args);};
})();
