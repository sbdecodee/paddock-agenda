// Grupo Automotriz Magna  -  Agenda prioritaria + Nuestro Equipo

/* ======== CONFIG ======== */
const TYPE_TONES = {
  keynote: 'tone-blue',
  workshop: 'tone-purple',
  panel: 'tone-orange',
  general: 'tone-sand',
  break: 'tone-red',
  lunch: 'tone-red',
  transfer: 'tone-sand',
  experience: 'tone-purple',
  recap: 'tone-orange',
  default: 'tone-sand'
};
const DEFAULT_DURATION_MIN = 60;
const USER_KEY = 'agenda_user_v1';
const TTL_MS = 15*24*60*60*1000; // 15 dÃ­as

/* ======== STATE ======== */
let GUESTS = [];
let EVENTS = [];
let GUEST_INDEX = [];
let EVENTS_ENRICHED = [];
let DAYS = [];
let DAY_DATES = {}; // { 'DÃ­a 1 - ...': 'YYYY-MM-DD' }
let DATE_LIST = [];
let SELECTED_DATE = '';

/* ======== HELPERS ======== */
const $  = (s, c=document) => c.querySelector(s);
const $$ = (s, c=document) => Array.from(c.querySelectorAll(s));
const el = (t, cls, txt) => { const n=document.createElement(t); if(cls) n.className=cls; if(txt!==undefined) n.textContent=txt; return n; };
const norm = s => (s||"").toString().toLowerCase();
const pad2 = n => (n<10? '0'+n : ''+n);
// Parse 'YYYY-MM-DD' as local date to avoid TZ shifting to previous day
function parseISODateLocal(iso){
  try{
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso||''));
    if(!m) return new Date(iso);
    return new Date(Number(m[1]), Number(m[2])-1, Number(m[3]));
  }catch{ return new Date(iso); }
}

// Room display mapping
function mapRoom(name){
  const s = String(name||'');
  const k = normLatin(s);
  if(k === 'salon principal') return 'Salón Yarey';
  if(/^hotel sheraton(,|\b)/.test(k)) return 'Salón Yarey, Hotel Sheraton';
  if(k === 'restaurante del hotel') return 'Área de almuerzo';
  return s;
}

function roomLabel(ev){
  try{
    const t = String(ev?.type||'').toLowerCase();
    if(t === 'break') return 'Pit Stop';
    if(t === 'lunch') return mapRoom(ev?.room||'Área de almuerzo');
    // Fallback específico para "Llegada y ubicación de participantes" sin room definido (p. ej., Día 2)
    const titleNK = normLatin(ev?.title||'');
    if(!ev?.room && /llegada y ubicaci/.test(titleNK)){
      return 'Salón Yarey, Hotel Sheraton';
    }
    return mapRoom(ev?.room||'');
  }catch{ return mapRoom(ev?.room||''); }
}

// Limpia títulos específicos: quitar países entre paréntesis para South Pacific / Southern Cone
function mapTitle(evOrTitle){
  const sRaw = (evOrTitle && evOrTitle.title) ? String(evOrTitle.title||'') : String(evOrTitle||'');
  // Sanear primero por posibles mojibake y luego aplicar reglas
  const s = cleanText(sRaw);
  // Clean parenthetical countries for these regional titles only
  let out = s.replace(/^(South Pacific|Southern Cone)\s*\([^)]*\)\s*$/i, '$1');
  out = out.replace(/^(Centroam(?:é|e)rica)\s*\([^)]*\)\s*$/i, 'Centroamérica');
  // Remove explicit "(continuación)" note if present
  out = out.replace(/\s*\(continuaci(?:[óo])n\)\s*/ig, ' ');
  out = out.replace(/\s{2,}/g,' ').trim();
  return out;
}

// Decide si ocultar la duración en la tarjeta principal
function hideDurationFor(ev){
  try{
    const t = normLatin(mapTitle(ev));
    if(t.includes('noche libre')) return true;
  }catch{}
  return false;
}
// Intenta corregir mojibake tÃ­pico ("AgustÃƒÂ­n" -> "AgustÃ­n")
function cleanText(s){
  const str = String(s||'');
  // Solo intentar "reparar" si parece mojibake (Ãƒ, Ã‚, ï¿½)
  if(/[ÃƒÃ‚ï¿½]/.test(str)){
    try{ return decodeURIComponent(escape(str)); }catch{ /* fallthrough */ }
  }
  return str;
}
// NormalizaciÃ³n para comparar nombres con o sin acentos
function normLatin(s){
  try{ return cleanText(s).normalize('NFD').replace(/\p{Diacritic}+/gu,'').toLowerCase().trim(); }
  catch{ return norm(s); }
}

function tokensNormalized(s){
  return normLatin(s)
    .replace(/[^a-z0-9\s]/g,' ')
    .split(/\s+/)
    .map(t=>t.trim())
    .filter(t=>t.length>=2);
}
function tokensMatchCount(aTokens, bTokens){
  let count = 0;
  for(const tb of bTokens){
    if(tb.length<2) continue;
    const hit = aTokens.some(ta => {
      if(ta.length<2) return false;
      return ta===tb || ta.startsWith(tb) || tb.startsWith(ta);
    });
    if(hit) count++;
  }
  return count;
}
function matchPerson(speaker, guestName){
  const aTokens = tokensNormalized(speaker);
  const bTokens = tokensNormalized(guestName||'');
  if(!aTokens.length || !bTokens.length) return false;
  const need = Math.min(2, bTokens.length);
  if(tokensMatchCount(aTokens, bTokens) >= need) return true;
  // Fallback seguro: iniciales iguales (no substring)
  const aInit = aTokens.map(t=>t[0]).join('');
  const bInit = bTokens.map(t=>t[0]).join('');
  if(aInit && bInit && aInit === bInit) return true;
  // Fallback fuerte: inclusiÃ³n solo si los strings son suficientemente largos
  const A = normLatin(speaker).replace(/[^a-z0-9]/g,'');
  const B = normLatin(guestName||'').replace(/[^a-z0-9]/g,'');
  if(A.length>=5 && B.length>=5 && (A.includes(B) || B.includes(A))) return true;
  return false;
}

// ======== INDEXADO CANÃ“NICO ========
function buildIndexes(){
  // Ãndice de invitados
  GUEST_INDEX = GUESTS.map(g => ({
    ref: g,
    tokens: tokensNormalized(g.name||''),
    initials: (g.name||'').split(/\s+/).map(p=> (p[0]||'').toLowerCase()).join('')
  }));

  // Enriquecer eventos con tokens de speakers
  EVENTS_ENRICHED = EVENTS.map(ev => ({
    ref: ev,
    _speakerTokens: (ev.speakers||[]).map(s => tokensNormalized(s)),
    _speakerFlat: (ev.speakers||[]).map(s => normLatin(s).replace(/[^a-z0-9]/g,''))
  }));
}

