/* Supabase-backed catalog; existing markup and configurators retain their design. */
let catalogProducts = [];
let catalogReady = false;
const catalogTemplates = new Map([...document.querySelectorAll('#shop .product')]
  .map(card => [card.querySelector('h3').textContent, card]));
const catalogBindings = {
  Cavallo: { size: 'horseSize', update: () => updateHorse() },
  'Hoodie Drache': { size: 'hoodieSize', update: () => updateHoodie() },
  'Zen Schildkröte': { size: 'zenSize', update: () => updateZen() },
  'Pika Urban': { size: 'pikaSize', update: () => updatePika() }
};
const catalogOriginalNames = {1:'Cavallo',2:'Hoodie Drache',3:'Scheiben',4:'Zen Schildkröte',5:'Pika Urban',6:'Frugo',7:'Papa Sch.'};
const catalogSizes = ['50', '60', '70'];
function escapeCatalogText(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function catalogPrice(p, size) {
  const value = p['price_' + size];
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
function catalogImage(value, fallback = '') {
  if (!value) return fallback;
  try {
    const url = new URL(value, location.href);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : fallback;
  } catch { return fallback; }
}
function catalogText(de, fr) { return document.documentElement.lang === 'fr' ? fr : de; }
function addCatalogItem(item) {
  const p = catalogProducts.find(p => p.name === item.name || catalogOriginalNames[p.id] === item.name);
  const size = item.size === 'Feste Grösse' ? '50' : item.size.split(' ')[0];
  const amount = p && catalogPrice(p, size);
  const count = p ? cart.filter(x => x.productId === p.id).length : 0;
  if (!catalogReady || !p || amount === null || (p.stock !== null && count >= Number(p.stock))) {
    alert(catalogText('Dieses Produkt ist in dieser Auswahl nicht verfügbar.', 'Ce produit n’est pas disponible dans cette configuration.'));
    return false;
  }
  cart.push({...item, name:p.name, productId:p.id, price:amount});
  return true;
}
function configureCatalogSizes(p) {
  const binding = catalogBindings[catalogOriginalNames[p.id]];
  if (!binding) return;
  const select = document.getElementById(binding.size);
  for (const option of select.options) {
    if (option.value === 'custom') continue;
    const amount = catalogPrice(p, option.value);
    option.disabled = amount === null;
    option.hidden = amount === null;
    option.dataset.price = amount === null ? '' : amount;
    option.textContent = option.value + ' cm' + (amount === null ? '' : ' — CHF ' + amount.toFixed(2));
  }
  select.value = [...select.options].find(o => !o.disabled)?.value || 'custom';
  binding.update();
}
function openCatalogSimple(p, image) {
  simpleProduct = p.name;
  simpleImage = image;
  simplePrices = catalogSizes.map(size => catalogPrice(p, size));
  simpleHasColor = p.color_mode === 'einfarbig';
  simpleColor = 'Petrol';
  document.getElementById('simpleTitle').textContent = p.name;
  document.getElementById('simpleImage').src = image;
  document.getElementById('simpleColorBlock').style.display = simpleHasColor ? 'block' : 'none';
  document.getElementById('simpleColorName').textContent = simpleColor;
  const select = document.getElementById('simpleSize');
  for (const option of select.options) {
    if (option.value === 'custom') continue;
    const i = Number(option.value), amount = simplePrices[i];
    option.disabled = amount === null;
    option.hidden = amount === null;
    option.textContent = catalogSizes[i] + ' cm' + (amount === null ? '' : ' — CHF ' + amount.toFixed(2));
  }
  select.value = [...select.options].find(o => !o.disabled)?.value || 'custom';
  document.querySelectorAll('#simpleColors button').forEach((x,i) => x.classList.toggle('active',i===0));
  updateSimple();
  simpleModal.classList.add('open');
}
function refreshCatalogLanguage() {
  for (const card of document.querySelectorAll('[data-catalog-id]')) {
    const p = catalogProducts.find(p => String(p.id) === card.dataset.catalogId);
    if (!p) continue;
    card.querySelector('.catalog-description').textContent = document.documentElement.lang === 'fr'
      ? p.description_fr || p.description_de || '' : p.description_de || '';
    const badge = card.querySelector('.badge');
    badge.textContent = p.stock === null ? catalogText('Print on Demand','Impression à la demande')
      : Number(p.stock) > 0 ? catalogText('Auf Lager · ','En stock · ') + p.stock
      : catalogText('Ausverkauft','Épuisé');
  }
  window.Favo3D?.refreshLanguage();
}
function renderCatalog() {
  const grid = document.getElementById('productGrid');
  document.querySelectorAll('#shop .product').forEach(card => {card.hidden = true;});
  document.querySelectorAll('.catalog-generated').forEach(card => card.remove());
  for (const p of catalogProducts) {
    let card = catalogTemplates.get(catalogOriginalNames[p.id]);
    const existing = !!card;
    if (!card) {
      card = document.createElement('article');
      card.className = 'product catalog-generated';
      // Only static markup enters innerHTML. Database values use textContent.
      card.innerHTML = '<div class="product-media"><span class="badge demand"></span><img alt=""></div><h3></h3><strong></strong><div class="stars"><small></small></div><button class="hoodie-configure" type="button">Konfigurieren</button>';
      grid.appendChild(card);
    }
    card.dataset.catalogId = p.id;
    card.querySelector('h3').textContent = p.name;
    const image = card.querySelector('.product-media img');
    if (!image.dataset.originalSrc) image.dataset.originalSrc = image.getAttribute('src') || 'assets/logo-reference.png';
    const fallback = existing ? image.dataset.originalSrc : 'assets/logo-reference.png';
    const src = catalogImage(p.image_url, fallback);
    image.src = src;
    image.alt = p.name;
    image.onerror = () => { image.onerror = null; image.src = fallback; };
    const prices = catalogSizes.map(size => catalogPrice(p,size)).filter(n => n !== null);
    card.querySelector('strong').textContent = prices.length
      ? (prices.length > 1 ? 'ab ' : '') + 'CHF ' + Math.min(...prices).toFixed(2)
      : catalogText('Preis auf Anfrage','Prix sur demande');
    let description = card.querySelector('.catalog-description');
    if (!description) {
      description = document.createElement('p');
      description.className = 'catalog-description';
      card.querySelector('h3').after(description);
    }
    card.querySelector('.badge').className = 'badge ' + (p.stock === null ? 'demand' : 'stock');
    configureCatalogSizes(p);
    const button = card.querySelector('button:not(.heart):not(.product-3d-open)');
    button.disabled = p.stock !== null && Number(p.stock) <= 0;
    if (!catalogBindings[catalogOriginalNames[p.id]] && catalogOriginalNames[p.id] !== 'Scheiben') {
      // Replace the legacy button to remove its hard-coded price listener.
      const replacement = button.cloneNode(true);
      button.replaceWith(replacement);
      replacement.addEventListener('click', () => openCatalogSimple(p, src));
    }
    window.Favo3D?.attachButton(card, p, src);
    card.hidden = false;
  }
  refreshCatalogLanguage();
}
window.refreshCatalogLanguage = refreshCatalogLanguage;
async function loadCatalog() {
  const status = document.getElementById('catalogStatus');
  const retry = document.getElementById('catalogRetry');
  const grid = document.getElementById('productGrid');
  catalogReady = false;
  grid.setAttribute('aria-busy','true');
  retry.hidden = true;
  status.hidden = false;
  status.textContent = catalogText('Produkte werden geladen …','Chargement des produits …');
  document.querySelectorAll('#shop .product').forEach(card => {card.hidden = true;});
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const config = window.FAVO_SUPABASE;
    const url = new URL('/rest/v1/Products', config.url);
    // Production model URLs are deliberately never requested by the storefront.
    url.searchParams.set('select','id,name,description_de,description_fr,price_50,price_60,price_70,stock,image_url,color_mode,active,glb_path');
    url.searchParams.set('active','eq.true');
    url.searchParams.set('order','id.asc');
    const response = await fetch(url, {headers:{apikey:config.publishableKey}, signal:controller.signal, cache:'no-store'});
    if (!response.ok) throw new Error('Catalog HTTP ' + response.status);
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error('Invalid catalog response');
    catalogProducts = rows.filter(p => p.active === true);
    renderCatalog();
    catalogReady = true;
    status.textContent = catalogText('Aktuell sind keine Produkte verfügbar.','Aucun produit disponible pour le moment.');
    status.hidden = catalogProducts.length > 0;
  } catch (error) {
    console.error('Produktkatalog konnte nicht geladen werden:', error.message);
    status.textContent = catalogText('Produkte konnten nicht geladen werden. Bitte versuche es erneut.','Impossible de charger les produits. Veuillez réessayer.');
    retry.hidden = false;
  } finally {
    clearTimeout(timeout);
    grid.setAttribute('aria-busy','false');
  }
}
document.getElementById('catalogRetry').addEventListener('click', loadCatalog);
loadCatalog();
