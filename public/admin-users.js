// public/admin-users.js
function qs(s){ return document.querySelector(s); }
function fmtDate(s){ try { return new Date(s).toLocaleString(); } catch { return s; } }

// Lazy opener for the auth modal from auth.js (if present on page)
function openAuthModalSafely() {
  try { if (typeof openModal === 'function') openModal(); } catch {}
}

async function list() {
  const res = await fetch('/api/admin/users', {
    // IMPORTANT: ensure cookies (JWT) go with the request
    credentials: 'same-origin',
    headers: { 'Accept': 'application/json' }
  });

  if (!res.ok) {
    // Try to parse structured error, else text
    let errMsg = '';
    try { errMsg = (await res.json()).error || ''; } catch { errMsg = await res.text(); }
    const msg = `Failed to load users. HTTP ${res.status}. ${errMsg}`;

    if (res.status === 401 || res.status === 403) {
      // Not logged in / not admin. Show a friendly prompt + open login modal if available.
      document.body.innerHTML =
        '<div style="padding:24px;color:#e66">Admin access required. Please login as an admin user.</div>';
      openAuthModalSafely();
      throw new Error('Admin auth required: ' + msg);
    }

    throw new Error(msg); // true 5xx shows here
  }

  const { users } = await res.json();
  const tbody = qs('#usersBody');
  if (!tbody) return; // avoid NPE if table not on page

  tbody.innerHTML = (users || []).map(u => `
    <tr class="user-row" data-id="${u.id || u._id}">
      <td style="padding:10px;border-top:1px solid #222">${u.name || ''}</td>
      <td style="padding:10px;border-top:1px solid #222">${u.email || ''}</td>
      <td style="padding:10px;border-top:1px solid #222">${u.phone || ''}</td>
      <td style="padding:10px;border-top:1px solid #222">${u.role || ''}</td>
      <td style="padding:10px;border-top:1px solid #222">${fmtDate(u.createdAt)}</td>
    </tr>
    <tr class="user-details" style="display:none;background:#0f0f0f">
      <td colspan="5" style="padding:10px;border-top:1px solid #222">
        <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px">
          <div><div style="color:#888;font-size:12px">ID</div><div>${u.id || u._id || ''}</div></div>
          <div><div style="color:#888;font-size:12px">Updated</div><div>${fmtDate(u.updatedAt)}</div></div>
        </div>
      </td>
    </tr>`).join('');

  // Toggle details on row click
  tbody.querySelectorAll('.user-row').forEach(tr => {
    tr.addEventListener('click', () => {
      const next = tr.nextElementSibling;
      if (!next || !next.classList.contains('user-details')) return;
      next.style.display = next.style.display === 'none' ? '' : 'none';
    });
  });
}

// Hook up modal open/close if elements exist
qs('#addUserBtn')?.addEventListener('click', () => { const m = qs('#modal'); if (m) m.style.display = 'flex'; });
qs('#closeModal')?.addEventListener('click', () => { const m = qs('#modal'); if (m) m.style.display = 'none'; });

// Create user
qs('#addForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const data = Object.fromEntries(new FormData(form).entries());

  const res = await fetch('/api/admin/users', {
    method: 'POST',
    credentials: 'same-origin', // send cookie
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(data),
  });

  if (res.ok) {
    const m = qs('#modal'); if (m) m.style.display = 'none';
    form.reset();
    await list();
  } else {
    const j = await res.json().catch(()=>({error:'Failed'}));
    const errEl = qs('#err'); if (errEl) errEl.textContent = j.error || 'Failed';
    if (res.status === 401 || res.status === 403) openAuthModalSafely();
  }
});

// Initial load
list().catch(err => {
  console.error(err);
});
