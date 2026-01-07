const API_URL = "https://script.google.com/macros/s/AKfycbyxfNO9zWm3CT-GACd0oQE_ambHcJ33VHrQOxVxQIIEEpuv53G_A08cWqHXOsYcofaD/exec";

let bottles = [];
let filtered = [];
let currentView = "inventory";
let currentDetails = null;
let currentPlaceFilter = "";

const $ = (id) => document.getElementById(id);

function setStatus(text) {
  $("syncStatus").textContent = text;
}

function formatName(b) {
  const name = (b.nom || "").trim();
  const dom = (b.domaine || "").trim();
  if (name && dom && !name.toLowerCase().includes(dom.toLowerCase())) return `${name} — ${dom}`;
  return name || dom || "Vin";
}

function safeStr(v) {
  return (v === null || v === undefined) ? "" : String(v);
}

function norm(v) {
  return safeStr(v).toLowerCase().trim();
}

function toInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseDate(v) {
  const d = new Date(v);
  return isNaN(d.getTime()) ? new Date(0) : d;
}

function keyOf(b) {
  return b.key || `${b.ean || ""}|${b.millesime || "NV"}`;
}

async function apiGet(url) {
  const res = await fetch(url, { method: "GET" });
  return res.json();
}

async function apiPost(payload) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return res.json();
}

function computeStats(list) {
  const totalBottles = list.reduce((sum, b) => sum + toInt(b.quantite), 0);
  const totalRefs = list.length;
  const low = list.filter(b => toInt(b.quantite) <= 2).length;
  return { totalBottles, totalRefs, low };
}

function renderStats() {
  const s = computeStats(bottles);
  $("stats").innerHTML = `
    <div class="stat">${s.totalBottles} bouteilles</div>
    <div class="stat">${s.totalRefs} vins</div>
    <div class="stat">${s.low} stock bas</div>
  `;
}

function buildFilterOptions() {
  const couleurs = new Set();
  const years = new Set();
  const places = new Set();

  bottles.forEach(b => {
    const c = safeStr(b.couleur).trim();
    if (c) couleurs.add(c);
    const y = safeStr(b.millesime).trim();
    if (y) years.add(y);
    const p = safeStr(b.emplacement).trim();
    if (p) places.add(p);
  });

  const fill = (sel, values, labelFirst) => {
    sel.innerHTML = `<option value="">${labelFirst}</option>` +
      Array.from(values).sort().map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
  };

  fill($("filterCouleur"), couleurs, "Couleur (toutes)");
  fill($("filterMillesime"), years, "Millésime (tous)");
  fill($("filterEmplacement"), places, "Emplacement (tous)");
}

