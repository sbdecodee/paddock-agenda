/* ShareMoments: front-end only, non-invasive. */
(() => {
  if (typeof window !== 'undefined') {
    if (window.__shareMomentsLoaded) return; // prevent double-loads
    window.__shareMomentsLoaded = true;
  }
  const NS = 'sm';
  const CSS_ID = 'share-moments-styles';
  // Allow overriding API via global (for Google Apps Script or custom backends)
  const API_BASE = (typeof window !== 'undefined' && window.SM_API_BASE) ? window.SM_API_BASE : '/api/moments';
  const IS_APPS_SCRIPT = /script\.googleusercontent\.com|script\.google\.com/.test(String(API_BASE));
  const ASSETS_BASE = '/assets/moments';
  const POLL_MS = 15000;

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn, { once: true });
  }

  function injectStyles() {
    if (document.getElementById(CSS_ID)) return;
    const style = document.createElement('style');
    style.id = CSS_ID;
    style.textContent = `
      :root { --brand-blue: var(--brand-blue, #0b5bd3); --brand-red: var(--brand-red, #e02020); }
      .${NS}-btn { display:inline-flex; align-items:center; gap:.5rem; padding:.5rem .75rem; border:1px solid #ccc; border-radius:999px; background:#fff; cursor:pointer; font:inherit; }
      .${NS}-btn:hover { background:#f7f7f7; }
      .${NS}-panel { box-sizing:border-box; margin:32px 0 32px 0; padding:28px 0 0 0; border-top:2px solid var(--brand-red, #e02020); }
      @media (max-width: 640px){ .${NS}-panel { margin:28px 0 28px 0; padding-top:28px; } }
      .${NS}-panel h2 { margin:0 0 .5rem 0; }
      .${NS}-actions { display:flex; flex-wrap:wrap; gap:.5rem; align-items:center; margin-bottom:1rem; }
      .${NS}-hidden { position:absolute; left:-9999px; width:1px; height:1px; overflow:hidden; }
      .${NS}-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:.5rem; }
      .${NS}-item { position:relative; background:#f2f2f2; border-radius:8px; overflow:hidden; }
      .${NS}-item img { width:100%; height:160px; object-fit:cover; display:block; }
      .${NS}-overlay { position:absolute; inset:0; display:flex; justify-content:flex-end; gap:.25rem; padding:.25rem; opacity:0; transition:opacity .2s; background:linear-gradient(to bottom, rgba(0,0,0,.15), rgba(0,0,0,0)); pointer-events:none; }
      .${NS}-item:hover .${NS}-overlay { opacity:1; }
      .${NS}-iconbtn { display:inline-flex; align-items:center; justify-content:center; width:36px; height:36px; background:rgba(0,0,0,.45); color:#fff !important; text-decoration:none !important; border:none; border-radius:10px; padding:0; cursor:pointer; font-size:0; pointer-events:auto; box-shadow:0 2px 6px rgba(0,0,0,.25); }
      .${NS}-iconbtn svg { width:18px; height:18px; stroke:#fff; fill:none; stroke-width:2; }
      .${NS}-lightbox { position:fixed; inset:0; background:rgba(0,0,0,.8); display:none; align-items:center; justify-content:center; z-index:9999; }
      .${NS}-lightbox.open { display:flex; }
      .${NS}-lightbox img { max-width:90vw; max-height:90vh; border-radius:8px; }
      .${NS}-fixedbtn { position:fixed; bottom:1rem; right:1rem; z-index:999; }
      .${NS}-btn svg { width:18px; height:18px; }
      .${NS}-chooser { position:absolute; top:100%; right:0; background:#fff; border:1px solid #ddd; border-radius:10px; padding:.5rem; box-shadow:0 8px 24px rgba(0,0,0,.12); display:none; flex-direction:column; gap:.25rem; z-index:1000; }
      .${NS}-chooser.open { display:flex; }
      .${NS}-chooser button { border:none; background:#f6f6f6; padding:.5rem .75rem; border-radius:8px; cursor:pointer; display:flex; align-items:center; gap:.5rem; font:inherit; }
      .${NS}-chooser button:hover { background:#ececec; }
      .${NS}-headerwrap { display:inline-flex; align-items:center; position:relative; margin-left:.75rem; }
      .${NS}-bannerwrap { position:relative; display:block; width:100%; box-sizing:border-box; margin:28px 0 28px 0; grid-column:1/-1; flex:0 0 100%; align-self:stretch; }
      .${NS}-bannerwrap .${NS}-banner { display:block !important; width:100% !important; text-align:center !important; padding:12px 16px !important; border-radius:8px !important; border:0 !important; cursor:pointer; font:inherit; font-weight:500; letter-spacing:.2px; background:var(--brand-red, #e02020) !important; color:#ffffff !important; }
      .${NS}-bannerwrap .${NS}-banner:hover { filter:brightness(1.05); }
      /* ensure spacing: the element after the banner should not add extra top margin */
      .${NS}-bannerwrap + * { margin-top: 0 !important; }
      .${NS}-bannerwrap + * > :first-child { margin-top: 0 !important; }
      @media (max-width: 640px) {
        .${NS}-bannerwrap { margin-top: 20px !important; margin-bottom: 12px !important; }
      }
      .${NS}-action { background:var(--brand-red, #e02020); color:#fff; border:none; border-radius:14px; padding:.55rem .8rem; display:inline-flex; align-items:center; gap:.5rem; font-weight:600; box-shadow:0 4px 10px rgba(0,0,0,.12); }
      .${NS}-action svg { width:18px; height:18px; stroke:#fff; fill:none; stroke-width:2; }
    `;
    document.head.appendChild(style);
  }

  function buildUI() {
    const panel = document.createElement('section');
    panel.className = `${NS}-panel panel`;
    panel.dataset.smRole = 'panel';
    panel.setAttribute('aria-label', 'Comparte tu experiencia');
    panel.innerHTML = `
      <h2 id="${NS}-title">Momentos</h2>
      <div class="${NS}-actions">
        <input id="${NS}-file-camera" class="${NS}-hidden" type="file" accept="image/*" capture="environment" multiple>
        <input id="${NS}-file-gallery" class="${NS}-hidden" type="file" accept="image/*" multiple>
        <button type="button" class="${NS}-action" id="${NS}-trigger-camera" aria-label="Abrir cámara" title="Abrir cámara">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M12 6v12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4.5" y="7.5" width="15" height="10" rx="2" stroke="currentColor" stroke-width="2" fill="none"/><path d="M9 7l1.2-2h3.6L15 7" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2" fill="none"/></svg>
        </button>
      </div>
      <div class="${NS}-grid" id="${NS}-grid" aria-live="polite"></div>
    `;

    const lightbox = document.createElement('div');
    lightbox.className = `${NS}-lightbox`;
    lightbox.innerHTML = `<img alt="">`;
    lightbox.addEventListener('click', () => lightbox.classList.remove('open'));
    panel.appendChild(lightbox);

    // Replace old red camera button with a full-width banner identical to the top one
    const actions = panel.querySelector(`.${NS}-actions`);
    const oldCamBtn = panel.querySelector(`#${NS}-trigger-camera`);
    if (oldCamBtn) oldCamBtn.remove();
    const gridEl = panel.querySelector(`#${NS}-grid`);
    const panelWrap = document.createElement('div');
    panelWrap.className = `${NS}-bannerwrap`;
    panelWrap.dataset.smRole = 'panel-banner';
    const panelBtn = document.createElement('button');
    panelBtn.type = 'button';
    panelBtn.id = `${NS}-trigger-panel`;
    panelBtn.className = `${NS}-banner`;
    panelBtn.textContent = 'Comparte tu experiencia';
    panelWrap.appendChild(panelBtn);
    // dropdown del panel eliminado: usaremos solo el modal

    if (gridEl) panel.insertBefore(panelWrap, gridEl); else panel.appendChild(panelWrap);

    // Banner superior (full width arriba de Agenda)
    const headerWrap = document.createElement('div');
    headerWrap.className = `${NS}-bannerwrap`;
    headerWrap.dataset.smRole = 'top-banner';
    // Ensure margins apply even inside flex/grid parents
    Object.assign(headerWrap.style, { marginTop: '28px', width: '100%' });
    const headerBtn = document.createElement('button');
    headerBtn.type = 'button';
    headerBtn.className = `${NS}-banner`;
    headerBtn.textContent = 'Comparte tu experiencia';
    // Inline styles to win against external CSS collisions
    Object.assign(headerBtn.style, {
      background: 'var(--brand-red, #e02020)',
      color: '#ffffff',
      display: 'block',
      width: '100%',
      textAlign: 'center',
      padding: '12px 16px',
      borderRadius: '8px',
      border: '0',
      fontWeight: '500',
      letterSpacing: '.2px',
      cursor: 'pointer'
    });
    headerWrap.appendChild(headerBtn);


    headerBtn.addEventListener('click', (e) => { e.stopPropagation(); try { openModal(); } catch(_) {} });

    // Botón del panel abre modal directamente
    const pnlBtn = panel.querySelector(`#${NS}-trigger-panel`);
    if (pnlBtn) pnlBtn.addEventListener('click', (e) => { e.stopPropagation(); try { openModal(); } catch(_) {} });

    return { panel, headerWrap, headerBtn, panelBtn: pnlBtn };
  }

  function placeBannerAboveAgenda(elToInsert) {
    if (elToInsert.dataset.smInserted) return; // prevent duplicates
    const norm = (t) => (t || '').toString().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

    const findTarget = () => {
      // 1) Exact anchor/id
      let t = document.getElementById('agenda') || document.querySelector('[name="agenda"], a[href="#agenda"]');
      if (t) {
        const h = t.closest('h1,h2,h3,h4,h5,h6') || t.querySelector?.('h1,h2,h3,h4,h5,h6');
        return h || t;
      }
      // 2) A real heading that contains the word "agenda" (diacritics-insensitive)
      const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6'));
      const match = headings.find(h => /\bagenda\b/.test(norm(h.textContent)) || norm(h.textContent).startsWith('agenda '));
      if (match) return match;
      return null;
    };

    const tryInsert = () => {
      const target = findTarget();
      if (target) {
        try {
          const section = target.closest('section,main,article') || target.parentElement;
          if (section && section.parentElement) {
            // Insert before the whole Agenda section for full-width effect
            section.parentElement.insertBefore(elToInsert, section);
          } else if (target.parentElement) {
            target.parentElement.insertBefore(elToInsert, target);
          } else {
            document.body.insertBefore(elToInsert, document.body.firstChild);
          }
          elToInsert.dataset.smInserted = '1';
          return true;
        } catch (_) { /* ignore */ }
      }
      return false;
    };

    if (tryInsert()) return;

    // Fallback: observe until Agenda appears (SPA/tarde)
    const obs = new MutationObserver(() => { if (tryInsert()) obs.disconnect(); });
    obs.observe(document.body, { childList: true, subtree: true });

    // Safety timeout: if never found, prepend to main/body after a delay
    setTimeout(() => {
      if (elToInsert.dataset.smInserted) return;
      const main = document.querySelector('main');
      if (main) main.prepend(elToInsert); else document.body.prepend(elToInsert);
      elToInsert.dataset.smInserted = '1';
      obs.disconnect();
    }, 3000);
  }

  // IndexedDB minimal store for local-only fallback
  const idb = (() => {
    let dbp;
    function db() {
      if (dbp) return dbp;
      dbp = new Promise((resolve, reject) => {
        const open = indexedDB.open('sm-db', 1);
        open.onupgradeneeded = () => {
          open.result.createObjectStore('photos', { keyPath: 'id', autoIncrement: true });
        };
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
      return dbp;
    }
    async function add(photo) {
      const d = await db();
      return new Promise((res, rej) => {
        const tx = d.transaction('photos', 'readwrite');
        tx.objectStore('photos').add(photo);
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
      });
    }
    async function all() {
      const d = await db();
      return new Promise((res, rej) => {
        const tx = d.transaction('photos', 'readonly');
        const req = tx.objectStore('photos').getAll();
        req.onsuccess = () => res(req.result || []);
        req.onerror = () => rej(req.error);
      });
    }
    return { add, all };
  })();

  function setupHandlers(panel, controls) {
    const fileCam = panel.querySelector(`#${NS}-file-camera`);
    const fileGal = panel.querySelector(`#${NS}-file-gallery`);

    const onFiles = async (e) => {
      const files = Array.from(e.target.files || []);
      for (const file of files) {
        await handleFile(panel, file);
      }
      e.target.value = '';
    };

    fileCam.addEventListener('change', onFiles);
    fileGal.addEventListener('change', onFiles);

    if (controls) {
      // Modal: conectar botones a los inputs
      const hook = (btn, fn) => { if (btn) btn.addEventListener('click', (e)=>{ e.stopPropagation(); fn(); }); };
      hook(document.querySelector(`.${NS}-modal #${NS}-modal-cam`), () => fileCam.click());
      hook(document.querySelector(`.${NS}-modal #${NS}-modal-gal`), () => fileGal.click());
    }
  }

  async function handleFile(panel, file) {
    const grid = panel.querySelector(`#${NS}-grid`);
    const tempUrl = URL.createObjectURL(file);
    const { el, img } = addToGrid(grid, { src: tempUrl, downloadable: true, name: file.name });

    // Try server upload first
    try {
      if (IS_APPS_SCRIPT) {
        // Simple request + no-cors to bypass CORS checks. Response is opaque, so rely on polling refresh.
        const fd = new FormData();
        fd.append('photo', file, file.name);
        await fetch(`${API_BASE}`, { method: 'POST', body: fd, mode: 'no-cors' });
        // Trigger a refresh shortly after upload to pull the new file into the grid
        setTimeout(() => {
          const gridNow = panel.querySelector(`#${NS}-grid`);
          refreshFromServer(gridNow);
        }, 800);
        return;
      } else {
        const fd = new FormData();
        fd.append('photo', file, file.name);
        const uploadUrl = `${API_BASE}/upload`;
        const res = await fetch(uploadUrl, { method: 'POST', body: fd });
        if (!res.ok) throw new Error('upload failed');
        const data = await res.json();
        if (data && data.file) {
          img.src = data.file; // replace temp with server URL
          el.dataset.src = data.file;
          return;
        }
        throw new Error('bad response');
      }
    } catch (_) {
      // Fallback to local IndexedDB so user still sees it
      try {
        const b64 = await fileToDataUrl(file);
        await idb.add({ dataUrl: b64, createdAt: Date.now(), name: file.name });
      } catch (_) { /* ignore */ }
    }
  }

  function addToGrid(grid, { src, downloadable, name }) {
    const el = document.createElement('div');
    el.className = `${NS}-item`;
    el.dataset.src = src;
    el.innerHTML = `
      <img alt="Momento" loading="lazy">
      <div class="${NS}-overlay">
        <a class="${NS}-iconbtn" aria-label="Descargar" title="Descargar" download>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3v12M12 15l-4-4M12 15l4-4" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M5 19h14" stroke-linecap="round"/>
          </svg>
        </a>
      </div>
    `;
    const img = el.querySelector('img');
    img.src = src;
    img.addEventListener('click', () => openLightbox(grid.closest('section'), src));
    const a = el.querySelector('a');
    // Prefer a direct download link for Google Drive sources
    let dl = src;
    try {
      const m = src.match(/drive\.google\.com\/uc\?[^#]*\bid=([^&#]+)/);
      if (m && m[1]) {
        dl = `https://drive.google.com/uc?export=download&id=${m[1]}`;
      }
    } catch (_) { /* ignore */ }
    a.href = dl;
    a.download = name || '';
    if (!downloadable) a.setAttribute('tabindex', '-1');
    grid.prepend(el);
    return { el, img };
  }

  function openLightbox(panel, src) {
    const lb = panel.querySelector(`.${NS}-lightbox`);
    const img = lb.querySelector('img');
    img.src = src;
    lb.classList.add('open');
  }

  async function loadInitial(panel) {
    const grid = panel.querySelector(`#${NS}-grid`);
    // Try server list first
    const serverOk = await refreshFromServer(grid);
    if (!serverOk) {
      // Load from local fallback
      const list = await idb.all();
      list.sort((a,b) => (b.createdAt||0)-(a.createdAt||0));
      list.forEach(p => addToGrid(grid, { src: p.dataUrl, downloadable: true, name: p.name }));
    }
  }

  async function refreshFromServer(grid) {
    try {
      const res = await fetch(`${API_BASE}`);
      if (!res.ok) throw new Error('list failed');
      const data = await res.json();
      if (!data || !Array.isArray(data.files)) throw new Error('bad response');
      // Clear and repopulate from server list
      grid.innerHTML = '';
      for (const path of data.files) {
        addToGrid(grid, { src: path, downloadable: true, name: path.split('/').pop() });
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  function startPolling(panel) {
    const grid = panel.querySelector(`#${NS}-grid`);
    const interval = IS_APPS_SCRIPT ? 1000 : POLL_MS;
    setInterval(() => { refreshFromServer(grid); }, interval);
  }

  function connectStream(panel) {
    if (IS_APPS_SCRIPT) return; // Apps Script no soporta SSE
    try {
      const es = new EventSource(`${API_BASE}/stream`);
      const grid = panel.querySelector(`#${NS}-grid`);
      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data || '{}');
          if (data && data.file) {
            // Avoid duplicates
            const exists = grid.querySelector(`.${NS}-item[data-src="${CSS.escape(data.file)}"]`);
            if (!exists) addToGrid(grid, { src: data.file, downloadable: true, name: data.file.split('/').pop() });
          }
        } catch (_) {}
      };
      es.onerror = () => { try { es.close(); } catch(_){}; /* fallback stays with polling */ };
    } catch (_) { /* ignore */ }
  }

  function applyAgendaHeadingStyle(panel){
    try {
      let title = panel.querySelector(`#${NS}-title`);
      if (!title) return;
      const norm = (t) => (t || '').toString().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const findHeading = () => {
        if (agendaHeadingRef && document.contains(agendaHeadingRef)) return agendaHeadingRef;
        let t = document.getElementById('agenda') || document.querySelector('[name="agenda"], a[href="#agenda"]');
        if (t) return t.closest('h1,h2,h3,h4,h5,h6') || t;
        const hs = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6'));
        return hs.find(h => /\bagenda\b/.test(norm(h.textContent)) || norm(h.textContent).startsWith('agenda ')) || null;
      };
      const agendaH = findHeading();
      if (agendaH) {
        // Clone Agenda heading tag + classes for exact styling
        const agendaTag = agendaH.tagName.toLowerCase();
        let cloned = agendaH.cloneNode(false); // keep tag + classes, drop children
        // Si Agenda no es un Hx, crear un H2 con las mismas clases/atributos
        if (!/^H[1-6]$/i.test(cloned.tagName)) {
          const h = document.createElement('h2');
          // copiar clases
          agendaH.classList.forEach(cls => { try { h.classList.add(cls); } catch(_){} });
          // copiar data-*
          for (const attr of Array.from(agendaH.attributes)) {
            if (attr.name.startsWith('data-')) h.setAttribute(attr.name, attr.value);
          }
          cloned = h;
        }
        cloned.removeAttribute('id');
        cloned.id = `${NS}-title`;
        cloned.textContent = 'Momentos';
        // asegurar clase base
        if (!cloned.classList.contains('section-title')) {
          try { cloned.classList.add('section-title'); } catch(_) {}
        }
        title.replaceWith(cloned);
        title = cloned;
        try { title.removeAttribute('style'); } catch(_) {}
        ['font','font-family','font-size','font-weight','font-style','font-variation-settings','font-stretch','letter-spacing','text-transform','line-height','text-shadow','-webkit-text-stroke-width','-webkit-text-stroke-color','color','margin-top','margin-bottom'].forEach(p => { try { title.style.removeProperty(p); } catch(_){} });
        requestAnimationFrame(() => { try { title.removeAttribute('style'); } catch(_) {} });
        // Copy Agenda heading classes so it inherits theme styles
        if (!title.dataset.smAgendaCloned) {
          agendaH.classList.forEach(cls => { try { title.classList.add(cls); } catch(_){} });
          title.dataset.smAgendaCloned = '1';
        }
      }
    } catch(_) { /* ignore */ }
  }

  function fileToDataUrl(file) {
    return new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onload = () => res(reader.result);
      reader.onerror = () => rej(reader.error);
      reader.readAsDataURL(file);
    });
  }

  // Modal popup for Camera/Gallery selection
  function injectModalStyles() {
    const s = document.createElement('style');
    s.textContent = `
      .${NS}-chooser{ display:none !important; }
      .${NS}-modal { position:fixed; inset:0; background:rgba(0,0,0,.5); display:none; align-items:center; justify-content:center; padding:16px; z-index:10000; }
      .${NS}-modal.open { display:flex; }
      .${NS}-card { width:min(92vw, 420px); background:#fff; border-radius:16px; box-shadow:0 24px 60px rgba(0,0,0,.22); padding:16px; position:relative; }
      .${NS}-card h3 { margin:0 0 10px 0; font-size:1.125rem; color:#052c5a; }
      .${NS}-card p { margin:0 0 14px 0; color:#475569; font-size:.95rem; }
      .${NS}-choices { display:flex; gap:12px; }
      .${NS}-modalbtn { flex:1 1 0; display:flex; align-items:center; justify-content:center; gap:.5rem; border:none; border-radius:12px; padding:12px 14px; cursor:pointer; font:inherit; }
      .${NS}-modalbtn svg { width:20px; height:20px; }
      .${NS}-modalbtn--cam { background:var(--brand-red, #e02020); color:#fff; }
      .${NS}-modalbtn--gal { background:#f1f5f9; color:#0f172a; }
      .${NS}-close { position:absolute; top:8px; right:10px; background:transparent; border:none; color:#64748b; font-size:24px; line-height:1; cursor:pointer; }
      .${NS}-close:hover { color:#0f172a; }
    `;
    document.head.appendChild(s);
  }

  let modalEl, modalCamEl, modalGalEl;
  function buildModalOnce() {
    if (modalEl) return;
    modalEl = document.createElement('div');
    modalEl.className = `${NS}-modal`;
    modalEl.innerHTML = `
      <div class="${NS}-card" role="dialog" aria-modal="true" aria-label="Comparte tu experiencia">
        <button class="${NS}-close" aria-label="Cerrar">×</button>
        <h3>Comparte tu experiencia</h3>
        <p>Elige cómo subir tus fotos</p>
        <div class="${NS}-choices">
          <button class="${NS}-modalbtn ${NS}-modalbtn--cam" id="${NS}-modal-cam">
            <svg viewBox="0 0 24 24"><path d="M12 6v12M6 12h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            Cámara
          </button>
          <button class="${NS}-modalbtn ${NS}-modalbtn--gal" id="${NS}-modal-gal">
            <svg viewBox="0 0 24 24"><path d="M12 6v12M6 12h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            Galería
          </button>
        </div>
      </div>`;
    document.body.appendChild(modalEl);
    modalCamEl = modalEl.querySelector(`#${NS}-modal-cam`);
    modalGalEl = modalEl.querySelector(`#${NS}-modal-gal`);
    const closeBtn = modalEl.querySelector(`.${NS}-close`);
    const close = () => modalEl.classList.remove('open');
    modalEl.addEventListener('click', (e) => { if (e.target === modalEl) close(); });
    closeBtn.addEventListener('click', close);
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  }

  let agendaHeadingRef = null;

  function placePanelAfterAgenda(panel){
    if (panel.dataset.smPanelInserted) return;
    const norm = (t) => (t || '').toString().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const findTarget = () => {
      let t = document.getElementById('agenda') || document.querySelector('[name="agenda"], a[href="#agenda"]');
      if (t) return t.closest('h1,h2,h3,h4,h5,h6') || t;
      const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6'));
      return headings.find(h => /\bagenda\b/.test(norm(h.textContent)) || norm(h.textContent).startsWith('agenda ')) || null;
    };
    const tryInsert = () => {
      const heading = findTarget();
      if (heading){
        agendaHeadingRef = heading; // keep reference for styling copy
        const section = heading.closest('section') || heading.closest('article') || heading.closest('div') || heading.parentElement;
        if (section && section.parentElement){
          section.parentElement.insertBefore(panel, section.nextSibling);
          panel.dataset.smPanelInserted = '1';
          // once placed, attempt to mirror heading styles
          applyAgendaHeadingStyle(panel);
          return true;
        }
      }
      return false;
    };
    if (tryInsert()) return;
    const footer = document.querySelector('footer');
    if (footer && footer.parentElement){
      footer.parentElement.insertBefore(panel, footer);
      panel.dataset.smPanelInserted = '1';
      return;
    }
    const obs = new MutationObserver(() => { if (tryInsert()) obs.disconnect(); });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => {
      if (panel.dataset.smPanelInserted) return;
      document.body.appendChild(panel);
      panel.dataset.smPanelInserted = '1';
      obs.disconnect();
    }, 3000);
  }

  // Init
  ready(() => {
    injectStyles();
    injectModalStyles();
    const built = buildUI();
    const { panel, headerWrap } = built;
    placeBannerAboveAgenda(headerWrap);
    placePanelAfterAgenda(panel);
    setupHandlers(panel, built);
    loadInitial(panel);
    startPolling(panel);
    connectStream(panel);
    // Apply heading style after insertion and after next frame
    setTimeout(() => applyAgendaHeadingStyle(panel), 0);
    requestAnimationFrame(() => applyAgendaHeadingStyle(panel));
    window.addEventListener('load', () => applyAgendaHeadingStyle(panel), { once: true });

    // Guardian: reinsert if another script wipes or rerenders sections
    const state = { panel, headerWrap };
    const guard = () => {
      if (!document.contains(state.headerWrap)) {
        placeBannerAboveAgenda(state.headerWrap);
      }
      if (!document.contains(state.panel)) {
        placePanelAfterAgenda(state.panel);
        applyAgendaHeadingStyle(state.panel);
      }
    };
    const mo = new MutationObserver(() => guard());
    mo.observe(document.body, { childList: true, subtree: true });
    // Also run a few times in the first seconds after load
    let runs = 0; const iv = setInterval(() => { guard(); if (++runs > 20) clearInterval(iv); }, 500);
  });

  // Wire modal open actions to both banners
  ready(() => {
    buildModalOnce();
    const open = () => { buildModalOnce(); modalEl.classList.add('open'); };
    document.querySelectorAll(`.${NS}-banner`).forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); open(); });
    });
    // Connect modal options to inputs (camera/gallery)
    const panel = document.querySelector(`.${NS}-panel`);
    if (panel) {
      const cam = panel.querySelector(`#${NS}-file-camera`);
      const gal = panel.querySelector(`#${NS}-file-gallery`);
      if (modalCamEl && cam) modalCamEl.addEventListener('click', () => { modalEl.classList.remove('open'); cam.click(); });
      if (modalGalEl && gal) modalGalEl.addEventListener('click', () => { modalEl.classList.remove('open'); gal.click(); });
    }
  });
})();




