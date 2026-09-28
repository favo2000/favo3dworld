/* Supplied texts rendered as text nodes; opening legal information preserves cart/form state. */
(() => {
 'use strict';
 const titles={agb:['AGB','Conditions générales'],privacy:['Datenschutzerklärung','Déclaration de confidentialité'],imprint:['Impressum','Mentions légales']};
 const language=()=>document.documentElement.lang==='fr'?'fr':'de';
 const t=(de,fr)=>language()==='fr'?fr:de;
 const dialog=document.createElement('dialog');dialog.id='legalDialog';dialog.className='checkout-card legal-dialog';dialog.setAttribute('aria-labelledby','legalTitle');
 const close=document.createElement('button');close.type='button';close.className='x';close.textContent='×';close.onclick=()=>dialog.close();
 const title=document.createElement('h2');title.id='legalTitle';
 const switches=document.createElement('div');switches.className='legal-language';
 for(const lang of ['de','fr']){const button=document.createElement('button');button.type='button';button.textContent=lang.toUpperCase();button.dataset.legalLanguage=lang;button.className='btn secondary';button.onclick=()=>window.translatePage(lang);switches.append(button);}
 const content=document.createElement('article');dialog.append(close,title,switches,content);document.body.append(dialog);
 let selected='agb',opener;
 function refresh(){
  document.querySelectorAll('[data-legal]').forEach(a=>{const names=titles[a.dataset.legal];if(names)a.textContent=t(...names);});
  close.setAttribute('aria-label',t('Schließen','Fermer'));
  switches.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.legalLanguage===language())));
  if(!dialog.open)return;
  title.textContent=t(...titles[selected]);content.replaceChildren();
  for(const p of window.FavoLegalContent[selected][language()]){const n=document.createElement(p.style.startsWith('Heading')?'h3':'p');n.textContent=p.text;content.append(n);}
 }
 function open(key){if(!titles[key])return;selected=key;opener=document.activeElement;if(!dialog.open)dialog.showModal();refresh();close.focus();}
 dialog.addEventListener('close',()=>opener?.focus());
 document.addEventListener('click',event=>{const link=event.target.closest('[data-legal]');if(!link)return;event.preventDefault();open(link.dataset.legal);});
 window.FavoLegal={open,refresh};refresh();
})();