function escapeHtml(s) {
  return safeStr(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function applyFilters() {
  const q = norm($("search").value);
  const fc = $("filterCouleur").value;
  const fy = $("filterMillesime").value;
  const fp = $("filterEmplacement").value;
  const sortBy = $("sortBy").value;

  filtered = bottles.filter(b => {
    if (q) {
      const blob = [
        b.nom, b.domaine, b.appellation, b.millesime, b.emplacement
      ].map(norm).join(" ");
      if (!blob.includes(q)) return false;
    }
    if (fc && safeStr(b.couleur).trim() !== fc) return false;
    if (fy && safeStr(b.millesime).trim() !== fy) return false;
    if (fp && safeStr(b.emplacement).trim() !== fp) return false;
    if (currentPlaceFilter) {
      if (safeStr(b.emplacement).trim() !== currentPlaceFilter) return false;
    }
    return true;
  });

  sortList(filtered, sortBy);
}

function sortList(list, sortBy) {
  if (sortBy === "qty_desc") {
    list.sort((a, b) => toInt(b.quantite) - toInt(a.quantite));
  } else if (sortBy === "name_asc") {
    list.sort((a, b) => formatName(a).localeCompare(formatName(b), "fr"));
  } else if (sortBy === "place_asc") {
    list.sort((a, b) => safeStr(a.emplacement).localeCompare(safeStr(b.emplacement), "fr"));
  } else if (sortBy === "year_desc") {
    list.sort((a, b) => safeStr(b.millesime).localeCompare(safeStr(a.millesime), "fr"));
  } else {
    // updated_desc
    list.sort((a, b) => parseDate(b.updated_at) - parseDate(a.updated_at));
  }
}

function renderList() {
  $("list").innerHTML = filtered.map(b => {
    const title = escapeHtml(formatName(b));
    const sub = escapeHtml(`${safeStr(b.appellation)}${b.appellation ? " — " : ""}${safeStr(b.millesime)}`);
    const meta = escapeHtml(`${safeStr(b.emplacement) || "Emplacement non renseigné"} • ${safeStr(b.couleur) || "Couleur ?"} • ${safeStr(b.format) || "Format ?"}`);
    const qty = toInt(b.quantite);

    return `
      <div class="card">
        <div class="cardTop">
          <div>
            <div class="cardTitle">${title}</div>
            <div class="cardSub">${sub}</div>
            <div class="cardMeta">${meta}</div>
            <div style="margin-top:10px;">
              <button class="smallBtn" data-details="${escapeHtml(keyOf(b))}">Détails</button>
            </div>
          </div>
          <div class="qty">
            <div class="qtyNum">${qty}</div>
            <div class="qtyBtns">
              <button class="btn secondary" data-dec="${escapeHtml(keyOf(b))}">–</button>
              <button class="btn primary" data-inc="${escapeHtml(keyOf(b))}">+</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join("");

  // handlers
  document.querySelectorAll("[data-inc]").forEach(btn => {
    btn.addEventListener("click", () => changeQty(btn.dataset.inc, +1));
  });
  document.querySelectorAll("[data-dec]").forEach(btn => {
    btn.addEventListener("click", () => changeQty(btn.dataset.dec, -1));
  });
  document.querySelectorAll("[data-details]").forEach(btn => {
    btn.addEventListener("click", () => openDetails(btn.dataset.details));
  });
}

function renderLowStock() {
  const low = bottles.filter(b => toInt(b.quantite) <= 2).slice();
  sortList(low, "qty_desc");
  $("lowList").innerHTML = low.map(b => {
    const title = escapeHtml(formatName(b));
    const sub = escapeHtml(`${safeStr(b.appellation)}${b.appellation ? " — " : ""}${safeStr(b.millesime)}`);
    const meta = escapeHtml(`${safeStr(b.emplacement) || "Emplacement ?"} • ${safeStr(b.couleur) || "Couleur ?"}`);
    const qty = toInt(b.quantite);

    return `
      <div class="card">
        <div class="cardTop">
          <div>
            <div class="cardTitle">${title}</div>
            <div class="cardSub">${sub}</div>
            <div class="cardMeta">${meta}</div>
            <div style="margin-top:10px;">
              <button class="smallBtn" data-details="${escapeHtml(keyOf(b))}">Détails</button>
            </div>
          </div>
          <div class="qty">
            <div class="qtyNum">${qty}</div>
            <div class="qtyBtns">
              <button class="btn secondary" data-dec="${escapeHtml(keyOf(b))}">–</button>
              <button class="btn primary" data-inc="${escapeHtml(keyOf(b))}">+</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join("");

  document.querySelectorAll("#lowList [data-inc]").forEach(btn => {
    btn.addEventListener("click", () => changeQty(btn.dataset.inc, +1));
  });
  document.querySelectorAll("#lowList [data-dec]").forEach(btn => {
    btn.addEventListener("click", () => changeQty(btn.dataset.dec, -1));
  });
  document.querySelectorAll("#lowList [data-details]").forEach(btn => {
    btn.addEventListener("click", () => openDetails(btn.dataset.details));
  });
}

function renderPlaces() {
  const map = new Map();
  bottles.forEach(b => {
    const p = safeStr(b.emplacement).trim() || "Emplacement non renseigné";
    if (!map.has(p)) map.set(p, { place: p, refs: 0, bottles: 0 });
    const x = map.get(p);
    x.refs += 1;
    x.bottles += toInt(b.quantite);
  });

  const places = Array.from(map.values()).sort((a,b) => a.place.localeCompare(b.place, "fr"));
  $("places").innerHTML = places.map(p => `
    <div class="placeRow" data-place="${escapeHtml(p.place)}">
      <div>
        <div class="placeName">${escapeHtml(p.place)}</div>
        <div class="placeMeta">${p.refs} vins • ${p.bottles} bouteilles</div>
      </div>
      <div class="muted">Voir</div>
    </div>
  `).join("");

  document.querySelectorAll("[data-place]").forEach(row => {
    row.addEventListener("click", () => {
      currentPlaceFilter = row.dataset.place === "Emplacement non renseigné" ? "" : row.dataset.place;
      $("filterEmplacement").value = currentPlaceFilter || "";
      go("inventory");
    });
  });
}

function openDetails(k) {
  const b = bottles.find(x => keyOf(x) === k);
  if (!b) return;
  currentDetails = b;
  $("details").innerHTML = renderDetailsHtml(b);
  go("details");

  // actions
  $("details").querySelectorAll("[data-inc]").forEach(btn => btn.addEventListener("click", () => changeQty(btn.dataset.inc, +1)));
  $("details").querySelectorAll("[data-dec]").forEach(btn => btn.addEventListener("click", () => changeQty(btn.dataset.dec, -1)));
  $("details").querySelectorAll("[data-link]").forEach(btn => btn.addEventListener("click", () => window.open(btn.dataset.link, "_blank")));
}

function renderDetailsHtml(b) {
  const title = escapeHtml(formatName(b));
  const appell = escapeHtml(safeStr(b.appellation));
  const year = escapeHtml(safeStr(b.millesime));
  const place = escapeHtml(safeStr(b.emplacement) || "Non renseigné");
  const color = escapeHtml(safeStr(b.couleur) || "Non renseignée");
  const format = escapeHtml(safeStr(b.format) || "Non renseigné");
  const notes = escapeHtml(safeStr(b.notes));
  const qty = toInt(b.quantite);
  const img = safeStr(b.image_url).trim();

  const query = encodeURIComponent(`${formatName(b)} ${safeStr(b.millesime)}`.trim());
  const vivino = `https://www.vivino.com/search/wines?q=${query}`;
  const ws = `https://www.wine-searcher.com/find/${encodeURIComponent(formatName(b))}/${encodeURIComponent(safeStr(b.millesime))}`;
  const google = `https://www.google.com/search?q=${query}`;

  return `
    <h2>${title}</h2>
    <div class="row"><strong>Appellation</strong> : ${appell || "—"}</div>
    <div class="row"><strong>Millésime</strong> : ${year || "NV"}</div>
    <div class="row"><strong>Couleur</strong> : ${color}</div>
    <div class="row"><strong>Format</strong> : ${format}</div>
    <div class="row"><strong>Emplacement</strong> : ${place}</div>
    <div class="row"><strong>Quantité</strong> : ${qty}</div>
    ${img ? `<img src="${escapeHtml(img)}" alt="Photo">` : ""}
    ${notes ? `<div class="row"><strong>Notes</strong> : ${notes}</div>` : ""}
    <div class="actions">
      <button class="btn secondary" data-dec="${escapeHtml(keyOf(b))}">Sortir (–1)</button>
      <button class="btn primary" data-inc="${escapeHtml(keyOf(b))}">Ajouter (+1)</button>
      <button class="btn secondary" data-link="${vivino}">Vivino</button>
      <button class="btn secondary" data-link="${ws}">Wine-Searcher</button>
      <button class="btn secondary" data-link="${google}">Google</button>
    </div>
  `;
}

async function changeQty(k, delta) {
  const b = bottles.find(x => keyOf(x) === k);
  if (!b) return;

  // update optimiste
  b.quantite = Math.max(0, toInt(b.quantite) + delta);
  if (b.quantite === 0) {
    // Masquer (M)
    bottles = bottles.filter(x => keyOf(x) !== k);
  }
  refreshUI();

  const payload = {
    action: delta > 0 ? "add" : "remove",
    ean: safeStr(b.ean),
    millesime: safeStr(b.millesime),
    source: "cave"
  };

  try {
    const res = await apiPost(payload);
    if (!res.ok) throw new Error(res.error || "Erreur API");
    await load(); // resync
  } catch (e) {
    alert("Erreur lors de la mise à jour : " + e.message);
    await load();
  }
}

function go(view) {
  currentView = view;
  ["inventory","places","low","details"].forEach(v => {
    $("view" + v.charAt(0).toUpperCase() + v.slice(1)).classList.remove("active");
  });
  $("view" + view.charAt(0).toUpperCase() + view.slice(1)).classList.add("active");

  $("tabInventory").classList.toggle("active", view === "inventory");
  $("tabPlaces").classList.toggle("active", view === "places");
  $("tabLow").classList.toggle("active", view === "low");
}

function refreshUI() {
  renderStats();
  buildFilterOptions();
  applyFilters();
  renderList();
  renderPlaces();
  renderLowStock();
}

async function load() {
  setStatus("Synchronisation…");
  try {
    const res = await apiGet(API_URL + "?action=list");
    if (!res.ok) throw new Error(res.error || "Erreur API");
    bottles = res.data || [];
    setStatus("À jour");
    refreshUI();
  } catch (e) {
    setStatus("Erreur de sync");
    alert("Impossible de charger la cave : " + e.message);
  }
}

function bind() {
  $("search").addEventListener("input", () => { applyFilters(); renderList(); });
  $("filterCouleur").addEventListener("change", () => { applyFilters(); renderList(); });
  $("filterMillesime").addEventListener("change", () => { applyFilters(); renderList(); });
  $("filterEmplacement").addEventListener("change", () => {
    currentPlaceFilter = "";
    applyFilters(); renderList();
  });
  $("sortBy").addEventListener("change", () => { applyFilters(); renderList(); });

  $("tabInventory").addEventListener("click", () => go("inventory"));
  $("tabPlaces").addEventListener("click", () => go("places"));
  $("tabLow").addEventListener("click", () => go("low"));

  $("backBtn").addEventListener("click", () => go("inventory"));
}

(function init() {
  bind();
  load();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
