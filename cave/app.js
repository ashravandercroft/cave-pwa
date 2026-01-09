// Même API que le scanner
const API_URL = "https://script.google.com/macros/s/AKfycbyxfNO9zWm3CT-GACd0oQE_ambHcJ33VHrQOxVxQIIEEpuv53G_A08cWqHXOsYcofaD/exec";
const $ = (id) => document.getElementById(id);

let all = [];     // toutes les lignes de la cave
let view = [];    // lignes filtrées

function setStatus(t){
  const el = $("status");
  if (el) el.textContent = t || "";
}

async function apiGet(url){
  const res = await fetch(url, { method:"GET" });
  return res.json();
}

async function apiPost(payload){
  const res = await fetch(API_URL, { method:"POST", body: JSON.stringify(payload) });
  return res.json();
}

function normalize(s){ return (s || "").toString().trim().toLowerCase(); }

function escapeHtml(s) {
  return (s || "")
    .toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/**
 * Pour les id HTML : votre key contient "|" (ean|millesime)
 * => on la "sanitize" pour pouvoir l'utiliser dans id=""
 */
function safeKey(key){
  return String(key || "").replaceAll("|", "__").replaceAll(" ", "_");
}

function getByKey(key){
  return all.find(x => (x.key || "") === key);
}

/* ---------- AFFICHAGE ---------- */

function fmtWineTitle(o){
  const nom = (o.nom || "").trim() || "Vin";
  return nom;
}

function fmtMeta(o){
  const domaine = (o.domaine || "").trim();
  const millesime = (o.millesime || "NV").toString().trim();
  const empl = (o.emplacement || "").trim();
  const parts = [];
  if (domaine) parts.push(domaine);
  parts.push("Millésime : " + millesime);
  if (empl) parts.push("Emplacement : " + empl);
  return parts.join(" • ");
}

/* ---------- FILTRES ---------- */

function matches(o){
  const q = normalize($("q")?.value);
  const c = normalize($("filterCouleur")?.value);
  const e = normalize($("filterEmplacement")?.value);

  const blob = normalize(
    [o.nom, o.domaine, o.ean, o.millesime, o.appellation, o.couleur, o.format, o.emplacement].join(" ")
  );

  if (q && !blob.includes(q)) return false;
  if (c && normalize(o.couleur) !== c) return false;
  if (e && !normalize(o.emplacement).includes(e)) return false;

  return Number(o.quantite || 0) > 0;
}

/* ---------- TRI ---------- */

function parseYear(millesime){
  const s = (millesime || "").toString().trim();
  if (!s) return -1;
  if (s.toUpperCase() === "NV") return -1;

  const match = s.match(/\b(19|20)\d{2}\b/);
  if (!match) return -1;

  return parseInt(match[0], 10);
}

function compare(a, b){
  const sortBy = $("sortBy")?.value || "name";
  const order = $("sortOrder")?.value || "asc";
  const dir = order === "desc" ? -1 : 1;

  // Nom
  if (sortBy === "name") {
    const an = normalize(a.nom);
    const bn = normalize(b.nom);
    if (an < bn) return -1 * dir;
    if (an > bn) return 1 * dir;
    // tie-breaker : domaine puis millésime
    const ad = normalize(a.domaine);
    const bd = normalize(b.domaine);
    if (ad < bd) return -1 * dir;
    if (ad > bd) return 1 * dir;
    const ay = parseYear(a.millesime);
    const by = parseYear(b.millesime);
    return (ay - by) * dir;
  }

  // Millésime
  if (sortBy === "year") {
    const ay = parseYear(a.millesime);
    const by = parseYear(b.millesime);

    // Gérer NV proprement : NV toujours en bas (quel que soit l'ordre)
    const aNV = ay === -1;
    const bNV = by === -1;
    if (aNV && !bNV) return 1;
    if (!aNV && bNV) return -1;

    if (ay !== by) return (ay - by) * dir;

    // tie-breaker : nom
    const an = normalize(a.nom);
    const bn = normalize(b.nom);
    if (an < bn) return -1 * dir;
    if (an > bn) return 1 * dir;
    return 0;
  }

  // Quantité
  if (sortBy === "qty") {
    const aq = Number(a.quantite || 0);
    const bq = Number(b.quantite || 0);
    if (aq !== bq) return (aq - bq) * dir;

    // tie-breaker : nom
    const an = normalize(a.nom);
    const bn = normalize(b.nom);
    if (an < bn) return -1 * dir;
    if (an > bn) return 1 * dir;
    return 0;
  }

  return 0;
}

/* ---------- RENDER ---------- */

function render(){
  const list = $("list");
  list.innerHTML = "";

  view = all.filter(matches);
  view.sort(compare);

  $("empty").classList.toggle("hidden", view.length > 0);

  const totalBottles = view.reduce((s, x) => s + Number(x.quantite || 0), 0);
  $("badgeCount").textContent = `${totalBottles} bouteille(s)`;

  for (const o of view){
    const div = document.createElement("div");
    div.className = "item";

    const k = o.key || "";
    const sk = safeKey(k);

    div.innerHTML = `
      <div class="itemTop">
        <div>
          <div class="itemTitle">${escapeHtml(fmtWineTitle(o))}</div>
          <div class="itemMeta">${escapeHtml(fmtMeta(o))}</div>
        </div>
        <div class="qtyPill">${escapeHtml(String(o.quantite || 0))}</div>
      </div>

      <div class="itemBottom">
        <div class="small">EAN : ${escapeHtml(o.ean || "")}</div>
        <div class="actions">
          <button type="button" class="btn danger" data-act="remove" data-key="${escapeHtml(k)}">–</button>
          <button type="button" class="btn primary" data-act="add" data-key="${escapeHtml(k)}">+</button>
          <button type="button" class="btn secondary" data-act="edit" data-key="${escapeHtml(k)}">Modifier</button>
        </div>
      </div>

      <!-- Edition inline -->
      <div class="editBox hidden" id="edit_${sk}">
        <div class="editGrid">
          <div>
            <div class="small" style="margin-bottom:6px;">Nom</div>
            <input class="input" id="en_${sk}" value="${escapeHtml(o.nom || "")}" placeholder="Nom" />
          </div>

          <div>
            <div class="small" style="margin-bottom:6px;">Domaine</div>
            <input class="input" id="ed_${sk}" value="${escapeHtml(o.domaine || "")}" placeholder="Domaine" />
          </div>

          <div>
            <div class="small" style="margin-bottom:6px;">Appellation</div>
            <input class="input" id="ea_${sk}" value="${escapeHtml(o.appellation || "")}" placeholder="Appellation" />
          </div>

          <div>
            <div class="small" style="margin-bottom:6px;">Millésime</div>
            <input class="input" id="em_${sk}" value="${escapeHtml(o.millesime || "NV")}" placeholder="NV / 2018" />
          </div>

          <div>
            <div class="small" style="margin-bottom:6px;">Couleur</div>
            <input class="input" id="ec_${sk}" value="${escapeHtml(o.couleur || "")}" placeholder="rouge / blanc / rosé" />
          </div>

          <div>
            <div class="small" style="margin-bottom:6px;">Format</div>
            <input class="input" id="ef_${sk}" value="${escapeHtml(o.format || "")}" placeholder="75cl" />
          </div>

          <div style="grid-column: 1 / -1;">
            <div class="small" style="margin-bottom:6px;">Emplacement</div>
            <input class="input" id="ee_${sk}" value="${escapeHtml(o.emplacement || "")}" placeholder="Cave / Étage 2" />
          </div>
        </div>

        <div class="actions" style="margin-top:10px;">
          <button type="button" class="btn primary" data-act="save" data-key="${escapeHtml(k)}">Enregistrer</button>
          <button type="button" class="btn secondary" data-act="cancel" data-key="${escapeHtml(k)}">Annuler</button>
        </div>

        <div class="small" style="margin-top:10px;">
          Astuce : changer le millésime crée une nouvelle fiche (EAN + millésime).
        </div>
      </div>
    `;

    list.appendChild(div);
  }

  // Bind actions (tous les boutons)
  list.querySelectorAll("button[data-act]").forEach(btn => {
    btn.addEventListener("click", () => {
      const act = btn.getAttribute("data-act");
      const key = btn.getAttribute("data-key");
      const obj = getByKey(key);
      if (!obj) return;

      if (act === "edit") {
        toggleEdit(key);
        return;
      }
      if (act === "cancel") {
        closeEdit(key);
        return;
      }
      if (act === "save") {
        saveEdit(obj);
        return;
      }

      // add/remove
      applyAction(act, obj);
    });
  });
}

/* ---------- EDITION ---------- */

function toggleEdit(key){
  const sk = safeKey(key);
  const box = document.getElementById("edit_" + sk);
  if (!box) return;

  // Fermer les autres boîtes ouvertes (plus propre)
  document.querySelectorAll(".editBox").forEach(el => {
    if (el !== box) el.classList.add("hidden");
  });

  box.classList.toggle("hidden");
}

function closeEdit(key){
  const sk = safeKey(key);
  const box = document.getElementById("edit_" + sk);
  if (box) box.classList.add("hidden");
}

async function saveEdit(o){
  const sk = safeKey(o.key);

  const nom = document.getElementById("en_" + sk)?.value?.trim() || "";
  const domaine = document.getElementById("ed_" + sk)?.value?.trim() || "";
  const appellation = document.getElementById("ea_" + sk)?.value?.trim() || "";
  const millesime = document.getElementById("em_" + sk)?.value?.trim() || "NV";
  const couleur = document.getElementById("ec_" + sk)?.value?.trim() || "";
  const format = document.getElementById("ef_" + sk)?.value?.trim() || "";
  const emplacement = document.getElementById("ee_" + sk)?.value?.trim() || "";

  if (!nom) {
    alert("Le nom est obligatoire.");
    return;
  }

  setStatus("Enregistrement…");

  const payload = {
    action: "upsert",
    ean: o.ean,
    millesime,

    // IMPORTANT : permet la migration automatique si la clé change
    old_key: o.key || "",
    old_millesime: o.millesime || "NV",

    nom,
    domaine,
    appellation,
    couleur,
    format,
    emplacement,
    image_url: o.image_url || "",
    notes: o.notes || "",
    source: "cave"
  };

  const res = await apiPost(payload);
  if (!res.ok) {
    setStatus("Erreur");
    alert(res.error || "Erreur API");
    return;
  }

  setStatus("Enregistré");

  // Recharger depuis l'API (fiable)
  await refresh();

  // Message explicite selon migration ou non
  const migrated = !!(res.data && res.data.migrated);
  const movedQty = res.data && res.data.moved_qty !== undefined ? Number(res.data.moved_qty) : 0;

  if (migrated) {
    alert(
      "Millésime modifié.\n" +
      "Stock déplacé : " + movedQty + " bouteille(s).\n" +
      "Ancienne fiche supprimée."
    );
  } else {
    alert("Fiche mise à jour.");
  }
}


/* ---------- ACTIONS +/- ---------- */

async function applyAction(action, o){
  const txt = prompt(
    action === "add" ? "Combien de bouteilles ajouter ?" : "Combien de bouteilles sortir ?",
    "1"
  );
  if (txt === null) return;

  let qty = parseInt(String(txt).trim(), 10);
  if (!Number.isFinite(qty) || qty <= 0) {
    alert("Quantité invalide.");
    return;
  }

  setStatus(action === "add" ? `Ajout… (+${qty})` : `Sortie… (–${qty})`);

  const payload = {
    action,
    qty,
    ean: o.ean,
    millesime: o.millesime || "NV",
    nom: o.nom || "",
    domaine: o.domaine || "",
    appellation: o.appellation || "",
    couleur: o.couleur || "",
    format: o.format || "",
    emplacement: o.emplacement || "",
    image_url: o.image_url || "",
    notes: o.notes || "",
    source: "cave"
  };

  const res = await apiPost(payload);
  if (!res.ok) {
    setStatus("Erreur");
    alert(res.error || "Erreur API");
    return;
  }

  // Mettre à jour localement sans recharger tout
  const newQty = res.data && res.data.quantite !== undefined ? Number(res.data.quantite) : null;
  if (newQty !== null) {
    o.quantite = newQty;
  }

  const title = (o.nom || "Le vin").trim();
  alert(action === "add" ? `"${title}" ajouté (+${qty}).` : `"${title}" sorti (–${qty}).`);

  setStatus("Prêt");
  render();
}

/* ---------- DATA ---------- */

async function refresh(){
  setStatus("Chargement…");
  const data = await apiGet(API_URL + "?action=list");
  if (!data.ok) {
    setStatus("Erreur");
    alert(data.error || "Erreur API");
    return;
  }
  all = data.data || [];
  setStatus("Prêt");
  render();
}

/* ---------- BIND ---------- */

function bind(){
  ["q","filterCouleur","filterEmplacement"].forEach(id => {
    $(id)?.addEventListener("input", () => render());
    $(id)?.addEventListener("change", () => render());
  });

  // tri
  ["sortBy","sortOrder"].forEach(id => {
    $(id)?.addEventListener("change", () => render());
  });

  $("btnRefresh")?.addEventListener("click", refresh);
  $("btnClear")?.addEventListener("click", () => {
    $("q").value = "";
    $("filterCouleur").value = "";
    $("filterEmplacement").value = "";
    $("sortBy").value = "name";
    $("sortOrder").value = "asc";
    render();
  });
}

(function init(){
  bind();
  refresh();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
