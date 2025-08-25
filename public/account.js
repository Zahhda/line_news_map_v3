// public/account.js
function qs(s){ return document.querySelector(s); }
function fmtDate(s){ try{ return new Date(s).toLocaleString(); }catch{ return s; } }

async function me() {
  const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
  if (!res.ok) throw new Error('Not logged in');
  return res.json();
}

// --- Read later API ---
async function fetchSaved() {
  const r = await fetch('/api/account/readlater', { credentials: 'same-origin' });
  if (!r.ok) throw new Error('Failed to load saved');
  const j = await r.json();
  return j.items || [];
}

async function removeSaved(key) {
  const r = await fetch('/api/account/readlater/'+encodeURIComponent(key), {
    method:'DELETE', credentials:'same-origin'
  });
  if (!r.ok) throw new Error('Failed to remove');
}

// --- UI: stacked card row ---
function row(it) {
  const el = document.createElement('article');
  el.className = 'news-card';

  const imgHtml = it.image
    ? `<img class="hero" src="${it.image}" alt="" />`
    : `<div class="ph" aria-hidden="true">📰</div>`;

  el.innerHTML = `
    ${imgHtml}
    <h3>${it.title || ''}</h3>
    <div class="meta">${it.source || ''}${it.isoDate ? ' • ' + fmtDate(it.isoDate) : ''}</div>
    <div class="actions">
      <button class="btn btn-white open">Read</button>
      <button class="btn btn-ghost remove">Remove</button>
    </div>
  `;

  // Open on main page in sidebar detail view
  el.querySelector('.open').addEventListener('click', () => {
    localStorage.setItem('lnm_open_item', JSON.stringify(it));
    location.href = '/';
  });

  // Remove from saved
  el.querySelector('.remove').addEventListener('click', async () => {
    if (!confirm('Remove from Read later?')) return;
    try {
      await removeSaved(it.key);
      loadSaved();
    } catch (e) {
      alert(e.message || 'Failed');
    }
  });

  return el;
}

// --- Load saved list ---
async function loadSaved() {
  const box = qs('#savedNewsBox');
  if (!box) return;

  // ensure grid class is present for responsiveness
  box.classList.add('saved-grid');

  box.innerHTML = 'Loading...';
  try {
    const items = await fetchSaved();
    if (!items.length) {
      box.innerHTML = `<div class="small" style="color:var(--muted)">No saved articles yet.</div>`;
      return;
    }
    box.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (const it of items) frag.appendChild(row(it));
    box.appendChild(frag);
  } catch (e) {
    box.innerHTML = 'Error: ' + e.message;
  }
}

// --- Boot ---
(async () => {
  const status = document.getElementById('status');
  try {
    const { user } = await me();
    status.textContent = '';
    document.getElementById('name').textContent = user.name || '';
    document.getElementById('email').textContent = user.email || '';
    document.getElementById('phone').textContent = user.phone || '';
    document.getElementById('role').textContent = user.role || '';
    document.getElementById('joined').textContent = fmtDate(user.createdAt);

    const adminBtn = document.getElementById('adminBtn');
    if (adminBtn) adminBtn.style.display = user.role === 'admin' ? 'inline-block' : 'none';

    await loadSaved();
  } catch (e) {
    status.textContent = 'You are not logged in.';
  }
})();

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  location.href = '/';
});