// Sesiones de una persona (uso comÃºn)
function computeSessionsForGuest(guest){
  const gTokens = tokensNormalized(guest?.name||'');
  const need = Math.min(2, gTokens.length || 1);
  const initials = (guest?.name||'').split(/\s+/).map(p=> (p[0]||'').toLowerCase()).join('');
  const flatG = normLatin(guest?.name||'').replace(/[^a-z0-9]/g,'');
  const out = [];
  for(const E of EVENTS_ENRICHED){
    let hit = false;
    for(const spTokens of E._speakerTokens){
      if(tokensMatchCount(spTokens, gTokens) >= need){ hit = true; break; }
    }
    if(!hit && initials && initials.length>=2){
      // calcular iniciales del speaker y comparar EXACTAMENTE
      const eqInit = E._speakerTokens.some(sp => sp.map(t=>t[0]).join('') === initials);
      if(eqInit) hit = true;
    }
    if(!hit && flatG && flatG.length>=5){
      // inclusiÃ³n fuerte solo si ambos son suficientemente largos
      const incl = E._speakerFlat.some(s => s.length>=5 && (s.includes(flatG) || flatG.includes(s)));
      if(incl) hit = true;
    }
    if(hit) out.push(E.ref);
  }
  return out;
}
const to12h = (hhmm) => {
  if(!hhmm) return '';
  const [hS,mS] = hhmm.slice(0,5).split(':');
  let h = parseInt(hS,10); const m = pad2(parseInt(mS,10)||0);
  if(Number.isNaN(h)) return hhmm;
  const suffix = h>=12 ? 'P.M.' : 'A.M.';
  h = h%12; if(h===0) h = 12;
  return `${h}:${m} ${suffix}`;
};

// DetecciÃ³n simple de plataforma para calendario
const UA = navigator.userAgent || '';
const IS_ANDROID = /Android/i.test(UA);
const IS_IOS = /iPad|iPhone|iPod/i.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function addToCalendar(ev){
  if(IS_ANDROID){
    window.open(googleCalendarUrl(ev), '_blank', 'noopener');
  }else{
    // iOS/macOS y otros: abrir/descargar ICS que el sistema ofrece importar
    downloadICS(ev);
  }
}

/** HH:mm local â†’ YYYYMMDDTHHMMSSZ (UTC) para Google Calendar */
function toGCalDateTime(dateISO, timeHHmm){
  if(!dateISO || !timeHHmm) return null;
  const [h,m] = timeHHmm.split(':').map(Number);
  const dt = new Date(`${dateISO}T${pad2(h)}:${pad2(m)}:00`);
  const y = dt.getUTCFullYear(), mo = pad2(dt.getUTCMonth()+1), d = pad2(dt.getUTCDate());
  const hh = pad2(dt.getUTCHours()), mm = pad2(dt.getUTCMinutes());
  return `${y}${mo}${d}T${hh}${mm}00Z`;
}

/** URL de Google Calendar */
function googleCalendarUrl(ev){
  const date = getEventDate(ev);
  if(!date) return '#';
  const start = toGCalDateTime(date, ev.time?.slice(0,5));

  const minutes = Number(ev.duration || DEFAULT_DURATION_MIN);
  const [h,m] = ev.time?.slice(0,5).split(':').map(Number) || [9,0];
  const endLocal = new Date(`${date}T${pad2(h)}:${pad2(m)}:00`);
  endLocal.setMinutes(endLocal.getMinutes() + minutes);
  const end = toGCalDateTime(
    `${endLocal.getFullYear()}-${pad2(endLocal.getMonth()+1)}-${pad2(endLocal.getDate())}`,
    `${pad2(endLocal.getHours())}:${pad2(endLocal.getMinutes())}`
  );

  const text = encodeURIComponent(ev.title || 'Evento');
  const details = encodeURIComponent((ev.summary || '') + (ev.speakers?.length ? `\nPonentes: ${ev.speakers.join(', ')}` : ''));
  const location = encodeURIComponent(roomLabel(ev) || '');
  return `https://www.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${start}/${end}&details=${details}&location=${location}`;
}

