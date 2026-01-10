// /cave/app.js (modifié)
// Objectif : layout iPhone
// - Note angle haut droit
// - Ligne 1 : "Ajouter un commentaire" + "Modifier la fiche" centrés, même largeur/hauteur
// - Ligne 2 : + puis – centrés

const API_URL = "https://script.google.com/macros/s/AKfycbyxfNO9zWm3CT-GACd0oQE_ambHcJ33VHrQOxVxQIIEEpuv53G_A08cWqHXOsYcofaD/exec";
const $ = (id) => document.getElementById(id);


let all = [];
let view = [];

function setStatus(t){
  const el = $("status");
  if (el) el.textContent = t || "";
}

async function apiGet(url){
  const res = await fetch(url, { method:"GET", cache:"no-store" });
  const txt = await res.text();
  try { return JSON.parse(txt); }
  catch { return { ok:false, error:"Réponse API non-JSON", raw: txt.slice(0, 800) }; }
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

function safeKey(key){
  return String(key || "").replaceAll("|", "__").replaceAll(" ", "_");
}

function getByKey(key){
  return all.find(x => (x.key || "") === key);
}

function normalizeRatingHalf(v) {
  if (v === "" || v === null || v === undefined) return "";
  const n = Number(String(v).replace(",", "."));
  if (Number.isNaN(n)) return "";
  const clamped = Math.max(0, Math.min(10, n));
  return Math.round(clamped * 2) / 2;
}

function fmtWineTitle(o){
  return (o.nom || "").trim() || "Vin";
}

function fmtHeader(o){
  const domaine = (o.domaine || "").trim() || "Domaine";
  const millesime = (o.millesime || "NV").toString().trim();
  return `${domaine} - ${millesime}`;
}

function matches(o){
  const q = normalize($("q")?.value);
  const c = normalize($("filterCouleur")?.value);
  const e = normalize($("filterEmplacement")?.value);

  const blob = normalize(
    [o.nom, o.domaine, o.ean, o.millesime, o.appellation, o.couleur, o.format, o.emplacement, o.comment, o.rating].join(" ")
  );

  if (q && !blob.includes(q)) return false;
  if (c && normalize(o.couleur) !== c) return false;
  if (e && !normalize(o.emplacement).includes(e)) return false;

  return Number(o.quantite || 0) > 0;
}

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

  if (sortBy === "name") {
    const an = normalize(a.nom);
    const bn = normalize(b.nom);
    if (an < bn) return -1 * dir;
    if (an > bn) return 1 * dir;
    const ad = normalize(a.domaine);
    const bd = normalize(b.domaine);
    if (ad < bd) return -1 * dir;
    if (ad > bd) return 1 * dir;
    const ay = parseYear(a.millesime);
    const by = parseYear(b.millesime);
    return (ay - by) * dir;
  }

  if (sortBy === "year") {
    const ay = parseYear(a.millesime);
    const by = parseYear(b.millesime);

    const aNV = ay === -1;
    const bNV = by === -1;
    if (aNV && !bNV) return 1;
    if (!aNV && bNV) return -1;

    if (ay !== by) return (ay - by) * dir;

    const an = normalize(a.nom);
    const bn = normalize(b.nom);
    if (an < bn) return -1 * dir;
    if (an > bn) return 1 * dir;
    return 0;
  }

  if (sortBy === "qty") {
    const aq = Number(a.quantite || 0);
    const bq = Number(b.quantite || 0);
    if (aq !== bq) return (aq - bq) * dir;

    const an = normalize(a.nom);
    const bn = normalize(b.nom);
    if (an < bn) return -1 * dir;
    if (an > bn) return 1 * dir;
    return 0;
  }

  return 0;
}

/* ======================
   RENDER
   ====================== */

