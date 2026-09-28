const {JSDOM}=require('jsdom'),fs=require('node:fs'),assert=require('node:assert/strict');
const read=p=>fs.readFileSync(p,'utf8');
for(const width of [390,1440]){
 const dom=new JSDOM(read('index.html'),{url:'https://shop.example.test',runScripts:'outside-only'}),w=dom.window;
 Object.defineProperty(w,'innerWidth',{value:width});
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 w.translatePage=lang=>{w.document.documentElement.lang=lang;w.localStorage.setItem('favoLang',lang);w.FavoLegal.refresh();};
 w.eval(read('legal-content.js'));w.eval(read('legal.js'));
 for(const lang of ['de','fr']){
  w.translatePage(lang);
  for(const key of ['agb','privacy','imprint']){
   const link=w.document.querySelector('footer [data-legal='+key+']');assert.ok(link);link.focus();link.click();
   const dialog=w.document.getElementById('legalDialog');assert.equal(dialog.open,true);
   const actual=[...dialog.querySelector('article').children].map(p=>p.textContent);
   assert.deepEqual(actual,Array.from(w.FavoLegalContent[key][lang],p=>p.text));
   assert.doesNotMatch(dialog.textContent,/Arbeitsentwurf|noch nicht veröffentlichen/);
   dialog.querySelector('.x').click();assert.equal(dialog.open,false);assert.equal(w.document.activeElement,link);
  }
 }
 w.FavoLegal.open('privacy');w.document.querySelector('[data-legal-language=de]').click();assert.equal(w.localStorage.getItem('favoLang'),'de');
 w.document.querySelector('[data-legal-language=fr]').click();assert.equal(w.document.querySelector('[data-legal-language=fr]').getAttribute('aria-pressed'),'true');
 assert.match(w.FavoLegalContent.photo.de[3].text,/freiwillig und keine Voraussetzung/);
 assert.match(w.FavoLegalContent.photo.fr[3].text,/facultatif et n’est pas une condition/);
 dom.window.close();
}
console.log('PASS legal DOM: all supplied DE/FR paragraphs, footer links, modal close/focus, language switching; 390/1440 viewport state (no visual layout test).');
