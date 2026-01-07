// Remplacez cette URL par votre Apps Script /exec
const API_URL = "VOTRE_URL_APPS_SCRIPT_EXEC";

/* ===========================
   DEBUG : vérifier chargement
   =========================== */
alert("scanner app.js chargé (debug)"); // À enlever après debug

const $ = (id) => document.getElementById(id);

let last = {
  ean: "",
  dataInCave: [],
  product: null
};

function setStatus(t) { $("status").textContent = t || ""; }
function show(id) { $(id).classList.remove("hidden"); }
function hide(id) { $(id).classList.add("hidden"); }

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

function normalizeEan(ean) {
  return (ean || "").toString().replace(/\D/g, "").trim();
}

function fillFormFromProduct(p) {
  $("f_nom").value = (p && p.nom) ? p.nom : "";
  $("f_domaine").value = (p && p.domaine) ? p.domaine : "";
  $("f_appellation").value = (p && p.appellation) ? p.appellation : "";
  $("f_millesime").value = (p && p.millesime) ? p.millesime : "";
  $("f_couleur").value = (p && p.couleur) ? p.couleur : "";
  $("f_format").value = (p && p.format) ? p.format : "";
}

function getFormData() {
  return {
    nom: $("f_nom").value.trim(),
    domaine: $("f_domaine").value.trim(),
    appellation: $("f_appellation").value.trim(),
    millesime: $("f_millesime").value.trim(),
    couleur: $("f_couleur").value,
    format: $("f_format").value.trim(),
    emplacement: $("f_emplacement").value.trim()
  };
}