/** Descargar archivo ICS */
function downloadICS(ev){
  const date = getEventDate(ev);
  if(!date){ alert('Este evento no tiene fecha definida (falta "date" en events.json).'); return; }

  const minutes = Number(ev.duration || DEFAULT_DURATION_MIN);
  const [h,m] = ev.time?.slice(0,5).split(':').map(Number) || [9,0];

  const start = new Date(`${date}T${pad2(h)}:${pad2(m)}:00`);
  const end   = new Date(start.getTime() + minutes*60000);

  const fmt = d => {
    const y=d.getUTCFullYear(), mo=pad2(d.getUTCMonth()+1), dd=pad2(d.getUTCDate()),
          hh=pad2(d.getUTCHours()),  mm=pad2(d.getUTCMinutes()), ss=pad2(d.getUTCSeconds());
    return `${y}${mo}${dd}T${hh}${mm}${ss}Z`;
  };

  const parts = [];
  if (ev.summary) parts.push(ev.summary);
  if (ev.speakers?.length) parts.push(`Ponentes: ${ev.speakers.join(', ')}`);
  const descriptionText = (parts.join('\n')).replace(/\n/g,'\\n');

  const ics =
`BEGIN:VCALENDAR\r\n`+
`VERSION:2.0\r\n`+
`PRODID:-//Grupo Automotriz Magna//Agenda//ES\r\n`+
`CALSCALE:GREGORIAN\r\n`+
`METHOD:PUBLISH\r\n`+
`BEGIN:VEVENT\r\n`+
`UID:${Date.now()}@grupoautomotrizmagna.agenda\r\n`+
`DTSTAMP:${fmt(new Date())}\r\n`+
`DTSTART:${fmt(start)}\r\n`+
`DTEND:${fmt(end)}\r\n`+
`SUMMARY:${(ev.title||'Evento').replace(/\n/g,' ')}\r\n`+
`DESCRIPTION:${descriptionText}\r\n`+
`LOCATION:${((roomLabel(ev)||'').replace(/\n/g,' '))}\r\n`+
`END:VEVENT\r\n`+
`END:VCALENDAR`;

  const blob = new Blob([ics], {type:'text/calendar;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (ev.title || 'evento') + '.ics';
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(a.href);
  a.remove();
}

/** Fecha ISO del evento (usa ev.date o mapeo por 'day') */
function getEventDate(ev){
  if(ev.date) return ev.date;
  if(DAY_DATES[ev.day]) return DAY_DATES[ev.day];
  return null;
}

/* ======== TABS ======== */
function initTabs(){
  const tabs = $$('.tab');
  tabs.forEach(t => t.addEventListener('click', () => {
    tabs.forEach(x => { x.classList.remove('is-active'); x.setAttribute('aria-selected','false'); });
    $$('.panel').forEach(p => p.classList.add('hidden'));
    t.classList.add('is-active');
    t.setAttribute('aria-selected','true');
    $('#'+t.dataset.tab).classList.remove('hidden');
  }));
}

/* ======== NUESTRO EQUIPO ======== */
function renderGuests(list){
  const wrap = $('#guestList');
  wrap.innerHTML = '';
  if(!list.length){ $('#guestEmpty').classList.remove('hidden'); return; }
  $('#guestEmpty').classList.add('hidden');

  list.forEach(g => {
    const card = el('article','card guest tone-sand');
    const head = el('div','card-head');
    head.append(el('div','title', g.name || ''));
    const badgeText = `#${(g.region||'').replace(/^#?/,'')}${g.home? '  -  '+g.home : ''}`;
    const badge = el('span','badge', badgeText.trim());
    head.append(badge);

    const meta = el('p','guest-meta', g.position || '');

    card.append(head, meta);
    wrap.append(card);
  });
}
// Nuevo render tipo slider con avatar y estado
function renderGuestsNew(list){
  const wrap = $('#guestList');
  wrap.classList.add('slider');
  wrap.innerHTML = '';
  if(!list.length){ $('#guestEmpty').classList.remove('hidden'); return; }
  $('#guestEmpty').classList.add('hidden');

  const now = new Date();
  const toRange = (ev)=>{
    const d = getEventDate(ev); if(!d || !ev.time) return null;
    const [h,m] = ev.time.slice(0,5).split(':' ).map(Number);
    const start = new Date(`${d}T${pad2(h)}:${pad2(m)}:00`);
    const minutes = Number(ev.duration||DEFAULT_DURATION_MIN);
    const end = new Date(start.getTime()+minutes*60000);
    return {start,end};
  };
  const isNow = (r)=> r && now>=r.start && now<=r.end;
  const isTodayFuture = (r)=> r && r.start.toDateString()===now.toDateString() && r.start>now;

  list.forEach(g => {
    const card = el('article','card guest tone-sand');
    card.style.minWidth = '240px';

    // Avatar arriba (centro)
    const avatar = el('div','avatar');
    if(g.photo){ const img=new Image(); img.src=g.photo; img.alt=g.name||'Foto'; avatar.append(img); }
    else{ const ini=(g.name||'').split(/\s+/).map(s=>s[0]).slice(0,2).join('').toUpperCase(); avatar.append(el('span','initials',ini||'?')); }

    // Contenido (izquierda)
    const content = el('div','guest-content');
    const name = el('div','guest-name title', cleanText(g.name || ''));
    const role = el('p','guest-meta', cleanText(g.position || ''));
    const loc = el('p','guest-loc', cleanText([g.region, g.home].filter(Boolean).join('  -  ')));

    // Estado por sesiones
    const sessions = computeSessionsForGuest(g);
    const ranges = sessions.map(toRange).filter(Boolean);
    const live = ranges.find(isNow);
    const futures = ranges.filter(isTodayFuture).sort((a,b)=> a.start-b.start);

    const status = el('div','status');
    const dot = el('span','dot');
    if(live){ dot.classList.add('live'); status.append(dot, document.createTextNode('En vivo ahora')); }
    else if(futures.length){ dot.classList.add('ok'); status.append(dot, document.createTextNode('PrÃ³ximo '+ to12h(`${pad2(futures[0].start.getHours())}:${pad2(futures[0].start.getMinutes())}`))); }
    else if(sessions.length){ status.append(dot, document.createTextNode(sessionLabel(sessions.length))); }
    else { status.append(dot, document.createTextNode('Sin sesiones')); }

    content.append(name, role, loc, status);
    card.append(avatar, content);
  wrap.append(card);
  });

  const prev=$('#guestPrev'), next=$('#guestNext');
  if(prev) prev.onclick=()=> wrap.scrollBy({left:-280, behavior:'smooth'});
  if(next) next.onclick=()=> wrap.scrollBy({left: 280, behavior:'smooth'});
  try{ fixAccentsIn(wrap); }catch{}
}

// Cover style slider (full image with overlay)
function renderGuestsCover(list){
  const wrap = $('#guestList');
  wrap.classList.add('slider');
  wrap.innerHTML = '';
  if(!list.length){ $('#guestEmpty').classList.remove('hidden'); return; }
  $('#guestEmpty').classList.add('hidden');

  const now = new Date();
  const toRange = (ev)=>{
    const d = getEventDate(ev); if(!d || !ev.time) return null;
    const [h,m] = ev.time.slice(0,5).split(':' ).map(Number);
    const start = new Date(`${d}T${pad2(h)}:${pad2(m)}:00`);
    const minutes = Number(ev.duration||DEFAULT_DURATION_MIN);
    const end = new Date(start.getTime()+minutes*60000);
    return {start,end};
  };
  const isNow = (r)=> r && now>=r.start && now<=r.end;
  const isTodayFuture = (r)=> r && r.start.toDateString()===now.toDateString() && r.start>now;

  list.forEach(g => {
    const card = el('article','card guest cover-card');
    card.style.minWidth = '280px';

    let media;
    if(g.photo){ media = new Image(); media.src=g.photo; media.alt=g.name||'Foto'; media.className='cover-img'; media.loading='lazy'; media.decoding='async'; media.draggable=false; try{ media.referrerPolicy='no-referrer'; }catch{} }
    else{
      media = el('div','cover-img');
      media.style.display='grid'; media.style.placeItems='center';
      media.style.background='linear-gradient(135deg,#e5e7eb,#f3f4f6)';
      const ini=(g.name||'').split(/\s+/).map(s=>s[0]).slice(0,2).join('').toUpperCase();
      media.append(el('span','cover-initials', ini||'?'));
    }

    const sessions = computeSessionsForGuest(g);
    const ranges = sessions.map(toRange).filter(Boolean);
    const live = ranges.find(isNow);
    const futures = ranges.filter(isTodayFuture).sort((a,b)=> a.start-b.start);

    const overlay = el('div','cover-overlay on-dark');
    const name = el('div','cover-name', cleanText(g.name||''));
    const role = el('p','cover-role', cleanText(g.position||''));
    // Footer (estado + acciÃ³n). Si no tiene sesiones, no mostrar nada.
    if(sessions.length){
      const status = el('div','status on-dark');
      const dot = el('span','dot');
      if(live){ dot.classList.add('live'); status.append(dot, document.createTextNode('En vivo ahora')); }
      else if(futures.length){ dot.classList.add('ok'); status.append(dot, document.createTextNode('PrÃ³ximo '+ to12h(`${pad2(futures[0].start.getHours())}:${pad2(futures[0].start.getMinutes())}`))); }
        else { status.append(dot, document.createTextNode(sessionLabel(sessions.length))); }

      const footer = el('div','cover-footer');
      const btn = el('button','btn-soft','Ver sesiones');
      btn.addEventListener('click', (e)=>{ e.stopPropagation(); openPersonSessions(g); });
      footer.append(status, btn);
      overlay.append(name, role, footer);
    } else {
      overlay.append(name, role);
    }
    card.append(media, overlay);
    wrap.append(card);
  });

  const prev=$('#guestPrev'), next=$('#guestNext');
  if(prev) prev.onclick=()=> wrap.scrollBy({left:-300, behavior:'smooth'});
  if(next) next.onclick=()=> wrap.scrollBy({left: 300, behavior:'smooth'});
  enableSliderDrag(wrap);
}

// Pointer drag + swipe para el slider
function enableSliderDrag(track){
  if(!track || track._dragEnabled) return; track._dragEnabled = true;
  let isDown=false, startX=0, startLeft=0, moved=false;
  const onDown = (e)=>{
    isDown=true; moved=false; startX=(e.touches? e.touches[0].clientX : e.clientX); startLeft=track.scrollLeft; track.classList.add('dragging'); document.body.classList.add('no-select');
  };
  const onMove = (e)=>{
    if(!isDown) return; const x=(e.touches? e.touches[0].clientX : e.clientX); const dx=startX-x; if(Math.abs(dx)>3) moved=true; track.scrollLeft=startLeft+dx; if(!e.touches) e.preventDefault();
  };
  const onUp = ()=>{ if(!isDown) return; isDown=false; track.classList.remove('dragging'); document.body.classList.remove('no-select'); if(moved){ track._suppressClickTs=Date.now(); }};
  track.addEventListener('mousedown', onDown, {passive:true});
  track.addEventListener('touchstart', onDown, {passive:true});
  window.addEventListener('mousemove', onMove, {passive:false});
  window.addEventListener('touchmove', onMove, {passive:true});
  window.addEventListener('mouseup', onUp, {passive:true});
  window.addEventListener('touchend', onUp, {passive:true});
  // Cancel clicks inmediatamente despuÃ©s de un drag
  track.addEventListener('click', (e)=>{ if(track._suppressClickTs && Date.now()-track._suppressClickTs<200){ e.preventDefault(); e.stopPropagation(); } }, true);
}

// Modal con sesiones de una persona
function openPersonSessions(guest){
  const name = guest?.name || '';
  const sessions = computeSessionsForGuest(guest)
    .map(ev => ({
      ev,
      date: getEventDate(ev),
      time: ev.time || '00:00'
    }))
    .sort((a,b)=> (a.date||'').localeCompare(b.date||'') || a.time.localeCompare(b.time));

  const overlay = el('div','overlay');
  const drawer = el('div','drawer');
  const closeBtn = el('button','close','Cerrar');
  closeBtn.addEventListener('click', () => document.body.removeChild(overlay));
  const head = el('div','detail-head');
  head.append(el('h3',null,`Sesiones de ${cleanText(name)}`));
  const body = el('div','detail-body');

  if(!sessions.length){
    body.append(el('p',null,'No se encontraron sesiones para esta persona.'));
  }else{
    sessions.forEach(({ev,date,time})=>{
      const item = el('article','card');
      const h = el('div','row-between');
      h.append(el('div','time', to12h(time)), el('span','badge', ev.type||''));
      item.append(h, el('h3','title', cleanText(mapTitle(ev)||'')));
      const r = roomLabel(ev); if(r) item.append(el('div','room', r));
      const actions = el('div','foot');
      const btnAdd = (()=>{ const b=el('button','btn ghost btn-cal'); b.setAttribute('aria-label','Agregar a Calendario'); b.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><line x1="16" y1="3" x2="16" y2="7"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="3" y1="11" x2="21" y2="11"/></svg>'; return b; })();
      btnAdd.addEventListener('click',(e)=>{ e.stopPropagation(); addToCalendar(ev); });
      const spks = el('div','speakers', formatSpeakersText(ev.speakers||[]));
      actions.append(spks, btnAdd);
      item.append(actions);
      body.append(item);
    });
  }

  drawer.append(closeBtn, head, body);
  overlay.append(drawer);
  overlay.addEventListener('click', (e)=>{ if(e.target===overlay) document.body.removeChild(overlay); });
  document.body.appendChild(overlay);
}
function filterGuests(){
  const q = norm($('#guestSearch').value);
  const out = GUESTS.filter(g =>
    norm(g.name).includes(q) ||
    norm(g.position).includes(q) ||
    norm(g.region).includes(q) ||
    norm(g.home).includes(q)
  );
  renderGuestsCover(out);
}

/* ======== AGENDA (prioridad) ======== */
function groupByDay(events){
  const map = {};
  events.forEach(e => {
    const d = e.day || 'DÃ­a';
    (map[d] ||= []).push(e);
    if(e.date && !DAY_DATES[d]) DAY_DATES[d] = e.date;
  });
  DAYS = Object.keys(map);
  return map;
}
function toneClassFor(ev){
  try{
    const titleNK = normLatin(mapTitle(ev||{}));
    if(titleNK === 'foto de grupo') return 'tone-brand';
  }catch{}
  const key = norm(ev.type || '');
  return TYPE_TONES[key] || TYPE_TONES.default;
}

function capFirst(s){ return s ? s.charAt(0).toUpperCase()+s.slice(1) : s; }
function labelMonthDay(date){
  const dt = parseISODateLocal(date);
  // Abreviatura con punto (ej: "nov.") y capitalizar primera letra
  let mon = dt.toLocaleDateString('es-ES',{month:'short'});
  mon = capFirst(mon);
  const day = dt.getDate();
  // Formato compacto: "Nov.2"
  return `${mon}${day}`;
}
function labelLong(date){
  if(!date) return '';
  const dt = parseISODateLocal(date);
  try{
    let s = dt.toLocaleDateString('es-ES',{weekday:'long', day:'2-digit', month:'long', year:'numeric'});
    // Quitar la coma después del día de la semana: "domingo, 02 de ..." -> "domingo 02 de ..."
    s = s.replace(/^([^,]+),\s*/, '$1 ');
    return capFirst(s);
  }
  catch{ return date; }
}
// Duraciones legibles para las tarjetas
function fmtDuration(min){
  const m = Number(min)||0; if(m<=0) return '';
  const h = Math.floor(m/60), r = m%60;
  if(h && r) return `${h} h ${r} m`;
  if(h) return `${h} h`;
  return `${m} m`;
}
function sessionLabel(n){ n = Number(n)||0; return `${n} ${n===1 ? 'sesiÃ³n' : 'sesiones'}`; }
function renderDayStrip(){
  const strip = $('#dayStrip'); strip.innerHTML = '';
  DATE_LIST.forEach((date,i) => {
    const btn = el('button','daychip'+(date===SELECTED_DATE?' is-active':''), labelMonthDay(date));
    btn.addEventListener('click', () => { SELECTED_DATE = date; renderDayStrip(); renderAgendaList(); });
    strip.append(btn);
  });
  const selLabel = $('#selectedLabel'); if(selLabel){
    try{ selLabel.textContent = labelLong(SELECTED_DATE); }catch{}
  }
  const todayBtn = $('#todayBtn');
  if(todayBtn){
    todayBtn.onclick = () => {
      const t = new Date(); const todayISO = `${t.getFullYear()}-${pad2(t.getMonth()+1)}-${pad2(t.getDate())}`;
      const found = DATE_LIST.find(d=>d===todayISO) || DATE_LIST[0];
      if(found){ SELECTED_DATE = found; renderDayStrip(); renderAgendaList(); }
    };
  }
}

function renderAgendaList(){
  const list = $('#agendaList'); list.innerHTML = '';
  const q = norm($('#search').value);
  const type = $('#typeSelect').value;

  const items = EVENTS
    .filter(e => !SELECTED_DATE || getEventDate(e)===SELECTED_DATE)
    .filter(e => !type || (e.type||'')===type)
    .filter(e =>
      norm(e.title).includes(q) ||
      norm(e.summary).includes(q) ||
      norm((e.speakers||[]).join(' ')).includes(q) ||
      norm((e.tags||[]).join(' ')).includes(q)
    );

  if(!items.length){ $('#empty').classList.remove('hidden'); return; }
  $('#empty').classList.add('hidden');

  // Ordenar por hora ascendente
  items.sort((a,b)=> (a.time||'').localeCompare(b.time||''));

  const now = new Date();
  items.forEach(ev => {
    const tone = toneClassFor(ev);
    const card = el('article','card pill time-card clickable '+tone);
    const node = el('span','node');
    // Estado temporal del punto (default rojo; near naranja; live verde; past rojo)
    try{
      const dateISO = getEventDate(ev);
      if(dateISO && ev.time){
        const [h,m] = ev.time.slice(0,5).split(':').map(Number);
        const base = parseISODateLocal(dateISO);
        const start = new Date(base.getFullYear(), base.getMonth(), base.getDate(), h||0, m||0, 0);
        const minutes = Number(ev.duration||DEFAULT_DURATION_MIN);
        const end = new Date(start.getTime() + minutes*60000);
        const msToStart = start.getTime() - now.getTime();
        if(now >= start && now <= end){
          node.classList.add('is-live');
        } else if(msToStart > 0 && msToStart <= 24*60*60*1000){
          node.classList.add('is-near');
        } else if(now > end){
          node.classList.add('is-past');
        }
      }
    }catch{}

    // Cabecera: hora + tÃ­tulo
    const head = el('div','card-head');
    const left = el('div','left');
    const title = el('h3','title', cleanText(mapTitle(ev) || ''));
    const roomText = roomLabel(ev);
    const room = roomText ? el('div','room', roomText) : null;
    const timeRow = el('div','time-row');
    const timeEl = el('div','time', to12h(ev.time) || '');
    timeRow.append(timeEl);
    if(room) left.append(room);
    const right = el('div','right');
    const durText = (typeof fmtDuration==='function') ? fmtDuration(ev.duration||DEFAULT_DURATION_MIN) : '';
    if(durText && !hideDurationFor(ev)) timeRow.append(el('span','duration time-duration', durText));
    left.append(timeRow, title);
    head.append(left, right);

    // Etiquetas + resumen
    const chips = el('div','chips');
    try{
      let list = Array.isArray(ev.tags) ? ev.tags.slice() : [];
      // Ocultar el chip "Logística" únicamente para la tarjeta de "Llegada y ubicación de participantes"
      const titleNK = normLatin(mapTitle(ev));
      if(titleNK.includes('llegada y ubicaci')){
        list = list.filter(t => normLatin(t) !== 'logistica');
      }
      list.forEach(t => chips.append(el('span','chip', cleanText(t))));
    }catch{
      (ev.tags||[]).forEach(t => chips.append(el('span','chip', t)));
    }
    const body  = el('p','summary', cleanText(ev.summary || ''));

    // Pie: ponentes + acciones (Google / ICS)
    const foot = el('div','foot');
    const speakers = el('div','speakers', formatSpeakersText(ev.speakers||[], ev));
    const actions = el('div','actions');
    const btnAdd = (()=>{ const b=el('button','btn ghost btn-cal'); b.setAttribute('aria-label','Agregar a Calendario'); b.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><line x1="16" y1="3" x2="16" y2="7"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="3" y1="11" x2="21" y2="11"/></svg>'; return b; })();
    btnAdd.addEventListener('click', (e) => { e.stopPropagation(); addToCalendar(ev); });
    actions.append(btnAdd);
    foot.append(speakers, actions);

    card.append(node, head, chips, body, foot);
    card.addEventListener('click', () => openDetail(ev));
    card.addEventListener('keydown', (e) => { if(e.key==='Enter' || e.key===' ') { e.preventDefault(); openDetail(ev);} });
    card.setAttribute('tabindex','0');
    list.append(card);
  });
  if(list.lastElementChild) list.lastElementChild.classList.add('is-last');
}

function openDetail(ev){
  const overlay = el('div','overlay');
  const drawer = el('div','drawer');
  drawer.setAttribute('role','dialog');
  drawer.setAttribute('aria-modal','true');

  const closeBtn = el('button','close','Cerrar');
  closeBtn.addEventListener('click', () => document.body.removeChild(overlay));

  const head = el('div','detail-head');
  const title = el('h3',null, cleanText(mapTitle(ev) || 'Detalle'));

  // tiempo y fecha amigable
  const dateISO = getEventDate(ev);
  const [h,m] = (ev.time||'00:00').slice(0,5).split(':').map(Number);
  const start = dateISO ? (()=>{ const b=parseISODateLocal(dateISO); return new Date(b.getFullYear(), b.getMonth(), b.getDate(), h||0, m||0, 0); })() : null;
  const end = start ? new Date(start.getTime() + Number(ev.duration||DEFAULT_DURATION_MIN)*60000) : null;
  const range = start && end ? `${to12h(ev.time)} - ${to12h(`${pad2(end.getHours())}:${pad2(end.getMinutes())}`)}` : to12h(ev.time);
  const dateText = dateISO ? parseISODateLocal(dateISO).toLocaleDateString('es-ES',{weekday:'long', day:'2-digit', month:'long', year:'numeric'}) : '';
  const timeEl = el('div','detail-time', [dateText, range].filter(Boolean).join('  -  '));

  const roomEl = el('div','detail-room', roomLabel(ev) ? `Lugar: ${roomLabel(ev)}` : '');
  const typeEl = el('div','detail-type', ev.type ? `Tipo: ${ev.type}` : '');
  const spkEl  = el('div','detail-speakers', (ev.speakers?.length ? `Ponentes: ${formatSpeakersText(ev.speakers)}` : ''));

  head.append(title, timeEl, roomEl, typeEl, spkEl);

  const body = el('div','detail-body');
  if(ev.summary) body.append(el('p',null, cleanText(ev.summary)));

  // Adjuntos removidos por requerimiento

  drawer.append(closeBtn, head, body);
  overlay.append(drawer);
  overlay.addEventListener('click', (e) => { if(e.target === overlay) document.body.removeChild(overlay); });
  document.addEventListener('keydown', function esc(e){ if(e.key==='Escape'){ try{ document.body.removeChild(overlay);}catch{} document.removeEventListener('keydown', esc); } });
  document.body.appendChild(overlay);
}

/* ======== INIT ======== */
async function loadData(){
  try{
    const [gRes, eRes] = await Promise.all([
      fetch('./data/guests.json'),
      fetch('./data/events.json')
    ]);
    if(!gRes.ok || !eRes.ok) throw new Error('No se pudo cargar JSON');
    GUESTS = await gRes.json();
    EVENTS = await eRes.json();
    // Nota: los horarios ya están ajustados directamente en data/events.json
    // Patch local photo for Avelino and Juan Arturo if missing; override for Federico
    try{
      (GUESTS||[]).forEach(g=>{
        if(normLatin(g?.name||'') === 'avelino rodriguez' && !g.photo){
          g.photo = './assets/AVELINO RODRIGUEZ2.png';
        }
        if(!g.photo){
          const n = normLatin(g?.name||'');
          if(n.startsWith('juan arturo')){
            g.photo = './assets/JUAN ARTURO.png';
          } else if(n === 'ivan sanchez'){
            g.photo = './assets/IVAN SANCHEZ.png';
          } else if(n === 'elis jimenez'){
            g.photo = './assets/ELIS JIMENES.png';
          }
        }
        // Reemplazar siempre por el asset local si es Federico Bangerter
        if(normLatin(g?.name||'') === 'federico bangerter'){
          g.photo = './assets/FEDERICO.jpg';
        }
        // Reemplazar siempre por el asset local si es Grisel Fernández
        if(normLatin(g?.name||'') === 'grisel fernandez'){
          g.photo = './assets/GRISEL FERNANDEZ.png';
        }
        // Reemplazar siempre por el asset local si es Erick Gutiérrez
        if(normLatin(g?.name||'') === 'erick gutierrez'){
          g.photo = './assets/ERICK.jpg';
          g.position = 'Gerente General Colombia\nDirector de Nuevos Negocios';
        }
        // Reemplazar siempre por el asset local si es María Eugenia Castro
        if(normLatin(g?.name||'') === 'maria eugenia castro'){
          g.photo = './assets/María Eugenia Castro.jpg';
        }
        // Ajuste de cargo: Arlene Vega
        if(normLatin(g?.name||'') === 'arlene vega'){
          g.position = 'Directora de Gestión Humana';
        }
        // Ajustes de cargo solicitados
        if(normLatin(g?.name||'') === 'elis jimenez'){
          g.position = 'Director de Post Venta';
        }
        if(normLatin(g?.name||'') === 'rafael alvarez'){
          g.position = 'Director de Post Venta';
        }
        if(normLatin(g?.name||'') === 'grisel fernandez'){
          g.position = 'Directora Legal';
        }
        if(normLatin(g?.name||'') === 'avelino rodriguez'){
          g.position = 'Presidente Corporativo';
        }
        if(normLatin(g?.name||'') === 'ivan sanchez'){
          g.position = 'Gerente BI';
        }
        if(normLatin(g?.name||'') === 'philipp heldt'){
          g.position = 'Gerente General México';
        }
        if(normLatin(g?.name||'') === 'javier lainez'){
          g.position = 'Gerente General Centroamérica';
        }
        if(normLatin(g?.name||'') === 'federico bangerter'){
          g.position = 'Gerente General Southern Cone';
        }
        if(normLatin(g?.name||'') === 'renato rivas'){
          g.position = 'Gerente General South Pacific';
        }
      });
      // Agregar tarjeta para Ricardo Tejeda si no existe, justo después de Juan Arturo Pimentel
      const hasRicardo = (GUESTS||[]).some(g => normLatin(g?.name||'') === 'ricardo tejeda');
      if(!hasRicardo){
        const ricardo = { name: 'Ricardo Tejeda', position: 'Operations Director', photo: './assets/Ricardo Tejeda.jpg' };
        const idxJuanArturo = (GUESTS||[]).findIndex(g => normLatin(g?.name||'') === 'juan arturo pimentel');
        if(idxJuanArturo >= 0){ GUESTS.splice(idxJuanArturo + 1, 0, ricardo); }
        else { GUESTS.push(ricardo); }
      }
    }catch{}
  }catch(err){
    console.error(err);
    const msg = el('div','notice', 'No fue posible cargar los datos. Revisa la conexiÃ³n o vuelve a intentar.');
    document.querySelector('.container')?.prepend(msg);
    return;
  }

  // Construir Ã­ndices canÃ³nicos para asegurar correlaciÃ³n estable
  groupByDay(EVENTS); // establece DAY_DATES
  buildIndexes();

  // Nuestro Equipo
  renderGuestsCover(GUESTS);
  $('#guestSearch')?.addEventListener('input', filterGuests);

  // Agenda (prioridad)
  const types = [...new Set(EVENTS.map(e => e.type).filter(Boolean))];
  const sel = $('#typeSelect'); types.forEach(t => sel.append(new Option(t,t)));
  DATE_LIST = [...new Set(EVENTS.map(e => getEventDate(e)).filter(Boolean))].sort();
  SELECTED_DATE = DATE_LIST[0] || '';
  renderDayStrip();
  renderAgendaList();
  // Insertar título 'Agenda' antes del selector si no existe
  try{
    const agendaSearch = document.querySelector('#agenda #search');
    const agendaToolbar = agendaSearch?.closest('.toolbar');
    if(agendaToolbar && !document.querySelector('#agenda .section-title[data-agenda="1"]')){
      const h2 = document.createElement('h2'); h2.className = 'section-title'; h2.textContent = 'Agenda'; h2.setAttribute('data-agenda','1');
      agendaToolbar.parentNode.insertBefore(h2, agendaToolbar);
    }
  }catch{}

  $('#search').addEventListener('input', () => renderAgendaList());
  $('#typeSelect').addEventListener('change', () => renderAgendaList());
  $('#clearBtn').addEventListener('click', () => {
    $('#search').value = ''; $('#typeSelect').value = '';
    renderAgendaList();
  });

  // Buscador global unificado: replica en Equipo y Agenda y dispara filtros
  const gSearch = $('#globalSearch');
  if(gSearch){
    gSearch.addEventListener('input', () => {
      const val = gSearch.value || '';
      const gs = $('#guestSearch'); if(gs) gs.value = val;
      const as = $('#search');     if(as) as.value = val;
      try{ filterGuests(); }catch{}
      try{ renderAgendaList(); }catch{}
    });
  }

  // Botones de mes eliminados por requerimiento
}

function boot(){
  $('#year').textContent = new Date().getFullYear();
  // PÃ¡gina Ãºnica: sin pestaÃ±as
  ensureUser();
  loadData();
  try{ setupMastheadSlider(); }catch{}
}
boot();

// ======== PersonalizaciÃ³n de usuario ========
function loadUser(){
  try{
    const raw = localStorage.getItem(USER_KEY);
    if(!raw) return null;
    const obj = JSON.parse(raw);
    if(!obj?.name || !obj?.ts) return null;
    if(Date.now() - obj.ts > TTL_MS){ localStorage.removeItem(USER_KEY); return null; }
    return obj.name;
  }catch{ return null; }
}
function saveUser(name){
  try{ localStorage.setItem(USER_KEY, JSON.stringify({name, ts: Date.now()})); }catch{}
}
function updateHello(name){
  const elHello = $('#hello');
  if(!elHello) return;
  const safe = cleanText(name||'');
  if(!safe){ elHello.textContent = ''; return; }
  elHello.innerHTML = `Hola, <span class="hello-name">${safe}</span>`;
}
function ensureUser(){
  const name = loadUser();
  if(name){ updateHello(name); return; }
  showNamePrompt();
}
function showNamePrompt(){
  // Pantalla completa con imagen y overlay de marca
  const scr = el('section','welcome-screen');
  const inner = el('div','welcome-inner');
  // Texto superior (fuera del box)
  const lead = el('div','welcome-lead');
  const greet = el('h3','welcome-greet','Bienvenido/a');
  const sub = el('p','welcome-sub','Queremos hacer tu experiencia más personalizada y que disfrutes este evento tanto como nosotros.');
  lead.append(greet, sub);
  const title = el('h1','welcome-title','¿Cómo te llamas?');
  const input = document.createElement('input');
  input.className = 'input welcome-input';
  input.placeholder = 'Escribe tu nombre';
  input.autocomplete = 'name'; input.maxLength = 60;
  const save = el('button','btn welcome-save','Continuar');
  inner.append(title, input, save);
  scr.append(lead, inner);
  document.body.appendChild(scr);
  const doSave = () => {
    const name = (input.value||'').trim();
    if(!name){ input.focus(); return; }
    saveUser(name); updateHello(name);
    document.body.removeChild(scr);
    playIntroTransition();
  };
  save.addEventListener('click', doSave);
  input.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); doSave(); }});
  setTimeout(()=> input.focus(), 0);
}

// Map rápido de nombre normalizado -> posición/cargo (después de overrides)
function buildRoleMap(){
  const map = new Map();
  try{
    (GUESTS||[]).forEach(g=>{
      const k = normLatin(g?.name||''); if(k) map.set(k, g.position||'');
    });
  }catch{}
  return map;
}

// Formatea speakers usando cargos actualizados cuando hay match por nombre
function formatSpeakersText(arr, ev){
  const out = [];
  const rolesOld = new Set(['presidente','ceo','coo','cfo','directora','director','gm','gte.','gte. bi','gerente']);
  const roleMap = buildRoleMap();
  const a = Array.isArray(arr) ? arr : [];
  const stripParens = (s)=> String(s||'').replace(/\s*\([^)]*\)\s*/g,' ').replace(/\s{2,}/g,' ').trim();
  for(let i=0;i<a.length;i++){
    const sRaw = a[i]||'';
    const nameClean = stripParens(sRaw);
    let cargo = '';
    let matched = '';
    // 1) Match exact por mapa
    const kExact = normLatin(nameClean);
    if(roleMap.has(kExact)){ cargo = roleMap.get(kExact)||''; matched = kExact; }
    // 2) Fuzzy match usando matchPerson si no hubo exact
    if(!cargo){
      try{
        for(const g of (GUESTS||[])){
          if(matchPerson(nameClean, g?.name||'')) { cargo = g?.position||''; matched = normLatin(g?.name||''); break; }
        }
      }catch{}
    }
    // Override SOLO para la tarjeta de "Jamaica" en la agenda (no afecta otros contextos)
    try{
      if(ev){
        const titleNK = normLatin(mapTitle(ev));
        if(titleNK === 'jamaica' && kExact === 'erick gutierrez'){
          cargo = 'Gerente General interino';
        }
      }
    }catch{}
    // Construir etiqueta como "Nombre, Cargo" (sin paréntesis)
    const label = cleanText(nameClean) + (cargo ? `, ${cargo}` : '');
    out.push(label);
    // Si el siguiente token es un cargo antiguo, saltarlo
    const next = String(a[i+1]||'');
    const nk = normLatin(next);
    if(rolesOld.has(nk)) i++;
  }
  return out.join(' - ');
}

// Intro transition: blue screen + figures crossfade
function playIntroTransition(){
  try{
    const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const overlay = el('div','intro-overlay');
    const stage = el('div','intro-stage');
    const img = new Image(); img.className = 'intro-image'; img.alt = '';
    stage.append(img); overlay.append(stage); document.body.appendChild(overlay);
    // Fade in overlay background
    requestAnimationFrame(()=> overlay.classList.add('is-visible'));

    const bases = ['figura1','figura2','figura3'];
    const exts = ['.png','.jpg','.jpeg','.webp'];
    const urls = [];
    // Resolve first existing extension per base
    const tryLoad = (u)=> new Promise(res=>{ const t=new Image(); t.onload=()=>res(u); t.onerror=()=>res(null); t.src=u; });
    (async () => {
      for(const b of bases){
        let found = null;
        for(const e of exts){ const u = `./assets/${b}${e}`; /* optimistic */ found = await tryLoad(u); if(found) break; }
        if(found) urls.push(found);
      }
      if(prefersReduced || urls.length===0){ overlay.classList.add('is-leaving'); setTimeout(()=> document.body.removeChild(overlay), 220); return; }
      let i = 0; const duration = 700; // ms por imagen (más rápido)
      const show = () => {
        if(i>=urls.length){ document.body.removeChild(overlay); return; }
        img.classList.remove('is-visible');
        setTimeout(()=>{ img.src = urls[i++]; img.onload = ()=> img.classList.add('is-visible'); }, 120);
        setTimeout(()=>{
          if(i>=urls.length){
            // último: fade out overlay y remover
            overlay.classList.add('is-leaving');
            setTimeout(()=>{ try{ document.body.removeChild(overlay); }catch{} }, 260);
          }else{
            show();
          }
        }, duration);
      };
      show();
    })();
  }catch{ /* fail-safe: no transition */ }
}

// Override encodings-sensitive helpers with safe labels (post-load)
// Ensures correct accents regardless of file encoding mishaps.
// eslint-disable-next-line no-global-assign
sessionLabel = function(n){ n = Number(n)||0; return `${n} ${n===1 ? 'sesi\u00F3n' : 'sesiones'}`; };

// Fix common mojibake in rendered text without changing data
function fixAccentsIn(scope){
  try{
    const repl = (s)=> String(s||'')
      .replace(/ - /g,'\u00B7')
      .replace(/PrÃ³ximo|Pr��ximo|Pr�ximo/g,'Pr\u00F3ximo')
      .replace(/sesiÃ³n|sesi��n|sesi�n/g,'sesi\u00F3n');
    (scope.querySelectorAll?.('.cover-loc,.status,.detail-time,.room,.speakers')||[])
      .forEach(n=>{ n.textContent = repl(n.textContent); });
  }catch{}
}


function setupMastheadSlider(){
  try{
    const host = document.querySelector('.masthead');
    if(!host) return;
    // create bg layer if not exists
    let bg = host.querySelector('.masthead-bg');
    if(!bg){ bg = document.createElement('div'); bg.className = 'masthead-bg'; host.prepend(bg); }
    const bases = ['BANNER-HOME','BANNER-HOME2','BANNER-HOME3','BANNER-HOME4','BANNER-HOME5','BANNER-HOME6'];
    const urls = bases.map(b=> `./assets/${b}.jpg`);
    let i = 0;
    const setImg = (el, url) => { el.style.backgroundImage = `linear-gradient(180deg, rgba(0,0,0,.75) 0%, rgba(0,0,0,.60) 100%), url('${url}')`; };
    setImg(bg, urls[0]);
    const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(prefersReduced) return;
    setInterval(()=>{
      const next = document.createElement('div'); next.className = 'masthead-bg'; next.style.opacity = '0'; host.prepend(next);
      i = (i+1) % urls.length; setImg(next, urls[i]);
      // fade in next, then remove previous after transition
      requestAnimationFrame(()=>{ next.style.opacity = '1'; });
      setTimeout(()=>{
        host.querySelectorAll('.masthead-bg').forEach((el,idx)=>{ if(idx>0) host.removeChild(el); });
      }, 800);
    }, 4500);
  }catch{}
}

// PWA: manejo del prompt de instalación (Android/Chrome) y ayuda para iOS
(()=>{
  try{
    const installBtn = document.getElementById('installBtn');
    let deferredPrompt = null;

    // Mostrar el botón cuando la app es instalable
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      installBtn?.classList.remove('hidden');
    });

    // Ocultar si ya está en modo standalone
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if(isStandalone){ installBtn?.classList.add('hidden'); }

    installBtn?.addEventListener('click', async () => {
      if(deferredPrompt){
        deferredPrompt.prompt();
        try{ await deferredPrompt.userChoice; }catch{}
        deferredPrompt = null;
        installBtn?.classList.add('hidden');
      }else if(/iPad|iPhone|iPod/i.test(navigator.userAgent)){
        // iOS no muestra beforeinstallprompt: guiar al usuario
        alert('En iPhone/iPad: toca Compartir y luego "Añadir a pantalla de inicio".');
      }
    });
  }catch{}
})();


