// public/admin.js
const tokenKey = "lnm_admin_token";
let regionsCache = []; // keep full list for filtering
let isVerified = false; // gate state

// ---------- Toast ----------
function showToast(message, type = "info") {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = message;
  const border = { success: "#00b37e", error: "#e10600", info: "#3ea6ff" }[type] || "#3ea6ff";
  el.style.borderLeftColor = border;
  el.style.opacity = "1";
  el.style.transform = "translateY(0)";
  el.style.pointerEvents = "auto";
  clearTimeout(el._t);
  el._t = setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateY(8px)";
    el.style.pointerEvents = "none";
  }, 1800);
}

// ---------- Gate UI helpers ----------
function gateUI() {
  const layout = document.getElementById("adminLayout");
  const gate = document.getElementById("gateNotice");
  if (!layout || !gate) return;
  if (isVerified) {
    layout.style.display = "flex";
    gate.style.display = "none";
  } else {
    layout.style.display = "none";
    gate.style.display = "block";
  }
}

function disableForm(disabled) {
  const form = document.getElementById("regionForm");
  if (!form) return;
  Array.from(form.elements).forEach(el => el.disabled = !!disabled);
}

// ---------- Token helpers ----------
function getToken() { return (localStorage.getItem(tokenKey) || "").trim(); }
function setToken(t) {
  const v = (t || "").trim();
  localStorage.setItem(tokenKey, v);
  // Any change to the token invalidates current verification
  isVerified = false;
  renderTokenStatus();
  gateUI();
  // Clear regions UI until verified again
  const list = document.getElementById("regionsList");
  if (list) list.innerHTML = "";
  disableForm(true);
}

function renderTokenStatus() {
  const badge = document.getElementById("tokenStatus");
  if (!badge) return;
  if (!isVerified) {
    badge.textContent = "Not verified";
    badge.style.background = "#111";
    badge.style.border = "1px solid var(--border)";
    badge.style.color = "var(--muted)";
  } else {
    badge.innerHTML = `<span style="display:inline-flex;align-items:center;gap:6px;">
      <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#00b37e;"></span>
      Verified admin
    </span>`;
    badge.style.background = "rgba(0,179,126,0.12)";
    badge.style.border = "1px solid rgba(0,179,126,0.35)";
    badge.style.color = "#9AF0D3";
  }
}

// ---------- API wrapper (adds token header, strict 403 handling) ----------
async function api(path, opts = {}) {
  const headers = { "Content-Type": "application/json", "Accept": "application/json", ...(opts.headers || {}) };
  const token = getToken();
  if (token) headers["x-admin-token"] = token;
  const res = await fetch(path, { ...opts, headers });
  if (!res.ok) {
    // Treat 403 from server as hard invalid token
    if (res.status === 403) throw new Error("INVALID_ADMIN_TOKEN");
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error || res.statusText);
  }
  // If endpoint returns no body (e.g., DELETE), return {}
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

// ---------- Gate logic ----------
async function verifyTokenAndUnlock() {
  const token = getToken();
  if (!token) {
    isVerified = false;
    renderTokenStatus();
    gateUI();
    showToast("Enter a token first", "info");
    return;
  }

  try {
    // Call a protected GET to validate token
    await api("/api/admin/regions");
    isVerified = true;
    renderTokenStatus();
    gateUI();
    disableForm(false);
    showToast("Token verified", "success");
    await loadRegions();
  } catch (e) {
    isVerified = false;
    renderTokenStatus();
    gateUI();
    disableForm(true);
    showToast(e.message === "INVALID_ADMIN_TOKEN" ? "Invalid admin token" : (e.message || "Verification failed"), "error");
  }
}

// ---------- Feeds UI ----------
function feedRow(url = "", category = "others") {
  const wrap = document.createElement("div");
  wrap.style.display = "grid";
  wrap.style.gridTemplateColumns = "1fr 140px auto";
  wrap.style.gap = "6px";
  wrap.style.marginBottom = "6px";
  wrap.innerHTML = `
    <input class="feed-url input" placeholder="Feed URL" value="${url}" />
    <select class="feed-cat input">
      <option value="war" ${category === "war" ? "selected" : ""}>war</option>
      <option value="politics" ${category === "politics" ? "selected" : ""}>politics</option>
      <option value="culture" ${category === "culture" ? "selected" : ""}>culture</option>
      <option value="economy" ${category === "economy" ? "selected" : ""}>economy</option>
      <option value="society" ${category === "society" ? "selected" : ""}>society</option>
      <option value="climate" ${category === "climate" ? "selected" : ""}>climate</option>
      <option value="peace" ${category === "peace" ? "selected" : ""}>peace</option>
      <option value="demise" ${category === "demise" ? "selected" : ""}>demise</option>
      <option value="others" ${category === "others" ? "selected" : ""}>others</option>
    </select>
    <button type="button" class="remove btn">Remove</button>
  `;
  wrap.querySelector(".remove").addEventListener("click", () => wrap.remove());
  return wrap;
}

// ---------- Regions (list, filter, CRUD) ----------
async function loadRegions() {
  if (!isVerified) return;
  const list = document.getElementById("regionsList");
  list.innerHTML = "Loading...";
  try {
    const regions = await api("/api/admin/regions");
    // Must be an array; otherwise backend is wrong
    if (!Array.isArray(regions)) throw new Error("Regions API must return an array");
    regionsCache = regions.slice();
    renderCountryFilter(regionsCache);
    renderRegionsList(regionsCache);
  } catch (e) {
    list.textContent = "Error: " + (e.message || "Failed to load regions");
  }
}