async function lookup(ean) {
  ean = normalizeEan(ean);
  if (!ean) { alert("Veuillez saisir ou scanner un code-barres."); return; }

  last.ean = ean;
  setStatus("Recherche…");
  hide("result");
  hide("form");

  // 1) chercher dans la cave
  const found = await apiGet(API_URL + "?action=find&ean=" + encodeURIComponent(ean));
  if (!found.ok) {
    setStatus("Erreur API");
    alert("Erreur API (find) : " + (found.error || "Erreur inconnue"));
    return;
  }
  last.dataInCave = found.data || [];

  // 2) tenter Open Food Facts pour préremplir
  let offProduct = null;
  try {
    const off = await fetch("https://world.openfoodfacts.org/api/v0/product/" + ean + ".json");
    const offJson = await off.json();
    if (offJson && offJson.status === 1 && offJson.product) {
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
  } catch (e) {}

  last.product = offProduct;

  renderResult();
  setStatus("Prêt");

  // si pas trouvé en cave, afficher formulaire pour compléter
  if (last.dataInCave.length === 0) {
    show("form");
    fillFormFromProduct(offProduct || { nom:"", domaine:"", appellation:"", millesime:"", couleur:"", format:"" });
  }
}

/* ===========================
   RENDERRESULT (MODIFIÉ)
   Utilise onclick pour éviter
   tout souci d'event listener
   =========================== */
function renderResult() {
  const ean = last.ean;
  const cave = last.dataInCave;
  const p = last.product;

  let title = "";
  let sub = "";
  let qtyInfo = "";

  if (cave.length > 0) {
    const total = cave.reduce((s, x) => s + Number(x.quantite || 0), 0);
    title = "Vin trouvé dans votre cave";
    sub = "Références : " + cave.length + " • Total : " + total + " bouteilles";
    qtyInfo = cave.map(x => `• ${x.millesime || "NV"} : ${x.quantite} (${x.emplacement || "?"})`).join("<br>");
  } else if (p) {
    title = p.nom || "Vin non trouvé dans votre cave";
    sub = p.domaine ? p.domaine : "Fiche externe trouvée (à compléter)";
    qtyInfo = "EAN : " + ean;
  } else {
    title = "Vin inconnu";
    sub = "EAN : " + ean;
    qtyInfo = "Aucune fiche trouvée automatiquement. Complétez ci-dessous.";
  }

  const infoLinks = buildInfoLinks(ean, cave[0] || p);

  $("result").innerHTML = `
    <h2>${escapeHtml(title)}</h2>
    <div class="small">${escapeHtml(sub)}</div>
    <div class="small" style="margin-top:10px;">${qtyInfo}</div>

    <div class="buttons">
      <button class="btn primary" onclick="applyAction('add')">Ajouter en cave (+1)</button>
      <button class="btn danger" onclick="applyAction('remove')">Sortir de la cave (–1)</button>
      <button class="btn secondary" onclick="toggleInfoBox()">Informations sur le vin</button>
    </div>

    <div id="infoBox" class="small hidden" style="margin-top:12px;">
      <div><a href="${infoLinks.vivino}" target="_blank" rel="noopener">Vivino</a></div>
      <div><a href="${infoLinks.ws}" target="_blank" rel="noopener">Wine-Searcher</a></div>
      <div><a href="${infoLinks.google}" target="_blank" rel="noopener">Google</a></div>
    </div>
  `;

  show("result");
}

function toggleInfoBox() {
  const box = document.getElementById("infoBox");
  if (!box) return;
  box.classList.toggle("hidden");
}

function buildInfoLinks(ean, obj) {
  const name = obj && (obj.nom || obj.domaine)
    ? `${obj.nom || ""} ${obj.domaine || ""} ${obj.millesime || ""}`.trim()
    : ean;

  const q = encodeURIComponent(name);
  return {
    vivino: `https://www.vivino.com/search/wines?q=${q}`,
    ws: `https://www.wine-searcher.com/find/${encodeURIComponent(name.replace(/\s+/g," "))}`,
    google: `https://www.google.com/search?q=${q}`
  };
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

/* ===========================
   DEBUG APPLYACTION
   =========================== */
async function applyAction(action) {
  // DEBUG 1 : vérifier que le clic arrive ici
  alert("applyAction appelé : " + action);

  const ean = last.ean;
  if (!ean) {
    alert("EAN absent (il faut d'abord faire Chercher).");
    return;
  }

  // Choix millésime si plusieurs entrées avec même EAN
  let millesime = "";
  if (last.dataInCave.length > 1) {
    const choices = last.dataInCave.map(x => x.millesime || "NV");
    const picked = prompt("Quel millésime ? " + choices.join(", "), choices[0]);
    millesime = (picked || "").trim() || "NV";
  } else if (last.dataInCave.length === 1) {
    millesime = (last.dataInCave[0].millesime || "NV").toString();
  } else {
    const f = getFormData();
    millesime = (f.millesime || "NV").trim() || "NV";
  }

  const base = getFormData();

  const payload = {
    action,
    ean,
    millesime,
    nom: base.nom,
    domaine: base.domaine,
    appellation: base.appellation,
    couleur: base.couleur,
    format: base.format,
    emplacement: base.emplacement,
    image_url: last.product ? last.product.image_url : "",
    source: "scanner"
  };

  // DEBUG 2 : afficher ce qu’on envoie
  alert("Je vais envoyer ce payload :\n" + JSON.stringify(payload, null, 2));

  setStatus(action === "add" ? "Ajout…" : "Sortie…");

  let res;
  try {
    res = await apiPost(payload);
  } catch (e) {
    setStatus("Erreur");
    alert("Erreur réseau / fetch : " + e.message);
    return;
  }

  // DEBUG 3 : afficher la réponse API
  alert("Réponse API :\n" + JSON.stringify(res, null, 2));
  console.log("API response:", res);

  if (!res || !res.ok) {
    setStatus("Erreur");
    alert("Erreur API : " + ((res && res.error) ? res.error : "Réponse inconnue"));
    return;
  }

  // recharger l'état
  await lookup(ean);
}

async function upsert() {
  const ean = normalizeEan($("ean").value);
  if (!ean) return alert("EAN manquant.");

  const f = getFormData();
  if (!f.nom) return alert("Le nom est obligatoire.");

  const payload = {
    action: "upsert",
    ean,
    millesime: f.millesime || "NV",
    nom: f.nom,
    domaine: f.domaine,
    appellation: f.appellation,
    couleur: f.couleur,
    format: f.format,
    emplacement: f.emplacement,
    image_url: last.product ? last.product.image_url : "",
    notes: "",
    source: "scanner"
  };

  setStatus("Enregistrement…");
  const res = await apiPost(payload);
  alert("Réponse API (upsert) :\n" + JSON.stringify(res, null, 2));

  if (!res.ok) {
    setStatus("Erreur");
    alert(res.error || "Erreur API");
    return;
  }
  setStatus("Enregistré");
  alert("Fiche enregistrée.");
  await lookup(ean);
}

/* Scan caméra simple (BarcodeDetector si disponible) */
let stream = null;

async function startScan() {
  if (!("BarcodeDetector" in window)) {
    alert("Scan caméra non disponible ici. Utilisez la saisie EAN pour l’instant.");
    return;
  }

  const detector = new BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] });

  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    $("video").srcObject = stream;
    await $("video").play();
    show("cameraWrap");

    const tick = async () => {
      if (!stream) return;
      try {
        const barcodes = await detector.detect($("video"));
        if (barcodes && barcodes.length) {
          const raw = barcodes[0].rawValue;
          if (raw) {
            stopScan();
            $("ean").value = normalizeEan(raw);
            await lookup(raw);
            return;
          }
        }
      } catch (e) {}
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

  } catch (e) {
    alert("Impossible d'accéder à la caméra : " + e.message);
  }
}

function stopScan() {
  hide("cameraWrap");
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
}

function bind() {
  $("btnLookup").addEventListener("click", () => lookup($("ean").value));
  $("btnScan").addEventListener("click", startScan);
  $("btnStop").addEventListener("click", stopScan);
  $("btnUpsert").addEventListener("click", upsert);
}

(function init() {
  bind();
  setStatus("Prêt");
})();

/* ===========================
   Rendre accessible aux onclick
   =========================== */
window.applyAction = applyAction;
window.toggleInfoBox = toggleInfoBox;