// Override: mejorar experiencia de swipe/drag del slider en mvil
// Deja que el navegador maneje el scroll con inercia en touch;
// solo usa drag manual para mouse.
function enableSliderDrag(track){
  try{
    if(!track || track._dragEnabled) return; track._dragEnabled = true;
    let isDown=false, startX=0, startLeft=0, moved=false, isTouch=false;
    const onDown = (e)=>{
      isDown=true; moved=false; isTouch = !!e.touches;
      startX = isTouch ? e.touches[0].clientX : e.clientX;
      startLeft = track.scrollLeft;
      track.classList.add('dragging');
      if(!isTouch) document.body.classList.add('no-select');
    };
    const onMove = (e)=>{
      if(!isDown) return;
      if(isTouch){
        const x = e.touches[0].clientX; const dx = startX - x; if(Math.abs(dx)>3) moved=true; // nativo maneja el scroll
        return;
      }
      const x = e.clientX; const dx = startX - x; if(Math.abs(dx)>3) moved=true; track.scrollLeft = startLeft + dx; e.preventDefault();
    };
    const onUp = ()=>{
      if(!isDown) return; isDown=false; track.classList.remove('dragging'); document.body.classList.remove('no-select'); if(moved){ track._suppressClickTs=Date.now(); }
    };
    track.addEventListener('mousedown', onDown, {passive:true});
    track.addEventListener('touchstart', onDown, {passive:true});
    window.addEventListener('mousemove', onMove, {passive:false});
    window.addEventListener('touchmove', onMove, {passive:true});
    window.addEventListener('mouseup', onUp, {passive:true});
    window.addEventListener('touchend', onUp, {passive:true});
    track.addEventListener('click', (e)=>{ if(track._suppressClickTs && Date.now()-track._suppressClickTs<200){ e.preventDefault(); e.stopPropagation(); } }, true);
  }catch{}
}

