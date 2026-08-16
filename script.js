
let cart=[], horse='schwarz', horseLabel='Schwarz', base='schwarz', baseLabel='Schwarz', payment='TWINT';
const price=34.90;
const horseModal=document.getElementById('horseModal'), drawer=document.getElementById('cartDrawer'), checkout=document.getElementById('checkoutModal'), toast=document.getElementById('toast');

document.querySelectorAll('.heart').forEach(b=>b.onclick=()=>b.textContent=b.textContent==='♡'?'♥':'♡');
document.querySelector('.horse-configure').onclick=()=>horseModal.classList.add('open');
document.querySelectorAll('[data-close-horse]').forEach(x=>x.onclick=()=>horseModal.classList.remove('open'));
document.querySelectorAll('[data-close-cart]').forEach(x=>x.onclick=()=>drawer.classList.remove('open'));
document.querySelectorAll('[data-close-checkout]').forEach(x=>x.onclick=()=>checkout.classList.remove('open'));

function updateHorse(){
 document.getElementById('horsePreview').src=`assets/cavallo-${horse}-${base}.png`;
 document.getElementById('horseColorName').textContent=horseLabel;
 document.getElementById('baseColorName').textContent=baseLabel;
 const s=document.getElementById('horseSize').value;
 document.getElementById('chosenPreview').textContent=`Pferd ${horseLabel} · Sockel ${baseLabel}`;
 document.getElementById('horseSummary').textContent=`Pferd: ${horseLabel} · Sockel: ${baseLabel} · ${s}`;
}
document.querySelectorAll('#horseColors button').forEach(b=>b.onclick=()=>{document.querySelectorAll('#horseColors button').forEach(x=>x.classList.remove('active'));b.classList.add('active');horse=b.dataset.key;horseLabel=b.dataset.label;updateHorse()});
document.querySelectorAll('#baseColors button').forEach(b=>b.onclick=()=>{document.querySelectorAll('#baseColors button').forEach(x=>x.classList.remove('active'));b.classList.add('active');base=b.dataset.key;baseLabel=b.dataset.label;updateHorse()});
document.getElementById('horseSize').onchange=updateHorse;

document.getElementById('horseAdd').onclick=()=>{
 cart.push({name:'Cavallo',horse,horseLabel,base,baseLabel,size:document.getElementById('horseSize').value,price});
 horseModal.classList.remove('open'); renderCart(); drawer.classList.add('open'); toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),1400);
};
document.getElementById('openCart').onclick=()=>drawer.classList.add('open');

function renderCart(){
 document.getElementById('cartCount').textContent=cart.length;
 const wrap=document.getElementById('cartItems');
 wrap.innerHTML=cart.length?cart.map((x,i)=>`<div class="cart-line"><img src="assets/cavallo-${x.horse}-${x.base}.png"><div><b>${x.name}</b><small>Pferd: ${x.horseLabel}</small><small>Sockel: ${x.baseLabel}</small><small>Grösse: ${x.size}</small></div><div><b>CHF ${x.price.toFixed(2)}</b><button class="remove" onclick="removeItem(${i})">Entfernen</button></div></div>`).join(''):'<p class="empty">Dein Warenkorb ist noch leer.</p>';
 const total=cart.reduce((a,x)=>a+x.price,0);
 document.getElementById('cartTotal').textContent=`CHF ${total.toFixed(2)}`;
 document.getElementById('toCheckout').disabled=!cart.length;
}
window.removeItem=i=>{cart.splice(i,1);renderCart()};
document.getElementById('toCheckout').onclick=()=>{
 drawer.classList.remove('open');checkout.classList.add('open');
 document.getElementById('checkoutItems').innerHTML=cart.map(x=>`<p><b>${x.name}</b><br>Pferd ${x.horseLabel} · Sockel ${x.baseLabel} · ${x.size}</p>`).join('');
 document.getElementById('checkoutTotal').textContent=`CHF ${cart.reduce((a,x)=>a+x.price,0).toFixed(2)}`;
};
document.querySelectorAll('.payment').forEach(b=>b.onclick=()=>{document.querySelectorAll('.payment').forEach(x=>x.classList.remove('active'));b.classList.add('active');payment=b.dataset.pay});
document.getElementById('placeOrder').onclick=()=>{
 const ids=['firstName','lastName','email','street','zip','city'];
 if(ids.some(id=>!document.getElementById(id).value.trim())){alert('Bitte fülle zuerst die Lieferadresse aus.');return;}
 const no='FW-'+Math.floor(100000+Math.random()*900000);
 alert(`Testbestellung ${no} erstellt.\nZahlungsart: ${payment}\n\nEs wurde keine echte Zahlung ausgelöst.`);
 cart=[];renderCart();checkout.classList.remove('open');
};
renderCart();updateHorse();