function render(){
  const list = $("list");
  if (!list) {
    alert('Erreur: élément HTML id="list" introuvable sur /cave');
    return;
  }
  list.innerHTML = "";

  view = all.filter(matches);
  view.sort(compare);

  $("empty")?.classList?.toggle("hidden", view.length > 0);

  const totalBottles = view.reduce((s, x) => s + Number(x.quantite || 0), 0);
  if ($("badgeCount")) $("badgeCount").textContent = `${totalBottles} bouteille(s)`;

  for (const o of view){
    const div = document.createElement("div");
    div.className = "item";

    const k = o.key || "";
    const sk = safeKey(k);

    const commentText = (o.comment || "").trim();
    const qty = Number(o.quantite || 0);

    const ratingText = (o.rating === 0 || o.rating) ? `${o.rating}/10` : "Note —";
    const ratingValue = (o.rating === 0 || o.rating) ? String(o.rating) : "";

    // Styles inline pour rendre les 2 boutons strictement identiques
    const twinBtnStyle = `
      width: 180px;
      height: 42px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      white-space: normal;
      line-height: 1.15;
      padding: 0 10px;
    `;

    div.innerHTML = `
      <div style="position:relative;">

        <button type="button"
          class="btn secondary"
          data-act="rate"
          data-key="${escapeHtml(k)}"
          style="position:absolute; top:0; right:0; padding:6px 10px;">
          ${escapeHtml(ratingText)}
        </button>

        <div class="itemTitle" style="font-weight:800; padding-right:90px;">
          ${escapeHtml(fmtHeader(o))}
        </div>

        <div style="margin-top:6px; font-size:14px; color: rgba(17,24,39,.92); padding-right:90px;">
          ${escapeHtml(fmtWineTitle(o))}
        </div>

        <div style="margin-top:10px; font-size:13px; color: rgba(17,24,39,.72);">
          En stock : <span style="font-weight:900; color: rgba(17,24,39,.92);">${escapeHtml(String(qty))}</span>
        </div>

        <div class="small" style="margin-top:8px;">
          EAN : ${escapeHtml(o.ean || "")}
        </div>

        <div class="editBox hidden rateBox" id="rate_${sk}" style="margin-top:10px;">
          <div class="small" style="margin-bottom:6px;">Note /10</div>
          <input class="input" id="rv_${sk}" type="number" min="0" max="10" step="0.5" inputmode="decimal"
            value="${escapeHtml(ratingValue)}" placeholder="ex: 7.5" />

          <div class="actions" style="margin-top:10px;">
            <button type="button" class="btn primary" data-act="saveRate" data-key="${escapeHtml(k)}">Enregistrer</button>
            <button type="button" class="btn secondary" data-act="cancelRate" data-key="${escapeHtml(k)}">Annuler</button>
          </div>
        </div>

      </div>

      <div style="height:12px;"></div>

      <div class="item" style="padding:10px; margin:0; border-radius:14px; box-shadow: 0 6px 18px rgba(0,0,0,.04);">
        <div class="small" id="comment_text_${sk}"
             style="${commentText ? "" : "display:none;"} white-space:pre-wrap; color: rgba(17,24,39,.72); font-size:13px;">
          ${escapeHtml(commentText)}
        </div>
        <div class="small" id="comment_empty_${sk}" style="${commentText ? "display:none;" : ""}">
          (Aucun commentaire)
        </div>
      </div>

      <!-- Ligne 1 : deux boutons strictement identiques -->
      <div style="display:flex; justify-content:center; gap:10px; margin-top:12px; flex-wrap:wrap;">
        <button type="button" class="btn secondary" data-act="comment" data-key="${escapeHtml(k)}"
          style="${twinBtnStyle}">
          Ajouter un commentaire
        </button>

        <button type="button" class="btn secondary" data-act="edit" data-key="${escapeHtml(k)}"
          style="${twinBtnStyle}">
          Modifier la fiche
        </button>
      </div>

      <!-- Ligne 2 : + puis – centrés -->
      <div style="display:flex; justify-content:center; gap:10px; margin-top:10px;">
        <button type="button" class="btn primary" data-act="add" data-key="${escapeHtml(k)}">+</button>
        <button type="button" class="btn danger" data-act="remove" data-key="${escapeHtml(k)}">–</button>
      </div>

      <div class="editBox hidden commentBox" id="comment_${sk}" style="margin-top:10px;">
        <div class="small" style="margin-bottom:6px;">Commentaire</div>
        <textarea class="input" id="ct_${sk}" rows="3" maxlength="1000" placeholder="Votre commentaire...">${escapeHtml(commentText)}</textarea>

        <div class="actions" style="margin-top:10px;">
          <button type="button" class="btn primary" data-act="saveComment" data-key="${escapeHtml(k)}">Enregistrer</button>
          <button type="button" class="btn secondary" data-act="cancelComment" data-key="${escapeHtml(k)}">Annuler</button>
        </div>
      </div>

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

          <div>
            <div class="small" style="margin-bottom:6px;">Note /10</div>
            <input class="input" id="er_${sk}" type="number" min="0" max="10" step="0.5" inputmode="decimal"
              value="${escapeHtml((o.rating === 0 || o.rating) ? String(o.rating) : "")}"
              placeholder="ex: 7.5" />
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

  list.querySelectorAll("button[data-act]").forEach(btn => {
    btn.addEventListener("click", () => {
      const act = btn.getAttribute("data-act");
      const key = btn.getAttribute("data-key");
      const obj = getByKey(key);
      if (!obj) return;

      if (act === "edit") { toggleEdit(key); return; }
      if (act === "comment") { toggleComment(key); return; }
      if (act === "rate") { toggleRate(key); return; }
      if (act === "cancelRate") { closeRate(key); return; }
      if (act === "saveRate") { saveRate(obj); return; }
      if (act === "cancelComment") { closeComment(key); return; }
      if (act === "saveComment") { saveComment(obj); return; }

      applyAction(act, obj);
    });
  });
}

/* ---------- TOGGLES ---------- */

function toggleComment(key){
  const sk = safeKey(key);
  const box = document.getElementById("comment_" + sk);
  if (!box) return;
  document.querySelectorAll(".commentBox").forEach(el => { if (el !== box) el.classList.add("hidden"); });
  box.classList.toggle("hidden");
}
function closeComment(key){
  const sk = safeKey(key);
  const box = document.getElementById("comment_" + sk);
  if (box) box.classList.add("hidden");
}

function toggleEdit(key){
  const sk = safeKey(key);
  const box = document.getElementById("edit_" + sk);
  if (!box) return;
  document.querySelectorAll(".editBox").forEach(el => {
    if (el !== box && !el.classList.contains("commentBox") && !el.classList.contains("rateBox")) el.classList.add("hidden");
  });
  box.classList.toggle("hidden");
}

function toggleRate(key){
  const sk = safeKey(key);
  const box = document.getElementById("rate_" + sk);
  if (!box) return;
  document.querySelectorAll(".rateBox").forEach(el => { if (el !== box) el.classList.add("hidden"); });
  box.classList.toggle("hidden");
}
function closeRate(key){
  const sk = safeKey(key);
  const box = document.getElementById("rate_" + sk);
  if (box) box.classList.add("hidden");
}

/* ---------- SAVES ---------- */

async function saveComment(o){
  const sk = safeKey(o.key);
  const comment = document.getElementById("ct_" + sk)?.value?.trim() || "";

  setStatus("Enregistrement…");

  const payload = {
    action: "upsert",
    ean: o.ean,
    millesime: o.millesime || "NV",
    old_key: o.key || "",
    old_millesime: o.millesime || "NV",
    nom: o.nom || "",
    domaine: o.domaine || "",
    appellation: o.appellation || "",
    couleur: o.couleur || "",
    format: o.format || "",
    emplacement: o.emplacement || "",
    image_url: o.image_url || "",
    notes: o.notes || "",
    rating: (o.rating === 0 || o.rating) ? o.rating : "",
    comment,
    source: "cave"
  };

  const res = await apiPost(payload);
  if (!res.ok) { setStatus("Erreur"); alert(res.error || "Erreur API"); return; }

  setStatus("Enregistré");
  await refresh();
}

async function saveRate(o){
  const sk = safeKey(o.key);
  const raw = document.getElementById("rv_" + sk)?.value ?? "";
  const rating = normalizeRatingHalf(raw);

  setStatus("Enregistrement…");

  const payload = {
    action: "upsert",
    ean: o.ean,
    millesime: o.millesime || "NV",
    old_key: o.key || "",
    old_millesime: o.millesime || "NV",
    nom: o.nom || "",
    domaine: o.domaine || "",
    appellation: o.appellation || "",
    couleur: o.couleur || "",
    format: o.format || "",
    emplacement: o.emplacement || "",
    image_url: o.image_url || "",
    notes: o.notes || "",
    rating,
    comment: (o.comment || "").trim(),
    source: "cave"
  };

  const res = await apiPost(payload);
  if (!res.ok) { setStatus("Erreur"); alert(res.error || "Erreur API"); return; }

  setStatus("Enregistré");
  await refresh();
}

/* ---------- +/- ---------- */

async function applyAction(action, o){
  const txt = prompt(
    action === "add" ? "Combien de bouteilles ajouter ?" : "Combien de bouteilles sortir ?",
    "1"
  );
  if (txt === null) return;

  let qty = parseInt(String(txt).trim(), 10);
  if (!Number.isFinite(qty) || qty <= 0) { alert("Quantité invalide."); return; }

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
    rating: (o.rating === 0 || o.rating) ? o.rating : "",
    comment: (o.comment || "").trim(),
    source: "cave"
  };

  const res = await apiPost(payload);
  if (!res.ok) { setStatus("Erreur"); alert(res.error || "Erreur API"); return; }

  const newQty = res.data && res.data.quantite !== undefined ? Number(res.data.quantite) : null;
  if (newQty !== null) o.quantite = newQty;

  setStatus("Prêt");
  render();
}

/* ---------- DATA ---------- */

async function refresh(){
  setStatus("Chargement…");
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);

    const res = await fetch(API_URL + "?action=list", { method: "GET", cache: "no-store", signal: ctrl.signal });
    clearTimeout(t);

    const txt = await res.text();
    let data;
    try { data = JSON.parse(txt); }
    catch {
      setStatus("Erreur API (non-JSON)");
      alert("API a renvoyé du texte non-JSON :\n\n" + txt.slice(0, 800));
      return;
    }

    if (!data.ok) { setStatus("Erreur API"); alert(data.error || "Erreur API"); return; }

    all = data.data || [];
    setStatus("Prêt");
    render();
  } catch (e) {
    setStatus("Erreur réseau");
    alert("Erreur pendant refresh(): " + (e?.message || e));
    console.error(e);
  }
}

/* ---------- BIND ---------- */

function bind(){
  ["q","filterCouleur","filterEmplacement"].forEach(id => {
    $(id)?.addEventListener("input", () => render());
    $(id)?.addEventListener("change", () => render());
  });

  ["sortBy","sortOrder"].forEach(id => {
    $(id)?.addEventListener("change", () => render());
  });

  $("btnRefresh")?.addEventListener("click", refresh);
  $("btnClear")?.addEventListener("click", () => {
    if ($("q")) $("q").value = "";
    if ($("filterCouleur")) $("filterCouleur").value = "";
    if ($("filterEmplacement")) $("filterEmplacement").value = "";
    if ($("sortBy")) $("sortBy").value = "name";
    if ($("sortOrder")) $("sortOrder").value = "asc";
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
