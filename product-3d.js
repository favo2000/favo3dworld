/* Separate, on-demand GLB preview. Never accesses model_url or private storage. */
(() => {
  'use strict';
  const MAX_BYTES = 25 * 1024 * 1024;
  const PATH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.glb$/;
  const text = (de, fr) => document.documentElement.lang === 'fr' ? fr : de;
  let library, dialog, viewer, message, controls, opener, generation = 0, timer;
  let state = 'loading', productName = '', graphicsSupported;

  function canRender() {
    if (graphicsSupported === undefined) {
      try {
        const context = document.createElement('canvas').getContext('webgl2');
        graphicsSupported = !!context;
        context?.getExtension('WEBGL_lose_context')?.loseContext();
      } catch { graphicsSupported = false; }
    }
    return graphicsSupported;
  }

  function url(path) {
    if (typeof path !== 'string' || !PATH.test(path)) return null;
    return new URL('/storage/v1/object/public/product-glb/' + path, window.FAVO_SUPABASE.url).href;
  }

  async function validateFile(file) {
    if (!file || !/\.glb$/i.test(file.name) || file.size < 20 || file.size > MAX_BYTES) {
      throw new Error('Bitte eine GLB-Datei bis 25 MB auswählen. 3MF-Dateien sind hier nicht erlaubt.');
    }
    const header = new DataView(await file.slice(0, 20).arrayBuffer());
    const jsonLength = header.getUint32(12, true);
    if (header.getUint32(0, true) !== 0x46546c67 || header.getUint32(4, true) !== 2 ||
        header.getUint32(8, true) !== file.size || header.getUint32(16, true) !== 0x4e4f534a ||
        jsonLength % 4 !== 0 || jsonLength < 4 || jsonLength > 8 * 1024 * 1024 || jsonLength + 20 > file.size) {
      throw new Error('Ungültige GLB-Datei. Bitte als binäres glTF 2.0 (.glb) exportieren.');
    }
    let model;
    try { model = JSON.parse(await file.slice(20, 20 + jsonLength).text()); }
    catch { throw new Error('Die GLB-Datei enthält keine gültige Modellbeschreibung.'); }
    if (model.asset?.version !== '2.0' || !Array.isArray(model.scenes) || !model.scenes.length ||
        !Array.isArray(model.meshes) || !model.meshes.length) {
      throw new Error('Die GLB-Datei muss ein glTF-2.0-Modell mit einer Szene und Geometrie enthalten.');
    }
    // Only self-contained GLBs: no external texture/buffer URLs, including private source files.
    function hasURI(value) {
      if (!value || typeof value !== 'object') return false;
      return Object.entries(value).some(([key, entry]) => key === 'uri' || hasURI(entry));
    }
    if (hasURI(model)) throw new Error('Bitte Texturen und Geometrie vollständig in die GLB-Datei einbetten; externe Dateiverweise sind nicht erlaubt.');
    let offset = 20 + jsonLength;
    let hasBinary = false;
    while (offset < file.size) {
      if (offset + 8 > file.size) throw new Error('Die GLB-Datei ist unvollständig.');
      const chunk = new DataView(await file.slice(offset, offset + 8).arrayBuffer());
      const length = chunk.getUint32(0, true);
      if (length % 4 !== 0 || offset + 8 + length > file.size) throw new Error('Die GLB-Datei ist unvollständig.');
      if (chunk.getUint32(4, true) === 0x004e4942 && length > 0) hasBinary = true;
      offset += 8 + length;
    }
    if (!hasBinary) throw new Error('In der GLB-Datei fehlen eingebettete Modelldaten.');
  }

  function loadLibrary() {
    if (customElements.get('model-viewer')) return Promise.resolve();
    if (!library) library = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.type = 'module';
      script.src = 'https://cdn.jsdelivr.net/npm/@google/model-viewer@4.3.1/dist/model-viewer.min.js';
      script.crossOrigin = 'anonymous';
      script.integrity = 'sha384-cprcVQt7wbUl0xngF3PGP6yBB7n4/t+4AoAMG9biiMCGFiWOdzUH10Ie2COTqFNW';
      const timeout = setTimeout(() => finish(new Error('3D viewer timeout')), 20000);
      function finish(error) {
        clearTimeout(timeout);
        script.onload = script.onerror = null;
        if (error) { script.remove(); reject(error); } else resolve();
      }
      script.onload = () => customElements.get('model-viewer') ? finish() : finish(new Error('3D viewer missing'));
      script.onerror = () => finish(new Error('3D viewer unavailable'));
      document.head.append(script);
    }).catch(error => { library = null; throw error; });
    return library;
  }

  function refreshLanguage() {
    document.querySelectorAll('.product-3d-open').forEach(button => {
      button.textContent = text('3D ansehen', 'Voir en 3D');
    });
    if (!dialog) return;
    dialog.querySelector('h2').textContent = productName + text(' · 3D-Ansicht', ' · Vue 3D');
    dialog.querySelector('.product-3d-close').textContent = text('Schliessen', 'Fermer');
    dialog.querySelector('.product-3d-help').textContent = text(
      'Ziehen zum Drehen · Mausrad oder zwei Finger zum Zoomen. Die 3D-Vorschau ändert keine Farb- oder Grössenauswahl.',
      'Glissez pour tourner · Molette ou deux doigts pour zoomer. La vue 3D ne change ni les couleurs ni la taille choisies.');
    dialog.querySelector('[data-zoom="in"]').setAttribute('aria-label', text('Vergrössern', 'Agrandir'));
    dialog.querySelector('[data-zoom="out"]').setAttribute('aria-label', text('Verkleinern', 'Réduire'));
    dialog.querySelector('[data-reset]').textContent = text('Ansicht zurücksetzen', 'Réinitialiser la vue');
    const messages = {
      loading: ['3D-Modell wird geladen …', 'Chargement du modèle 3D …'],
      ready: ['3D-Modell bereit.', 'Modèle 3D prêt.'],
      unsupported: ['Dieser Browser unterstützt die 3D-Darstellung nicht. Bitte einen Browser mit WebGL 2 verwenden. Produktbild und Konfigurator bleiben verfügbar.', 'Ce navigateur ne prend pas en charge la vue 3D. Utilisez un navigateur avec WebGL 2. La photo et le configurateur restent disponibles.'],
      error: ['Die 3D-Ansicht ist momentan nicht verfügbar. Das Produktbild und der Konfigurator bleiben nutzbar.', 'La vue 3D est indisponible. La photo et le configurateur restent disponibles.']
    };
    message.textContent = text(...messages[state]);
    if (viewer) viewer.alt = productName + text(' – interaktives 3D-Modell', ' – modèle 3D interactif');
  }

  function buildDialog() {
    if (dialog) return;
    dialog = document.createElement('dialog');
    dialog.className = 'product-3d-dialog';
    dialog.setAttribute('aria-labelledby', 'product3dTitle');
    // Static markup only; all product data uses textContent or validated URL attributes.
    dialog.innerHTML = '<header><h2 id="product3dTitle"></h2><button type="button" class="product-3d-close"></button></header><p class="product-3d-help"></p><p class="product-3d-status" role="status" aria-live="polite"></p><div class="product-3d-stage"></div><div class="product-3d-controls"><button type="button" data-zoom="in">＋</button><button type="button" data-zoom="out">−</button><button type="button" data-reset></button></div>';
    document.body.append(dialog);
    message = dialog.querySelector('.product-3d-status');
    controls = dialog.querySelector('.product-3d-controls');
    dialog.querySelector('.product-3d-close').onclick = () => dialog.close();
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener('close', () => {
      if (dialog.open) return;
      generation++; clearTimeout(timer);
      if (viewer) { viewer.removeAttribute('src'); viewer.remove(); viewer = null; }
      document.documentElement.classList.remove('product-3d-is-open');
      if (opener?.isConnected) opener.focus();
    });
    controls.addEventListener('click', event => {
      if (!viewer || state !== 'ready') return;
      const button = event.target.closest('button');
      if (button?.hasAttribute('data-reset')) {
        viewer.cameraOrbit = '0deg 75deg 105%'; viewer.fieldOfView = '30deg';
      } else if (button?.dataset.zoom) {
        const orbit = viewer.getCameraOrbit();
        viewer.cameraOrbit = `${orbit.theta}rad ${orbit.phi}rad ${orbit.radius * (button.dataset.zoom === 'in' ? 0.8 : 1.25)}m`;
      }
    });
  }

  async function open(product, poster, sourceButton) {
    const src = url(product.glb_path);
    if (!src) return;
    buildDialog();
    if (dialog.open) dialog.close();
    clearTimeout(timer);
    if (viewer) { viewer.removeAttribute('src'); viewer.remove(); viewer = null; }
    const current = ++generation;
    productName = product.name; opener = sourceButton; state = 'loading';
    controls.hidden = true; refreshLanguage();
    dialog.showModal(); document.documentElement.classList.add('product-3d-is-open');
    if (!canRender()) { state = 'unsupported'; refreshLanguage(); return; }
    function failed() {
      if (current !== generation || !dialog.open) return;
      clearTimeout(timer); state = 'error'; controls.hidden = true; refreshLanguage();
    }
    try {
      await loadLibrary();
      if (current !== generation || !dialog.open) return;
      viewer = document.createElement('model-viewer');
      viewer.setAttribute('camera-controls', '');
      viewer.setAttribute('touch-action', 'none');
      viewer.setAttribute('disable-pan', '');
      viewer.setAttribute('interaction-prompt', 'none');
      viewer.setAttribute('camera-orbit', '0deg 75deg 105%');
      viewer.setAttribute('min-camera-orbit', 'auto 0deg 20%');
      viewer.setAttribute('max-camera-orbit', 'auto 180deg 300%');
      viewer.setAttribute('shadow-intensity', '1');
      viewer.setAttribute('loading', 'eager');
      viewer.setAttribute('reveal', 'auto');
      viewer.setAttribute('aria-describedby', 'product3dTitle');
      if (poster) {
        try { const image = new URL(poster, location.href); if (['https:', 'http:'].includes(image.protocol)) viewer.setAttribute('poster', image.href); } catch {}
      }
      viewer.addEventListener('load', () => {
        if (current !== generation || !dialog.open) return;
        clearTimeout(timer); state = 'ready'; controls.hidden = false; refreshLanguage();
      }, {once:true});
      viewer.addEventListener('error', failed);
      timer = setTimeout(failed, 45000);
      viewer.src = src;
      dialog.querySelector('.product-3d-stage').replaceChildren(viewer);
      refreshLanguage();
    } catch { failed(); }
  }

  function attachButton(card, product, poster) {
    card.querySelector('.product-3d-open')?.remove();
    if (!url(product.glb_path)) return;
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'product-3d-open';
    button.textContent = text('3D ansehen', 'Voir en 3D');
    button.setAttribute('aria-haspopup', 'dialog');
    button.onclick = () => open(product, poster, button);
    card.append(button);
  }
  window.Favo3D = Object.freeze({url, validateFile, attachButton, refreshLanguage, open});
})();
