const state = { day: 'Todos', type: 'Todos', q: '', data: [] };

async function loadData(){
  const res = await fetch('./data/events.json');
  state.data = await res.json();
  buildDays();
  buildTypes();
  render();
  handleHash();
}

const $ = (s)=>document.querySelector(s);
const el = (t,c,h='')=>{ const e=document.createElement(t); if(c) e.className=c; if(h) e.innerHTML=h; return e; };

function buildDays(){
  const wrap = $('#days');
  wrap.innerHTML = '';
  const all = el('button','tab active','Todos los días');
  all.onclick = ()=>setDay('Todos', all);
  wrap.appendChild(all);

  state.data.forEach(d=>{
    const b = el('button','tab',`${d.day} – ${d.date}`);
    b.onclick = ()=>setDay(d.day, b);
    wrap.appendChild(b);
  });
}
function setDay(day, btn){
  state.day = day;
  document.querySelectorAll('#days .tab').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active'); render();
}

function buildTypes(){
  const set = new Set();
  state.data.forEach(d=>d.tracks.forEach(t=>set.add(t.type)));
  const sel = $('#typeSelect');
  sel.innerHTML = '<option>Todos</option>' + [...set].sort().map(v=>`<option>${v}</option>`).join('');
  sel.onchange = (e)=>{ state.type = e.target.value; render(); };
}

function render(){
  const main = $('#agenda'); main.innerHTML = '';
  const days = (state.day==='Todos') ? state.data : state.data.filter(d=>d.day===state.day);
  const q = state.q.toLowerCase(); const type = state.type;

  days.forEach(d=>{
    d.tracks
      .filter(t => type==='Todos' || t.type===type)
      .filter(t => [t.title, t.room, ...(t.speakers||[]), ...(t.tags||[])].join(' ').toLowerCase().includes(q))
      .sort((a,b)=> a.time.localeCompare(b.time))
      .forEach(t => main.appendChild(card(d, t)));
  });

  $('#empty').classList.toggle('hidden', main.children.length>0);

  document.querySelectorAll('.more').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const slug = btn.dataset.slug;
      const found = findBySlug(slug);
      if (found) openDetail(found.day, found.track);
    });
  });
}

function card(day, t){
  const a = el('article','card');
  a.innerHTML = `
    <div class="time">${t.time} • ${day.day} <span class="room"> · ${t.room||''}</span></div>
    <div class="title">${t.title}</div>
    <div class="badges">
      <span class="badge">${t.type}</span>
      ${(t.speakers||[]).map(s=>`<span class="badge">Ponente: ${s}</span>`).join('')}
      ${(t.tags||[]).map(tag=>`<span class="badge">#${tag}</span>`).join('')}
    </div>
    ${t.excerpt ? `<p class="excerpt">${t.excerpt}</p>` : ''}
    ${t.slug ? `<button class="more" data-slug="${t.slug}">Leer más</button>` : ''}
  `;
  a.querySelector('.title').addEventListener('click', ()=>{ if (t.slug){ openDetail(day, t); } });
  return a;
}

// ====== Detalle ======
function findBySlug(slug){
  for (const d of state.data){
    for (const t of d.tracks){
      if (t.slug === slug) return {day: d, track: t};
    }
  }
  return null;
}

function mdToHtml(md=''){
  if (!md) return '';
  let h = md
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/gim, '<em>$1</em>')
    .replace(/\[(.*?)\]\((.*?)\)/gim, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/^\s*-\s+(.*)$/gim, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/gims, '<ul>$1</ul>')
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/\n/g, '<br/>');
  return `<p>${h}</p>`;
}

function openDetail(day, t){
  $('#detailTime').textContent = `${t.time} • ${day.day}`;
  $('#detailTitle').textContent = t.title;
  $('#detailRoom').textContent  = t.room ? `Sala: ${t.room}` : '';
  $('#detailType').textContent  = t.type ? ` · ${t.type}` : '';
  $('#detailSpeakers').textContent = (t.speakers && t.speakers.length) ? ` · ${t.speakers.join(', ')}` : '';

  const body = $('#detailBody');
  if (t.content && t.content.trim().startsWith('<')) body.innerHTML = t.content;
  else body.innerHTML = mdToHtml(t.content || '');

  const media = $('#detailMedia'); media.innerHTML = '';
  (t.media || []).forEach(m=>{
    if (m.type === 'image') {
      const img = document.createElement('img');
      img.src = m.src; img.alt = m.alt || '';
      media.appendChild(img);
    } else if (m.type === 'video') {
      const iframe = document.createElement('iframe');
      iframe.width = '100%'; iframe.height = '360';
      iframe.src = m.src; iframe.title = t.title;
      iframe.frameBorder = '0';
      iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
      iframe.allowFullscreen = true;
      media.appendChild(iframe);
    }
  });

  const links = $('#detailLinks'); links.innerHTML = '';
  (t.links || []).forEach(l=>{
    const a = document.createElement('a');
    a.href = l.url; a.target = '_blank'; a.rel = 'noopener';
    a.textContent = l.label || l.url;
    links.appendChild(a);
  });

  $('#detailOverlay').classList.remove('hidden');
  $('#detailOverlay').setAttribute('aria-hidden','false');
  if (t.slug) location.hash = `#/session/${encodeURIComponent(t.slug)}`;
}

function closeDetail(){
  $('#detailOverlay').classList.add('hidden');
  $('#detailOverlay').setAttribute('aria-hidden','true');
  if (location.hash.startsWith('#/session/')) history.pushState('', document.title, window.location.pathname + window.location.search);
}

document.addEventListener('click', (e)=>{
  if (e.target.id === 'closeDetail' || e.target.id === 'detailOverlay') closeDetail();
});
document.addEventListener('keydown', (e)=>{ if (e.key === 'Escape') closeDetail(); });

function handleHash(){
  const m = location.hash.match(/^#\/session\/(.+)$/);
  if (m && m[1]){
    const found = findBySlug(decodeURIComponent(m[1]));
    if (found) openDetail(found.day, found.track);
  }
}

// UI
document.addEventListener('DOMContentLoaded', ()=>{
  $('#q').addEventListener('input', e=>{ state.q = e.target.value; render(); });
  document.querySelector('#clearBtn').addEventListener('click', ()=>{
    state.q=''; $('#q').value=''; state.type='Todos'; $('#typeSelect').value='Todos'; render();
  });
  loadData();
  window.addEventListener('hashchange', handleHash);
});
