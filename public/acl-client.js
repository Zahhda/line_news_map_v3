// public/acl-client.js
(function () {
  // ===== Utilities =====
  const qs  = (s, r = document) => r.querySelector(s);
  const qsa = (s, r = document) => Array.from(r.querySelectorAll(s));

  async function fetchJSON(url, opts = {}) {
    const res = await fetch(url, {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Accept': 'application/json', ...(opts.headers || {}) },
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

  // ===== Configuration: non-invasive selectors =====
  // We try common patterns. If something isn't found, we safely skip it.
  const selectors = {
    countrySelects: [
      '#country',              // <select id="country">
      '#countrySelect',        // <select id="countrySelect">
      '[name="country"]',      // <select name="country">
      '[data-role="country-select"]',
    ],
    regionSelects: [
      '#region',
      '#regionSelect',
      '[name="region"]',
      '[data-role="region-select"]',
    ],
    countryChips: [
      '.country-chip',         // <button class="country-chip" data-country="India">
      '[data-country-chip]',   // <div data-country-chip data-country="USA">
      '[data-country]',        // generic
    ],
    regionItems: [
      '.region-item',          // <div class="region-item" data-region-id="...">
      '[data-region-id]',
    ]
  };

  // ===== State =====
  let allowedCountries = new Set();
  let allowedRegionsByCountry = new Map(); // country -> array of region objects
  let allCountries = []; // for reference

  // ===== DOM helpers =====
  function findFirst(selList) {
    for (const sel of selList) {
      const el = qs(sel);
      if (el) return el;
    }
    return null;
  }

  function getCurrentCountry(selectEl) {
    if (!selectEl) return null;
    const v = selectEl.value || selectEl.getAttribute('data-value') || null;
    return v && v.trim() ? v.trim() : null;
  }

  function setOptions(selectEl, values) {
    if (!selectEl) return;
    const current = selectEl.value;
    selectEl.innerHTML = values.map(v => `<option value="${v}">${v}</option>`).join('');
    // try to preserve selection if still valid
    if (current && values.includes(current)) selectEl.value = current;
    // else select first (optional)
    if (!selectEl.value && values.length) selectEl.value = values[0];
    // Fire change so existing app code reacts
    const evt = new Event('change', { bubbles: true });
    selectEl.dispatchEvent(evt);
  }

  function hideNonAllowedCountryChips() {
    for (const sel of selectors.countryChips) {
      const nodes = qsa(sel);
      if (!nodes.length) continue;
      nodes.forEach(el => {
        const c = (el.getAttribute('data-country') || el.textContent || '').trim();
        if (!c) return;
        el.style.display = allowedCountries.has(c) ? '' : 'none';
      });
    }
  }

  function hideNonAllowedRegionItems(country, allowedRegionIds) {
    // If your region cards have data-region-id, we’ll filter by id; otherwise we leave them.
    for (const sel of selectors.regionItems) {
      const items = qsa(sel);
      if (!items.length) continue;
      items.forEach(el => {
        const rid = el.getAttribute('data-region-id');
        if (!rid) return;
        el.style.display = allowedRegionIds.has(rid) ? '' : 'none';
      });
    }
  }

  // ===== Core logic =====
  async function loadAllowedCountries() {
    const data = await fetchJSON('/api/regions/countries');
    // backend already filtered for the logged-in user
    const countries = (data?.countries || []).map(String);
    countries.sort();
    allCountries = countries;
    allowedCountries = new Set(countries);
    return countries;
  }

  async function loadAllowedRegionsForCountry(country) {
    if (!country) return [];
    // Regions endpoint is already filtered server-side for the logged-in user
    const regions = await fetchJSON(`/api/regions?country=${encodeURIComponent(country)}`);
    // cache in memory
    allowedRegionsByCountry.set(country, regions);
    return regions;
  }

  async function applyCountrySelectFiltering() {
    const countrySelect = findFirst(selectors.countrySelects);
    if (!countrySelect) return;

    // Build country list from allowedCountries set
    const allowedList = Array.from(allowedCountries);
    setOptions(countrySelect, allowedList);

    hideNonAllowedCountryChips();
  }

  async function applyRegionSelectFiltering(forcedCountry = null) {
    const regionSelect = findFirst(selectors.regionSelects);
    const countrySelect = findFirst(selectors.countrySelects);

    // Determine selected country
    const country = forcedCountry || getCurrentCountry(countrySelect);
    if (!country) {
      // No country selected — empty the regions select
      if (regionSelect) setOptions(regionSelect, []);
      return;
    }

    // If frontend allowed a country outside permissions, guard here:
    if (!allowedCountries.has(country)) {
      // force it to a valid one (first allowed)
      const first = Array.from(allowedCountries)[0];
      if (countrySelect && first) {
        countrySelect.value = first;
        const evt = new Event('change', { bubbles: true });
        countrySelect.dispatchEvent(evt);
      }
    }

    // Load / reuse allowed regions for the country
    let regions = allowedRegionsByCountry.get(country);
    if (!regions) {
      regions = await loadAllowedRegionsForCountry(country);
    }

    // The API returns full region objects; create a label list for <select>
    const labels = (regions || []).map(r => r.name);
    if (regionSelect) setOptions(regionSelect, labels);

    // If you also show region cards/items with ids, hide disallowed ones
    const allowedIds = new Set((regions || []).map(r => String(r._id)));
    hideNonAllowedRegionItems(country, allowedIds);
  }

  function wireCountryChange() {
    const countrySelect = findFirst(selectors.countrySelects);
    if (!countrySelect) return;
    countrySelect.addEventListener('change', () => {
      applyRegionSelectFiltering(); // reacts to new country
    });
  }

  // ===== Boot =====
  document.addEventListener('DOMContentLoaded', async () => {
    try {
      await loadAllowedCountries();
      await applyCountrySelectFiltering();
      await applyRegionSelectFiltering();
      wireCountryChange();
    } catch (e) {
      // If the user isn't logged in or endpoint fails, do nothing (fail open)
      console.warn('[acl-client] filtering skipped:', e.message || e);
    }
  });
})();