function renderCountryFilter(regions) {
  const sel = document.getElementById("countryFilter");
  if (!sel) return;
  const countries = Array.from(new Set(regions.map((r) => r.country))).sort();
  const current = sel.value || "__ALL__";
  sel.innerHTML = `<option value="__ALL__">All countries</option>`;
  for (const c of countries) {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    sel.appendChild(opt);
  }
  sel.value = countries.includes(current) ? current : "__ALL__";
  sel.onchange = () => filterRegions();
}

function filterRegions() {
  const sel = document.getElementById("countryFilter");
  const val = sel.value;
  if (!val || val === "__ALL__") renderRegionsList(regionsCache);
  else renderRegionsList(regionsCache.filter((r) => r.country === val));
}

function renderRegionsList(regions) {
  const list = document.getElementById("regionsList");
  list.innerHTML = "";
  if (!regions.length) {
    list.innerHTML = `<div class="small" style="color:var(--muted);">No regions yet.</div>`;
    return;
  }
  for (const r of regions) {
    const row = document.createElement("div");
    row.style.border = "1px solid var(--border)";
    row.style.borderRadius = "10px";
    row.style.padding = "8px";
    row.style.marginBottom = "8px";
    row.innerHTML = `
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <div style="font-weight:600">${r.name}</div>
        <div class="small" style="color:var(--muted);">${r.country}</div>
        <div class="small" style="color:var(--muted);">(${r.lat}, ${r.lng})</div>
        <div class="small" style="color:var(--muted);">${(r.feeds || []).length} feeds</div>
        <div style="margin-left:auto;display:flex;gap:6px;">
          <button class="edit btn">Edit</button>
          <button class="del btn">Delete</button>
        </div>
      </div>
    `;
    row.querySelector(".edit").addEventListener("click", () => fillForm(r));
    row.querySelector(".del").addEventListener("click", async () => {
      if (!confirm("Delete region?")) return;
      try {
        await api("/api/admin/regions/" + r._id, { method: "DELETE" });
        showToast("Region deleted", "success");
        await loadRegions();
      } catch (err) {
        showToast(err.message || "Delete failed", "error");
      }
    });
    list.appendChild(row);
  }
}

// ---------- Form ----------
function fillForm(r) {
  document.getElementById("regionId").value = r._id || "";
  document.getElementById("name").value = r.name || "";
  document.getElementById("country").value = r.country || "";
  document.getElementById("lat").value = r.lat ?? "";
  document.getElementById("lng").value = r.lng ?? "";
  const wrap = document.getElementById("feedsWrap");
  wrap.innerHTML = "";
  for (const f of r.feeds || []) wrap.appendChild(feedRow(f.url, f.category || "others"));
  showToast("Loaded for edit: " + (r.name || "Region"), "info");
}

function emptyForm() {
  fillForm({ name: "", country: "", lat: "", lng: "", feeds: [] });
}

// ---------- UI Normalization (match Account page styles) ----------
function unifyButtons() {
  // Primary actions use white button; others standard dark
  const addFeedBtn = document.getElementById("addFeedBtn");
  const resetBtn = document.getElementById("resetBtn");
  const saveTokenBtn = document.getElementById("saveTokenBtn");
  const verifyBtn = document.getElementById("verifyBtn"); // if present

  [addFeedBtn, resetBtn, verifyBtn].forEach(b => { if (b) b.classList.add("btn"); });
  if (saveTokenBtn) { saveTokenBtn.classList.add("btn", "btn-white"); }

  // Normalize top nav buttons if present
  const backHome = document.getElementById("backHomeBtn");
  const adminUsers = document.getElementById("adminUsersBtn");
  if (backHome) backHome.classList.add("btn");
  if (adminUsers) adminUsers.classList.add("btn", "btn-white");
}

// ---------- Init ----------
document.addEventListener("DOMContentLoaded", () => {
  renderTokenStatus();
  gateUI();
  disableForm(true);
  unifyButtons();

  // Auto-verify if a token was previously saved
  if (getToken()) verifyTokenAndUnlock();

  document.getElementById("saveTokenBtn")?.addEventListener("click", async () => {
    const t = document.getElementById("tokenInput").value.trim();
    setToken(t);
    showToast("Admin token saved", "info");
    await verifyTokenAndUnlock();
  });

  document.getElementById("addFeedBtn")?.addEventListener("click", () => {
    document.getElementById("feedsWrap").appendChild(feedRow());
  });

  document.getElementById("resetBtn")?.addEventListener("click", () => {
    emptyForm();
    showToast("Form reset", "info");
  });

  document.getElementById("regionForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!isVerified) return;
    const id = document.getElementById("regionId").value.trim();
    const payload = {
      name: document.getElementById("name").value.trim(),
      country: document.getElementById("country").value.trim(),
      lat: parseFloat(document.getElementById("lat").value),
      lng: parseFloat(document.getElementById("lng").value),
      feeds: Array.from(document.querySelectorAll("#feedsWrap > div"))
        .map((row) => ({
          url: row.querySelector(".feed-url").value.trim(),
          category: row.querySelector(".feed-cat").value,
        }))
        .filter((f) => f.url),
    };
    try {
      if (id) {
        await api("/api/admin/regions/" + id, { method: "PUT", body: JSON.stringify(payload) });
        showToast("Region updated", "success");
      } else {
        await api("/api/admin/regions", { method: "POST", body: JSON.stringify(payload) });
        showToast("Region created", "success");
      }
      emptyForm();
      await loadRegions();
    } catch (e2) {
      showToast(e2.message || "Save failed", "error");
    }
  });
});
