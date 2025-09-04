// public/app.js

// --- Toast (self-contained: injects styles + root) ---
(function(){
  if (window.toast) return;
  function ensureToastStyles(){
    if (document.getElementById('toastStyle')) return;
    const css = `
      #toastRoot{position:fixed;top:14px;left:50%;transform:translateX(-50%) translateY(-8px);z-index:9999;pointer-events:none}
      .toast{min-width:260px;max-width:86vw;margin:0 auto;background:#0b0b0b;border:1px solid #333;color:#ddd;padding:10px 14px;border-radius:12px;box-shadow:0 6px 30px rgba(0,0,0,.45);font-size:14px;line-height:1.35;display:flex;align-items:center;gap:8px;opacity:0;transform:translateY(-8px);transition:opacity .14s ease,transform .14s ease,border-color .14s ease;pointer-events:auto}
      .toast.show{opacity:1;transform:translateY(0)}
      .toast .dot{width:10px;height:10px;border-radius:50%}
      .toast.info{border-color:#3ea6ff}.toast.info .dot{background:#3ea6ff}
      .toast.success{border-color:#00b37e}.toast.success .dot{background:#00b37e}
      .toast.error{border-color:#e10600}.toast.error .dot{background:#e10600}
    `;
    const s = document.createElement('style');
    s.id = 'toastStyle';
    s.textContent = css;
    document.head.appendChild(s);
  }
  function ensureRoot(){
    let root = document.getElementById('toastRoot');
    if (!root){ root = document.createElement('div'); root.id = 'toastRoot'; document.body.appendChild(root); }
    return root;
  }
  window.toast = function(message, type='info', ttl=1800){
    ensureToastStyles();
    const root = ensureRoot();
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<span class="dot" aria-hidden="true"></span><span>${message}</span>`;
    root.appendChild(el);
    requestAnimationFrame(()=> el.classList.add('show'));
    const t = setTimeout(()=>{
      el.classList.remove('show');
      setTimeout(()=> el.remove(), 180);
    }, Math.max(800, ttl));
    el.addEventListener('click', ()=>{ clearTimeout(t); el.classList.remove('show'); setTimeout(()=> el.remove(), 180); });
  };
})();

// -----------------------------------------------------

let map;
let markers = new Map(); // regionId -> google.maps.Marker
let regions = [];
let byCountry = {};
let currentRegionId = null;
let aborter = null;
const cache = new Map(); // regionId -> { ts, payload }

const ICONS = {
  war: '/img/war.png',
  politics: '/img/politics.png',
  culture: '/img/culture.png',
  economy: '/img/economy.png',
  society: '/img/society.png',
  climate: '/img/climate.png',
  peace: '/img/peace.png',
  demise: '/img/demise.png',
  others: '/img/others.png'
};

const ICON_PX = 32;

// ---------- NEW: detail + saved state ----------
let newsListCache = [];   // last fetched list for the selected region
let showingDetail = null; // when non-null, sidebar is in "single story" mode

// helpers for auth (so we can open modal if not logged in)
async function me() {
  try {
    const r = await fetch('/api/auth/me', { credentials: 'same-origin' });
    if (!r.ok) return null;
    const j = await r.json();
    return j.user || null;
  } catch { return null; }
}
function openAuthModalSafely(){ try{ if (typeof openModal==='function') openModal(); }catch{} }

// ---------- NEW: detail styles (injected once) ----------
function ensureDetailStyles() {
  if (document.getElementById('detail-styles')) return;
  const s = document.createElement('style');
  s.id = 'detail-styles';
  s.textContent = `
    .news-item { display:grid; grid-template-columns:28px 1fr auto; gap:10px; align-items:start; padding:8px 0; }
    .news-item .icon { width:20px; height:20px; opacity:.9; margin-top:2px; }
    .news-detail img.hero { width:100%; height:auto; border-radius:10px; border:1px solid var(--border); margin-bottom:10px }
    @media (max-width: 720px){
      .news-item { grid-template-columns:24px 1fr auto; }
      .news-detail img.hero { max-height:40vh; object-fit:cover; }
    }
  `;
  document.head.appendChild(s);
}

// ---------- existing severity UI ----------
function severityFromCategory(cat = '') {
  const c = String(cat || '').toLowerCase();
  if (c === 'war' || c === 'climate') return 'red';
  if (c === 'culture' || c === 'society'|| c === 'demise') return 'yellow';
  return 'green';
}
function ensureSignalStyles() {
  if (document.getElementById('severity-signal-styles')) return;
  const style = document.createElement('style');
  style.id = 'severity-signal-styles';
  style.textContent = `
    .signalbar { display:inline-flex; align-items:center; gap:6px; margin-left:8px; }
    .signalbar .light { width:14px; height:14px; border-radius:50%; background:#d1d5db; transition:background 120ms ease; }
    .signalbar .light.red.on { background:#fa0004; }
    .signalbar .light.yellow.on { background:#ffee02; }
    .signalbar .light.green.on { background:#2faf00; }
  `;
  document.head.appendChild(style);
}
function ensureSignalBar() {
  if (document.getElementById('severitySignalBar')) return;
  const badge = document.getElementById('dominantBadge');
  if (!badge || !badge.parentElement) return;
  const bar = document.createElement('div');
  bar.className = 'signalbar';
  bar.id = 'severitySignalBar';
  bar.setAttribute('aria-label', 'Severity signal');
  bar.setAttribute('role', 'group');
  bar.innerHTML = `
    <span class="light red" title="Red: war/climate"></span>
    <span class="light yellow" title="Yellow: culture/society"></span>
    <span class="light green" title="Green: other"></span>
  `;
  badge.insertAdjacentElement('afterend', bar);
}
function updateSignalBar(severity) {
  const bar = document.getElementById('severitySignalBar');
  if (!bar) return;
  ['red', 'yellow', 'green'].forEach(color => {
    const el = bar.querySelector(`.light.${color}`);
    if (el) el.classList.toggle('on', color === severity);
  });
}
function latestCategory(items = []) {
  return (items && items.length && (items[0].category || 'others')) || 'others';
}

// ---------- maps ----------
function loadScript(src){
  return new Promise((resolve,reject)=>{
    const s=document.createElement('script');
    s.src=src; s.async=true; s.onload=resolve; s.onerror=reject;
    document.head.appendChild(s);
  });
}
async function initMap(){
  const cfg = await (await fetch('/api/config')).json();
  if(!cfg.mapsKey){ alert('Server is missing GOOGLE_MAPS_API_KEY; set it in .env'); return; }
  await loadScript(`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(cfg.mapsKey)}&v=quarterly`);
  map = new google.maps.Map(document.getElementById('map'), {
    center:{lat:20,lng:0}, zoom:2, styles:[],
    mapTypeControl:false, streetViewControl:false, fullscreenControl:false
  });
}
async function fetchRegions(){
  regions = await (await fetch('/api/regions')).json();
  byCountry = {};
  for(const r of regions){ (byCountry[r.country] ||= []).push(r); }
  const countrySel = document.getElementById('countrySelect');
  const regionSel  = document.getElementById('regionSelect');
  countrySel.innerHTML = ''; regionSel.innerHTML = '';
  const countries = Object.keys(byCountry).sort();
  for(const c of countries){ const o=document.createElement('option'); o.value=c; o.textContent=c; countrySel.appendChild(o); }
  if(countries.length){ countrySel.value=countries[0]; populateRegions(countrySel.value); }
  renderAllRegionMarkers();
}
function populateRegions(country){
  const regionSel = document.getElementById('regionSelect');
  regionSel.innerHTML='';
  for(const r of (byCountry[country]||[])){
    const o=document.createElement('option'); o.value=r._id; o.textContent=r.name; regionSel.appendChild(o);
  }
  if(regionSel.options.length){ regionSel.value = regionSel.options[0].value; selectRegion(regionSel.value); }
}
function makeIcon(category){
  return { url: ICONS[category] || ICONS.others, scaledSize: new google.maps.Size(ICON_PX, ICON_PX) };
}
async function getRegionPayload(regionId, force=false){
  const now = Date.now();
  const c = cache.get(regionId);
  if(!force && c && now - c.ts < 120000) return c.payload;

  const url = `/api/news/${regionId}?limit=30${force ? '&force=1' : ''}`;
  const res = await fetch(url).then(r=>r.json());
  cache.set(regionId, { ts: now, payload: res });
  return res;
}
async function renderAllRegionMarkers(force=false){
  for(const region of regions){
    try{
      const payload = await getRegionPayload(region._id, force);
      const cat = latestCategory(payload.items);
      const iconObj = makeIcon(cat);
      let marker = markers.get(region._id);
      if(!marker){
        marker = new google.maps.Marker({
          position:{lat:region.lat,lng:region.lng}, map, icon: iconObj, title: `${region.name} • ${cat}`
        });
        marker.addListener('click', ()=>{
          document.getElementById('countrySelect').value = region.country;
          populateRegions(region.country);
          document.getElementById('regionSelect').value = region._id;
          selectRegion(region._id);
        });
        markers.set(region._id, marker);
      }else{
        marker.setIcon(iconObj);
        marker.setTitle(`${region.name} • ${cat}`);
      }
    }catch(e){ console.warn('Marker render failed for region', region._id, e); }
  }
}
async function selectRegion(regionId, force=false){
  currentRegionId = regionId;
  const region = regions.find(r=>r._id===regionId);
  if(!region) return;
  map.panTo({lat:region.lat,lng:region.lng}); map.setZoom(5);

  if(aborter) aborter.abort(); aborter = new AbortController();

  const payload = await getRegionPayload(regionId, force);
  const cat = latestCategory(payload.items);
  renderRegion(region, payload, cat);

  const marker = markers.get(regionId);
  if(marker){
    marker.setIcon(makeIcon(cat));
    marker.setAnimation(google.maps.Animation.BOUNCE);
    setTimeout(()=>marker.setAnimation(null),700);
  }
}

// ---------- NEW: list/detail rendering ----------
function newsRow(it) {
  const li = document.createElement('div');
  li.className = 'news-item';
  li.innerHTML = `
    <img class="icon" src="${ICONS[it.category] || ICONS.others}" alt="${it.category}" />
    <div>
      <div class="title" style="font-weight:600;line-height:1.3">${escapeHtml(it.title)}</div>
      <div class="small" style="color:var(--muted)">${escapeHtml(it.source || '')} • ${it.isoDate ? new Date(it.isoDate).toLocaleString() : ''}</div>
    </div>
    <div style="display:flex;gap:6px">
      <button class="btn btn-ghost read-later" title="Read later">☆</button>
    </div>
  `;
  // click → detail
  li.addEventListener('click', (e) => {
    if (e.target.closest('.read-later')) return;
    showNewsDetail(it);
  });
  // read later
  li.querySelector('.read-later').addEventListener('click', async (e) => {
    e.stopPropagation();
    await saveReadLater(it);
  });
  return li;
}
function renderNewsList(items = []) {
  showingDetail = null;
  const list = document.getElementById('newsList');
  if (!list) return;
  list.innerHTML = '';

  if (!items.length) {
    list.innerHTML = `<div class="small" style="color:var(--muted);padding:8px 0">No recent items.</div>`;
    return;
  }
  const frag = document.createDocumentFragment();
  for (const it of items) frag.appendChild(newsRow(it));
  list.appendChild(frag);
}
function showNewsDetail(it) {
  showingDetail = it;
  const wrap = document.getElementById('newsList');
  if (!wrap) return;

  const imgHtml = it.image ? `<img src="${it.image}" alt="" class="hero" />` : '';

  wrap.innerHTML = `
    <div class="news-detail">
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap">
        <button id="backToList" class="btn">← Back to news</button>
        <a class="btn btn-white" href="${it.link}" target="_blank" rel="noopener">Go to source</a>
        <button id="detailSave" class="btn btn-white">☆ Read later</button>
      </div>
      ${imgHtml}
      <div style="display:flex;gap:8px;align-items:center;margin:6px 0;">
        <img class="icon" src="${ICONS[it.category] || ICONS.others}" alt="${it.category}" style="width:18px;height:18px;opacity:.9" />
        <div class="small" style="color:var(--muted)">${escapeHtml(it.source || '')} • ${it.isoDate ? new Date(it.isoDate).toLocaleString() : ''}</div>
      </div>
      <h3 style="margin:6px 0 8px">${escapeHtml(it.title)}</h3>
      <p style="white-space:pre-wrap;line-height:1.5">${escapeHtml(it.summary || '')}</p>
    </div>
  `;

  document.getElementById('backToList').addEventListener('click', () => renderNewsList(newsListCache));
  document.getElementById('detailSave').addEventListener('click', async () => {
    await saveReadLater(it);
  });
}
async function saveReadLater(it) {
  const u = await me();
  if (!u) { openAuthModalSafely(); toast('Please log in to save articles', 'info'); return; }
  const payload = {
    title: it.title, summary: it.summary, link: it.link,
    isoDate: it.isoDate, image: it.image, source: it.source, category: it.category
  };
  const r = await fetch('/api/account/readlater', {
    method: 'POST',
    headers: { 'Content-Type':'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(payload)
  });
  if (!r.ok) {
    const j = await r.json().catch(()=>({error:'Failed'}));
    toast(j.error || 'Failed to save', 'error');
  } else {
    toast('Added to Read later', 'success');
  }
}

// ---------- existing region renderer (now uses new list/detail) ----------
function renderRegion(region, payload, latestCat){
  const computed = latestCat || latestCategory(payload.items);
  document.getElementById('dominantBadge').textContent = ` ${computed}`;

  ensureSignalStyles();
  ensureSignalBar();
  updateSignalBar(severityFromCategory(computed));
  ensureDetailStyles();

  // keep list cache and render as list (click → detail)
  newsListCache = payload.items || [];
  const list = document.getElementById('newsList');
  if (!list) return;
  renderNewsList(newsListCache);
}

// ---------- utils ----------
function escapeHtml(str=''){
  return str.replace(/[&<>"']/g, s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}
async function translateVisible(){
  const links = Array.from(document.querySelectorAll('#newsList .title'));
  if(!links.length) return;
  const texts = links.map(a=>a.textContent);
  try {
    const res = await fetch('/api/translate',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({texts,target:'en'})
    });
    const data = await res.json();
    if(Array.isArray(data.translations)) data.translations.forEach((t,i)=>{ links[i].textContent = t; });
    else toast(data.error || 'Translate failed', 'error');
  } catch {
    toast('Translate failed', 'error');
  }
}

// ---------- boot ----------
document.addEventListener('DOMContentLoaded', async ()=>{
  await initMap();
  await fetchRegions();

  ensureSignalStyles();
  ensureSignalBar();
  ensureDetailStyles();

  document.getElementById('countrySelect').addEventListener('change', e => populateRegions(e.target.value));
  document.getElementById('regionSelect').addEventListener('change', e => selectRegion(e.target.value));
  document.getElementById('refreshBtn').addEventListener('click', async ()=>{
    const id = document.getElementById('regionSelect').value;
    await renderAllRegionMarkers(true);
    if(id) selectRegion(id, true);
  });
  document.getElementById('translateBtn').addEventListener('click', translateVisible);

  // If Account page set a "deep link" to open a story on landing:
  try {
    const raw = localStorage.getItem('lnm_open_item');
    if (raw) {
      localStorage.removeItem('lnm_open_item');
      const it = JSON.parse(raw);
      setTimeout(() => showNewsDetail(it), 250);
    }
  } catch {}
});
