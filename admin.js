/* Only the publishable key is used. RLS is the authoritative access check. */
(() => {
  'use strict';
  const COLUMNS = 'id,name,description_de,description_fr,price_50,price_60,price_70,stock,image_url,color_mode,active';
  const $ = id => document.getElementById(id);
  const config = window.FAVO_SUPABASE;
  let client, authorized = false, busy = false, editing = null, rows = [], previewURL;
  const status = (message, error = false) => { $('adminStatus').textContent = message; $('adminStatus').dataset.error = String(error); };
  function locked(value) {
    busy = value;
    $('adminFields').disabled = value;
    $('adminProducts').querySelectorAll('button').forEach(b => b.disabled = value);
    $('adminReload').disabled = value;
    $('adminLogout').disabled = value;
  }
  function setAccess(allowed) {
    authorized = allowed;
    $('adminWorkspace').hidden = !allowed;
    $('adminLogin').hidden = allowed;
    if (!allowed) { rows = []; $('adminProducts').replaceChildren(); reset(); }
  }
  function preview(url) {
    const target = $('adminImagePreview'); target.replaceChildren();
    if (!url) { target.textContent = 'Kein neues Bild ausgewählt'; return; }
    try {
      const parsed = new URL(url, location.href);
      if (!['https:', 'http:', 'blob:'].includes(parsed.protocol)) return;
      const image = document.createElement('img'); image.src = parsed.href; image.alt = 'Produktbild Vorschau'; target.append(image);
    } catch { target.textContent = 'Bild kann nicht angezeigt werden.'; }
  }
  function reset() {
    editing = null; $('adminProductForm').reset(); $('adminEditTitle').textContent = 'Neues Produkt';
    if (previewURL) URL.revokeObjectURL(previewURL);
    previewURL = null; preview(null);
  }
  async function requireAdmin() {
    const { data, error } = await client.auth.getUser();
    const check = !error && data.user ? await client.rpc('is_favo_admin') : {data:false};
    if (check.error || check.data !== true) { setAccess(false); throw new Error('Dieses Konto hat keine Admin-Berechtigung. Bitte mit dem berechtigten Admin-Konto anmelden.'); }
    return data.user;
  }
  async function load() {
    await requireAdmin();
    const { data, error } = await client.from('Products').select(COLUMNS).order('id');
    if (error) throw error;
    rows = data; render();
  }
  function edit(p) {
    reset(); editing = p;
    $('adminEditTitle').textContent = 'Produkt bearbeiten';
    $('adminName').value = p.name;
    $('adminDescriptionDe').value = p.description_de || '';
    $('adminDescriptionFr').value = p.description_fr || '';
    for (const size of ['50','60','70']) $('adminPrice' + size).value = p['price_' + size] ?? '';
    $('adminStock').value = p.stock ?? '';
    $('adminActive').checked = p.active === true;
    $('adminColorMode').value = p.color_mode;
    preview(p.image_url);
    $('adminName').focus();
  }
  function render() {
    const target = $('adminProducts'); target.replaceChildren();
    for (const p of rows) {
      const item = document.createElement('div'); item.className = 'admin-product';
      const info = document.createElement('div'); const name = document.createElement('b'); name.textContent = p.name;
      const detail = document.createElement('small'); detail.textContent = `${p.active ? 'Aktiv' : 'Inaktiv'} · ${p.stock === null ? 'Print on Demand' : 'Bestand: ' + p.stock}`;
      info.append(name, detail);
      const actions = document.createElement('div'); actions.className = 'admin-actions';
      const change = document.createElement('button'); change.type = 'button'; change.textContent = 'Bearbeiten'; change.onclick = () => { if (!busy) edit(p); };
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Löschen'; remove.className = 'danger';
      remove.onclick = () => removeProduct(p);
      actions.append(change, remove); item.append(info, actions); target.append(item);
    }
  }
  async function refreshShop() { if (typeof loadCatalog === 'function') await loadCatalog(); }
  async function removeProduct(p) {
    if (busy || !confirm(`„${p.name}“ endgültig aus dem Produktkatalog löschen?`)) return;
    locked(true);
    try {
      await requireAdmin();
      const {data, error} = await client.from('Products').delete().eq('id', p.id).select('id');
      if (error) throw error;
      if (!data.length) throw new Error('Produkt wurde nicht gelöscht. Bitte Liste aktualisieren.');
      if (editing?.id === p.id) reset();
      await load(); await refreshShop(); status('Produkt gelöscht. Vorhandene Bilddateien bleiben erhalten.');
    } catch (e) { status(e.message, true); } finally { locked(false); }
  }
  function number(id, integer = false) {
    const value = $(id).value.trim();
    if (value === '') return null;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || (integer && !Number.isSafeInteger(n))) throw new Error('Bitte gültige, nicht negative Preise und ganze Lagerbestände eingeben.');
    return n;
  }
  function validateFile(file) {
    if (file && (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024)) throw new Error('Bitte JPG, PNG oder WebP bis 5 MB auswählen.');
  }
  $('adminImage').addEventListener('change', () => {
    try {
      const file = $('adminImage').files[0]; validateFile(file);
      if (previewURL) URL.revokeObjectURL(previewURL);
      previewURL = file ? URL.createObjectURL(file) : null;
      $('adminRemoveImage').checked = false; preview(previewURL || editing?.image_url);
    } catch (e) { $('adminImage').value = ''; status(e.message, true); }
  });
  $('adminProductForm').addEventListener('submit', async event => {
    event.preventDefault(); if (busy || !authorized) return;
    locked(true); let uploaded = null, saved = false;
    try {
      const user = await requireAdmin();
      const values = {
        name: $('adminName').value.trim(), description_de: $('adminDescriptionDe').value.trim(),
        description_fr: $('adminDescriptionFr').value.trim() || null,
        price_50: number('adminPrice50'), price_60: number('adminPrice60'), price_70: number('adminPrice70'),
        stock: number('adminStock', true), active: $('adminActive').checked, color_mode: $('adminColorMode').value,
        image_url: $('adminRemoveImage').checked ? null : editing?.image_url || null
      };
      if (!values.name || !values.description_de) throw new Error('Produktname und deutsche Beschreibung sind erforderlich.');
      const file = $('adminImage').files[0]; validateFile(file);
      if (file && !$('adminRemoveImage').checked) {
        const extension = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[file.type];
        const path = `${user.id}/${crypto.randomUUID()}.${extension}`;
        status('Bild wird hochgeladen …');
        const {error} = await client.storage.from('product-images').upload(path, file, {contentType:file.type, upsert:false});
        if (error) throw error;
        uploaded = path;
        values.image_url = client.storage.from('product-images').getPublicUrl(path).data.publicUrl;
      }
      status('Produkt wird gespeichert …');
      const query = editing ? client.from('Products').update(values).eq('id', editing.id) : client.from('Products').insert(values);
      const {data, error} = await query.select('id');
      if (error) throw error;
      if (!data.length) throw new Error('Keine Änderung gespeichert. Bitte Liste aktualisieren.');
      saved = true; reset();
      await load(); await refreshShop(); status('Produkt gespeichert. Der Shop wurde aktualisiert.');
    } catch (e) {
      // Keep an uploaded file on uncertain network outcomes; a successful commit may reference it.
      status((saved ? 'Gespeichert, aber Aktualisierung fehlgeschlagen: ' : 'Speichern fehlgeschlagen: ') + e.message + (uploaded && !saved ? ' Das hochgeladene Bild bleibt zur Sicherheit im Speicher; vor erneutem Speichern die Liste aktualisieren.' : ''), true);
    } finally { locked(false); }
  });
  $('adminNew').onclick = () => { if (!busy) { reset(); status('Neues Produkt'); } };
  $('adminReload').onclick = async () => { if (busy) return; locked(true); try { await load(); status('Liste aktualisiert.'); } catch(e) { status(e.message,true); } finally { locked(false); } };
  $('openAdmin').onclick = () => { $('adminModal').classList.add('open'); (authorized ? $('adminName') : $('adminEmail')).focus(); };
  document.querySelectorAll('[data-close-admin]').forEach(b => b.onclick = () => { $('adminModal').classList.remove('open'); $('openAdmin').focus(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !busy) $('adminModal').classList.remove('open'); });
  $('adminLogin').addEventListener('submit', async event => {
    event.preventDefault(); if (busy || !client) return;
    const button = $('adminLogin').querySelector('button'); button.disabled = true; busy = true;
    try {
      const {data, error} = await client.auth.signInWithPassword({email:$('adminEmail').value.trim(), password:$('adminPassword').value});
      $('adminPassword').value = '';
      if (error) throw new Error('Anmeldung fehlgeschlagen. Bitte E-Mail und Passwort prüfen.');
      try { await requireAdmin(); } catch(e) { await client.auth.signOut({scope:'local'}); throw e; }
      setAccess(true); await load(); status('Angemeldet. Änderungen werden online gespeichert.');
    } catch(e) { setAccess(false); status(e.message,true); } finally { busy = false; button.disabled = false; }
  });
  $('adminLogout').onclick = async () => {
    if (busy) return;
    const {error} = await client.auth.signOut({scope:'local'});
    if (error) { status('Abmeldung fehlgeschlagen: ' + error.message,true); return; }
    setAccess(false); status('Abgemeldet.');
  };
  async function init() {
    try {
      if (!window.supabase) throw new Error('Anmeldung konnte nicht geladen werden. Bitte Seite neu laden.');
      client = window.supabase.createClient(config.url, config.publishableKey, {auth:{persistSession:true, autoRefreshToken:true, detectSessionInUrl:false, storage:sessionStorage}});
      client.auth.onAuthStateChange((event, session) => { if (!session || event === 'SIGNED_OUT') setAccess(false); });
      const {data} = await client.auth.getSession();
      if (data.session) { await requireAdmin(); setAccess(true); await load(); status('Angemeldet.'); }
      else status('Bitte mit deinem bestehenden Admin-Konto anmelden.');
    } catch(e) { setAccess(false); status(e.message,true); }
  }
  init();
})();
