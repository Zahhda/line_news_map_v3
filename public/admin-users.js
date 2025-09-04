// public/admin-users.js
(function () {
  /* ---------------- Utilities ---------------- */
  function qs(s, r = document) { return r.querySelector(s); }
  function qsa(s, r = document) { return Array.from(r.querySelectorAll(s)); }
  function fmtDate(s){ try { return s ? new Date(s).toLocaleString() : ''; } catch { return s || ''; } }
  function toStrId(id){ return String(id ?? ''); }

  async function fetchJSON(url, opts = {}) {
    const res = await fetch(url, {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', ...(opts.headers || {}) },
      ...opts
    });
    if (!res.ok) {
      let msg = `Request failed (${res.status})`;
      try { const j = await res.json(); if (j && j.error) msg = j.error; } catch {}
      const err = new Error(msg); err.status = res.status; throw err;
    }
    if (res.status === 204) return null;
    return res.json();
  }
  function openAuthModalSafely() { try { if (typeof openModal === 'function') openModal(); } catch {} }

  /* ---------------- Ensure Region View Modal exists ---------------- */
  function ensureRegionViewModal() {
    if (qs('#regionViewModal')) return;

    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <div id="regionViewModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);align-items:center;justify-content:center;z-index:9999">
        <div class="rv-card" style="background:#0b0b0b;border:1px solid #222;border-radius:10px;padding:16px;width:min(900px,96vw);max-height:90vh;overflow:auto">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
            <h3 style="margin:0">Edit Region View</h3>
            <button id="rvClose" class="btn">✕</button>
          </div>

          <div style="display:flex;gap:12px;margin-bottom:12px;flex-wrap:wrap;align-items:center">
            <button id="rvTabCountries" class="btn">Countries</button>
            <button id="rvTabRegions" class="btn">Regions</button>
            <div style="margin-left:auto;display:flex;gap:12px;align-items:center;flex-wrap:wrap">
              <span id="rvSummaryCountries" style="color:var(--muted)"></span>
              <span id="rvSummaryRegions" style="color:var(--muted)"></span>
              <label for="rvLimit" style="color:var(--muted)">Per-country region limit</label>
              <input id="rvLimit" type="number" min="0" placeholder="blank = unlimited" style="padding:6px;border:1px solid #333;border-radius:8px;width:160px" />
              <button id="rvSave" class="btn">Save</button>
            </div>
          </div>

          <div id="rvPaneCountries">
            <div style="display:flex;gap:16px;flex-wrap:wrap">
              <div style="flex:1 1 360px">
                <div style="font-weight:600;margin-bottom:6px">Available Countries (<span id="rvAvailCountriesCount">0</span>)</div>
                <input id="rvCountrySearch" placeholder="Search countries" style="width:100%;padding:8px;border:1px solid #333;border-radius:8px;margin-bottom:8px" />
                <div id="rvAvailCountries" style="border:1px solid #222;border-radius:8px;padding:8px;max-height:300px;overflow:auto"></div>
              </div>
              <div style="flex:1 1 360px">
                <div style="font-weight:600;margin-bottom:6px">Selected Countries (<span id="rvSelCountriesCount">0</span>)</div>
                <div id="rvSelCountries" style="border:1px solid #222;border-radius:8px;padding:8px;max-height:340px;overflow:auto"></div>
              </div>
            </div>
          </div>

          <div id="rvPaneRegions" style="display:none">
            <div style="display:flex;gap:16px;flex-wrap:wrap">
              <div style="flex:1 1 240px">
                <label style="font-weight:600">Filter by country</label>
                <select id="rvRegionCountryFilter" style="width:100%;padding:8px;border:1px solid #333;border-radius:8px;margin:6px 0 12px"></select>
              </div>
              <div style="flex:2 1 360px">
                <div style="font-weight:600;margin-bottom:6px">Available Regions (<span id="rvAvailRegionsCount">0</span>)</div>
                <input id="rvRegionSearch" placeholder="Search regions" style="width:100%;padding:8px;border:1px solid #333;border-radius:8px;margin-bottom:8px" />
                <div id="rvAvailRegions" style="border:1px solid #222;border-radius:8px;padding:8px;max-height:300px;overflow:auto"></div>
              </div>
              <div style="flex:2 1 360px">
                <div style="font-weight:600;margin-bottom:6px">Selected Regions (<span id="rvSelRegionsCount">0</span>)</div>
                <div id="rvSelRegions" style="border:1px solid #222;border-radius:8px;padding:8px;max-height:340px;overflow:auto"></div>
              </div>
            </div>
          </div>

        </div>
      </div>`;
    document.body.appendChild(wrapper.firstElementChild);
  }

  /* ---------------- Global RV state ---------------- */
  let RV = {
    userId: null,
    countries: [],
    regions: [], // { _id, name, country }
    allowedCountries: new Set(),
    allowedRegionIds: new Set(),
    limit: null
  };

  function rvEl() {
    return {
      modal: qs('#regionViewModal'),
      close: qs('#rvClose'),
      save: qs('#rvSave'),
      tabCountries: qs('#rvTabCountries'),
      tabRegions: qs('#rvTabRegions'),
      paneCountries: qs('#rvPaneCountries'),
      paneRegions: qs('#rvPaneRegions'),
      limit: qs('#rvLimit'),

      summaryCountries: qs('#rvSummaryCountries'),
      summaryRegions: qs('#rvSummaryRegions'),

      availCountries: qs('#rvAvailCountries'),
      selCountries: qs('#rvSelCountries'),
      availCountriesCount: qs('#rvAvailCountriesCount'),
      selCountriesCount: qs('#rvSelCountriesCount'),
      countrySearch: qs('#rvCountrySearch'),

      regionCountryFilter: qs('#rvRegionCountryFilter'),
      availRegions: qs('#rvAvailRegions'),
      selRegions: qs('#rvSelRegions'),
      availRegionsCount: qs('#rvAvailRegionsCount'),
      selRegionsCount: qs('#rvSelRegionsCount'),
      regionSearch: qs('#rvRegionSearch'),
    };
  }

  function openRV() { const { modal } = rvEl(); if (modal) modal.style.display = 'flex'; }
  function closeRV() { const { modal } = rvEl(); if (modal) modal.style.display = 'none'; RV = { ...RV, userId: null }; }

  /* ---------------- Summaries ---------------- */
  function updateSummaries() {
    const { summaryCountries, summaryRegions } = rvEl();
    const totalCountries = RV.countries.length;
    const selectedCountries = RV.allowedCountries.size;

    const totalRegions = RV.regions.length;
    const selectedRegions = RV.allowedRegionIds.size;

    if (summaryCountries) summaryCountries.textContent = `Countries: ${selectedCountries}/${totalCountries}`;
    if (summaryRegions) summaryRegions.textContent = `Regions: ${selectedRegions}/${totalRegions}`;
  }

  /* ---------------- Countries rendering ---------------- */
  function renderCountries() {
    const { countries } = RV;
    const { availCountries, selCountries, availCountriesCount, selCountriesCount, countrySearch } = rvEl();
    if (!availCountries || !selCountries) return;
    const q = (countrySearch?.value || '').toLowerCase();

    const available = countries.filter(c => !RV.allowedCountries.has(c) && c.toLowerCase().includes(q));
    const selected  = countries.filter(c =>  RV.allowedCountries.has(c) && c.toLowerCase().includes(q));

    availCountries.innerHTML = available.map(c => `
      <label style="display:flex;align-items:center;gap:8px;padding:6px 4px">
        <input type="checkbox" data-country="${c}" class="rv-country-add" />
        <span>${c}</span>
      </label>
    `).join('');

    selCountries.innerHTML = selected.map(c => `
      <label style="display:flex;align-items:center;gap:8px;padding:6px 4px">
        <input type="checkbox" data-country="${c}" checked class="rv-country-rem" />
        <span>${c}</span>
      </label>
    `).join('');

    if (availCountriesCount) availCountriesCount.textContent = available.length;
    if (selCountriesCount) selCountriesCount.textContent = selected.length;

    qsa('.rv-country-add').forEach(cb => cb.addEventListener('change', (e) => {
      const v = e.target.dataset.country;
      if (e.target.checked) RV.allowedCountries.add(v);
      renderCountries();
      renderRegionsCountryFilter();
      renderRegions();
      updateSummaries();
    }));

    qsa('.rv-country-rem').forEach(cb => cb.addEventListener('change', (e) => {
      const v = e.target.dataset.country;
      if (!e.target.checked) RV.allowedCountries.delete(v);
      renderCountries();
      renderRegionsCountryFilter();
      renderRegions();
      updateSummaries();
    }));

    updateSummaries();
  }

  /* ---------------- Regions rendering ---------------- */
  function renderRegionsCountryFilter() {
    const { regionCountryFilter } = rvEl();
    if (!regionCountryFilter) return;

    const allCountries = new Set(RV.regions.map(r => r.country));
    const list = RV.allowedCountries.size ? Array.from(RV.allowedCountries) : Array.from(allCountries);
    list.sort();

    const current = regionCountryFilter.value;
    regionCountryFilter.innerHTML = ['<option value="">All countries</option>']
      .concat(list.map(c => `<option value="${c}">${c}</option>`)).join('');
    if (list.includes(current)) regionCountryFilter.value = current;

    regionCountryFilter.onchange = () => { renderRegions(); };
  }

  function renderRegions() {
    const { availRegions, selRegions, availRegionsCount, selRegionsCount, regionSearch, regionCountryFilter } = rvEl();
    if (!availRegions || !selRegions) return;
    const q = (regionSearch?.value || '').toLowerCase();
    const countryFilter = regionCountryFilter?.value || '';

    const inCountry = (r) => !countryFilter || r.country === countryFilter;
    const inSearch = (r) => r.name.toLowerCase().includes(q) || r.country.toLowerCase().includes(q);

    const available = RV.regions.filter(r => !RV.allowedRegionIds.has(r._id) && inCountry(r) && inSearch(r));
    const selected  = RV.regions.filter(r =>  RV.allowedRegionIds.has(r._id) && inCountry(r) && inSearch(r));

    availRegions.innerHTML = available.map(r => `
      <label style="display:flex;align-items:center;gap:8px;padding:6px 4px">
        <input type="checkbox" data-rid="${r._id}" class="rv-region-add" />
        <span>${r.country} • ${r.name}</span>
      </label>
    `).join('');

    selRegions.innerHTML = selected.map(r => `
      <label style="display:flex;align-items:center;gap:8px;padding:6px 4px">
        <input type="checkbox" data-rid="${r._id}" checked class="rv-region-rem" />
        <span>${r.country} • ${r.name}</span>
      </label>
    `).join('');

    if (availRegionsCount) availRegionsCount.textContent = available.length;
    if (selRegionsCount) selRegionsCount.textContent = selected.length;

    qsa('.rv-region-add').forEach(cb => cb.addEventListener('change', (e) => {
      const id = e.target.dataset.rid;
      if (e.target.checked) RV.allowedRegionIds.add(id);
      renderRegions();
      updateSummaries();
    }));
    qsa('.rv-region-rem').forEach(cb => cb.addEventListener('change', (e) => {
      const id = e.target.dataset.rid;
      if (!e.target.checked) RV.allowedRegionIds.delete(id);
      renderRegions();
      updateSummaries();
    }));

    updateSummaries();
  }

  /* ---------------- Open / Save Region View ---------------- */
  async function onOpenRegionView(e) {
    const tr = e.target.closest('tr');
    const id = tr?.dataset.id;
    RV.userId = toStrId(id);
    if (!RV.userId) return;

    ensureRegionViewModal();

    try {
      const data = await fetchJSON(`/api/admin/users/${encodeURIComponent(RV.userId)}/access`, {
        headers: { 'Cache-Control': 'no-cache' }
      });
      RV.countries = data?.countries || [];
      RV.regions = data?.regions || [];
      RV.allowedCountries = new Set((data?.access?.allowedCountries || []).map(String));
      RV.allowedRegionIds = new Set((data?.access?.allowedRegionIds || []).map(String));
      RV.limit = data?.access?.perCountryRegionLimit ?? null;

      const { limit, tabCountries, tabRegions, paneCountries, paneRegions } = rvEl();
      if (limit) limit.value = RV.limit ?? '';

      if (paneCountries && paneRegions) {
        paneCountries.style.display = '';
        paneRegions.style.display = 'none';
        if (tabCountries) tabCountries.onclick = () => { paneCountries.style.display=''; paneRegions.style.display='none'; };
        if (tabRegions)   tabRegions.onclick   = () => { paneCountries.style.display='none'; paneRegions.style.display=''; };
      }

      renderCountries();
      renderRegionsCountryFilter();
      renderRegions();
      openRV();
    } catch (err) {
      if (err.status === 401 || err.status === 403) openAuthModalSafely();
      else alert(err.message || 'Failed to load access');
    }
  }

  async function onSaveRegionView() {
    try {
      const body = {
        allowedCountries: Array.from(RV.allowedCountries),
        allowedRegionIds: Array.from(RV.allowedRegionIds),
        perCountryRegionLimit: (qs('#rvLimit')?.value === '' ? null : parseInt(qs('#rvLimit')?.value || '0', 10))
      };
      await fetchJSON(`/api/admin/users/${encodeURIComponent(RV.userId)}/access`, {
        method: 'PATCH',
        body: JSON.stringify(body)
      });
      closeRV();
    } catch (err) {
      if (err.status === 401 || err.status === 403) openAuthModalSafely();
      else alert(err.message || 'Failed to save');
    }
  }

  /* ---------------- Users table: list + actions ---------------- */
  async function list() {
    const tbody = qs('#usersBody');
    if (!tbody) return;

    const data = await fetchJSON('/api/admin/users', { headers: { 'Cache-Control': 'no-cache' }});
    const users = data?.users || [];

    tbody.innerHTML = users.map(u => {
      const id = toStrId(u.id ?? u._id);
      return `
        <tr data-id="${id}">
          <td style="padding:10px;border-top:1px solid #222">${u.name || ''}</td>
          <td style="padding:10px;border-top:1px solid #222">${u.email || ''}</td>
          <td style="padding:10px;border-top:1px solid #222">${u.role || ''}</td>
          <td style="padding:10px;border-top:1px solid #222">${fmtDate(u.createdAt)}</td>
          <td style="padding:10px;border-top:1px solid #222">
            <div style="display:inline-flex;gap:6px;flex-wrap:wrap">
              <button class="btn btn-sm rvBtn">Region View</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    qsa('.editUserBtn', tbody).forEach(btn => {
      btn.addEventListener('click', function () {
        // no-op: keep your existing edit behavior intact
      });
    });

    qsa('.rvBtn', tbody).forEach(btn => btn.addEventListener('click', onOpenRegionView));
  }

  /* ---------------- Create user form (kept compatible) ---------------- */
  function wireCreateForm() {
    const f = qs('#createForm');
    if (!f) return;
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const body = {
        name: f.name?.value?.trim(),
        email: f.email?.value?.trim(),
        phone: f.phone?.value?.trim(),
        password: f.password?.value,
        role: f.role?.value
      };
      try {
        await fetchJSON('/api/admin/users', { method: 'POST', body: JSON.stringify(body) });
        f.reset();
        const errEl = qs('#err'); if (errEl) errEl.textContent = '';
        await list();
      } catch (err) {
        const errEl = qs('#err'); if (errEl) errEl.textContent = err.message || 'Failed';
        if (err.status === 401 || err.status === 403) openAuthModalSafely();
      }
    });
  }

  /* ---------------- Modal wiring (close/esc/overlay) ---------------- */
  function wireModalBasics() {
    ensureRegionViewModal();
    const { modal, close, save } = rvEl();
    if (!modal) return;

    close?.addEventListener('click', closeRV);
    save?.addEventListener('click', onSaveRegionView);

    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeRV();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.style.display === 'flex') {
        closeRV();
      }
    });

    qs('#rvCountrySearch')?.addEventListener('input', renderCountries);
    qs('#rvRegionSearch')?.addEventListener('input', renderRegions);
  }

  /* ---------------- Init ---------------- */
  document.addEventListener('DOMContentLoaded', async () => {
    wireModalBasics();
    wireCreateForm();
    try { await list(); } catch (e) { console.error(e); }
  });
})();
