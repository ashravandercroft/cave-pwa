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

function render(){
  const list = $("list");
  list.innerHTML = "";

  view = all.filter(matches);
  $("empty").classList.toggle("hidden", view.length > 0);

  const totalBottles = view.reduce((s, x) => s + Number(x.quantite || 0), 0);
  $("badgeCount").textContent = `${totalBottles} bouteille(s)`;

  for (const o of view){
    const div = document.createElement("div");
    div.className = "item";

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
          <button type="button" class="btn danger" data-act="remove" data-key="${escapeHtml(o.key)}">–</button>
          <button type="button" class="btn primary" data-act="add" data-key="${escapeHtml(o.key)}">+</button>
        </div>
      </div>
    `;

    list.appendChild(div);
  }

  // Bind actions
  list.querySelectorAll("button[data-act]").forEach(btn => {
    btn.addEventListener("click", () => {
      const act = btn.getAttribute("data-act");
      const key = btn.getAttribute("data-key");
      const obj = all.find(x => (x.key || "") === key);
      if (!obj) return;

      applyAction(act, obj);
    });
  });
}

function escapeHtml(s) {
  return (s || "")
    .toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

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

  // Message simple
  const title = (o.nom || "Le vin").trim();
  alert(action === "add" ? `"${title}" ajouté (+${qty}).` : `"${title}" sorti (–${qty}).`);

  setStatus("Prêt");
  render();
}

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

function bind(){
  ["q","filterCouleur","filterEmplacement"].forEach(id => {
    $(id)?.addEventListener("input", () => render());
    $(id)?.addEventListener("change", () => render());
  });

  $("btnRefresh")?.addEventListener("click", refresh);
  $("btnClear")?.addEventListener("click", () => {
    $("q").value = "";
    $("filterCouleur").value = "";
    $("filterEmplacement").value = "";
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
