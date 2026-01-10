// /scanner/app.js
const API_URL = "https://script.google.com/macros/s/AKfycbyxfNO9zWm3CT-GACd0oQE_ambHcJ33VHrQOxVxQIIEEpuv53G_A08cWqHXOsYcofaD/exec";
const $ = (id) => document.getElementById(id);

window.__APP_LOADED__ = "OK";
alert("APP.JS chargé V13");

let editingOldKey = "";

let last = {
  ean: "",
  dataInCave: [],
  product: null
};

function setStatus(t) {
  const el = $("status");
  if (el) el.textContent = t || "";
  const b = document.getElementById("statusBadge");
  if (b) b.textContent = t || "Prêt";
}

function show(id) { const el = $(id); if (el) el.classList.remove("hidden"); }
function hide(id) { const el = $(id); if (el) el.classList.add("hidden"); }

async function apiGet(url) {
  const res = await fetch(url, { method: "GET" });
  return res.json();
}

async function apiPost(payload) {
  const res = await fetch(API_URL, {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return res.json();
}

function normalizeEan(ean) {
  return (ean || "").toString().replace(/\D/g, "").trim();
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

function fillFormFromProduct(p) {
  const setIfEmpty = (id, value) => {
    const el = $(id);
    if (!el) return;
    if (el.value && el.value.trim() !== "") return;
    el.value = value || "";
  };

  setIfEmpty("f_nom", p?.nom);
  setIfEmpty("f_domaine", p?.domaine);
  setIfEmpty("f_appellation", p?.appellation);
  setIfEmpty("f_millesime", p?.millesime);
  setIfEmpty("f_format", p?.format);

  const c = $("f_couleur");
  if (c && !c.value) c.value = p?.couleur || "";
}

function getFormData() {
  return {
    nom: $("f_nom")?.value?.trim() || "",
    domaine: $("f_domaine")?.value?.trim() || "",
    appellation: $("f_appellation")?.value?.trim() || "",
    millesime: $("f_millesime")?.value?.trim() || "",
    couleur: $("f_couleur")?.value || "",
    format: $("f_format")?.value?.trim() || "",
    emplacement: $("f_emplacement")?.value?.trim() || ""
  };
}

function fillFormFromAny(o) {
  if (!o) return;

  if ($("f_nom")) $("f_nom").value = o.nom || "";
  if ($("f_domaine")) $("f_domaine").value = o.domaine || "";
  if ($("f_appellation")) $("f_appellation").value = o.appellation || "";
  if ($("f_millesime")) $("f_millesime").value = o.millesime || "NV";
  if ($("f_couleur")) $("f_couleur").value = o.couleur || "";
  if ($("f_format")) $("f_format").value = o.format || "";
  if ($("f_emplacement")) $("f_emplacement").value = o.emplacement || "";
}

function setUpsertButtonMode(mode) {
  const btn = $("btnUpsert");
  if (!btn) return;

  if (mode === "add") {
    btn.textContent = "Ajouter";
    btn.style.display = "block";
    btn.style.margin = "14px auto 0";
  } else {
    btn.textContent = "Enregistrer";
    btn.style.display = "";
    btn.style.margin = "";
  }
}

async function lookup(ean, opts = {}) {
  ean = normalizeEan(ean);
  if (!ean) return alert("Veuillez saisir ou scanner un code-barres.");

  last.ean = ean;
  editingOldKey = "";
  setUpsertButtonMode("save");

  setStatus("Recherche…");

  if (!opts.keepScreen) {
    hide("result");
    hide("form");
  }

  const found = await apiGet(API_URL + "?action=find&ean=" + encodeURIComponent(ean));
  if (!found.ok) {
    setStatus("Erreur API");
    alert(found.error || "Erreur API");
    return;
  }
  last.dataInCave = found.data || [];

  let offProduct = null;
  try {
    const off = await fetch("https://world.openfoodfacts.org/api/v0/product/" + ean + ".json");
    const offJson = await off.json();
    if (offJson?.status === 1 && offJson.product) {
      offProduct = {
        nom: offJson.product.product_name || "",
        domaine: (offJson.product.brands || "").split(",")[0] || "",
        appellation: "",
        millesime: "",
        couleur: "",
        format: offJson.product.quantity || "",
        image_url: offJson.product.image_url || ""
      };
    }
  } catch(e){}

  last.product = offProduct;

  renderResult();
  setStatus("Prêt");
  hide("form");
}

function renderResult() {
  const cave = last.dataInCave || [];
  const p = last.product;

  let title = "";
  let sub = "";
  let img = p?.image_url || "";

  let caveCardsHtml = "";
  let ctaHtml = "";

  if (cave.length > 0) {
    const total = cave.reduce((s, x) => s + Number(x.quantite || 0), 0);
    title = "Déjà dans la cave";
    sub = "Total : " + total + " bouteille(s)";

    caveCardsHtml = cave.map(x => `
      <div class="item" style="margin-top:10px;">
        <div style="font-weight:800;">${escapeHtml(x.domaine || "")} - ${escapeHtml(x.nom || "")}</div>
        <div class="small" style="margin-top:4px;">${escapeHtml(x.millesime || "NV")} • ${x.quantite} bouteille(s)</div>
        <div class="actions" style="margin-top:8px; justify-content:center;">
          <button class="btn primary" data-act="add" data-key="${x.key}">+</button>
          <button class="btn danger" data-act="remove" data-key="${x.key}">-</button>
        </div>
      </div>
    `).join("");

    ctaHtml = `
      <div style="margin-top:14px; text-align:center;">
        <button class="btn secondary" id="btnNewVintage">Nouveau millésime en cave</button>
      </div>
    `;
  } else {
    title = escapeHtml(p?.nom || "Vin inconnu");
    sub = escapeHtml(p?.domaine || "—");

    ctaHtml = `
      <div style="margin-top:14px; text-align:center;">
        <button class="btn secondary" id="btnNewWine">Nouveau vin en cave</button>
      </div>
    `;
  }

  $("result").innerHTML = `
    <div class="sectionTitle">Résultat</div>
    <h2 class="resultTitle">${title}</h2>
    <div class="resultMeta">${sub}</div>
    ${img ? `<img class="photo" src="${img}">` : ""}
    ${caveCardsHtml}
    ${ctaHtml}
  `;

  show("result");

  // ✅ ESPACE ENTRE RESULT ET CTA /CAVE (ROBUSTE)
  try {
    const resEl = $("result");
    if (resEl) {
      const next = resEl.nextElementSibling;
      if (next) next.style.marginTop = "14px";

      const insideCta =
        resEl.querySelector(".scanCta") ||
        resEl.querySelector(".scanCtaInner");

      if (insideCta) insideCta.style.marginTop = "14px";
    }
  } catch(e){}

  $("result").querySelectorAll("button[data-act]").forEach(btn => {
    btn.onclick = () => {
      const key = btn.dataset.key;
      const obj = cave.find(x => x.key === key);
      if (!obj) return;

      const action = btn.dataset.act;
      applyActionDirect(action, obj);
    };
  });

  $("btnNewVintage")?.addEventListener("click", () => {
    show("form");
    fillFormFromAny(cave[0]);
    $("f_millesime").value = "";
    setUpsertButtonMode("add");
  });

  $("btnNewWine")?.addEventListener("click", () => {
    show("form");
    fillFormFromProduct(p || {});
    setUpsertButtonMode("add");
  });
}

async function applyActionDirect(action, obj) {
  const txt = prompt(
    action === "add" ? "Combien de bouteilles ajouter ?" : "Combien de bouteilles sortir ?",
    "1"
  );
  if (txt === null) return;

  const qty = parseInt(txt, 10);
  if (!qty || qty <= 0) return alert("Quantité invalide.");

  const payload = {
    action,
    qty,
    ean: obj.ean,
    millesime: obj.millesime || "NV",
    nom: obj.nom || "",
    domaine: obj.domaine || "",
    couleur: obj.couleur || "",
    format: obj.format || "",
    emplacement: obj.emplacement || "",
    source: "scanner"
  };

  await apiPost(payload);
  await lookup(last.ean, { keepScreen:true });
}

function bind() {
  $("btnLookup")?.addEventListener("click", () => lookup($("ean")?.value));
  $("btnUpsert")?.addEventListener("click", upsert);
}

(async function init(){
  bind();
  setStatus("Prêt");
})();
