// Remplacez cette URL par votre Apps Script /exec
const API_URL = "https://script.google.com/macros/s/AKfycbyxfNO9zWm3CT-GACd0oQE_ambHcJ33VHrQOxVxQIIEEpuv53G_A08cWqHXOsYcofaD/exec";

const $ = (id) => document.getElementById(id);

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

function show(id) { $(id).classList.remove("hidden"); }
function hide(id) { $(id).classList.add("hidden"); }

async function apiGet(url) {
  const res = await fetch(url, { method: "GET" });
  return res.json();
}

async function apiPost(payload) {
  const res = await fetch(API_URL, {
    method: "POST",
    body: JSON.stringify(payload)   // pas de headers !
  });
  return res.json();
}

function normalizeEan(ean) {
  return (ean || "").toString().replace(/\D/g, "").trim();
}

function fillFormFromProduct(p) {
  $("f_nom").value = p?.nom || "";
  $("f_domaine").value = p?.domaine || "";
  $("f_appellation").value = p?.appellation || "";
  $("f_millesime").value = p?.millesime || "";
  $("f_couleur").value = p?.couleur || "";
  $("f_format").value = p?.format || "";
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
  s("Recherche…");
  hide("result");
  hide("form");

  // 1) chercher dans la cave
  const found = await apiGet(API_URL + "?action=find&ean=" + encodeURIComponent(ean));
  if (!found.ok) {
    s("Erreur API");
    alert(found.error || "Erreur API");
    return;
  }
  last.dataInCave = found.data || [];

  // 2) si pas trouvé, essayer Open Food Facts (préremplissage)
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

  // si aucune donnée cave, on ouvre le formulaire pour compléter
  if (last.dataInCave.length === 0) {
    show("form");
    fillFormFromProduct(offProduct || { nom:"", domaine:"", appellation:"", millesime:"", couleur:"", format:"" });
  }
}

function renderResult() {
  const ean = last.ean;
  const cave = last.dataInCave;
  const p = last.product;

  let title = "";
  let sub = "";
  let detailsHtml = "";
  let img = (p && p.image_url) ? p.image_url : "";

  if (cave.length > 0) {
    const total = cave.reduce((s, x) => s + Number(x.quantite || 0), 0);
    title = "Déjà dans la cave";
    sub = "Total : " + total + " bouteille(s)";
    detailsHtml = cave
      .map(x => `• ${escapeHtml(x.millesime || "NV")} : <b>${escapeHtml(String(x.quantite || 0))}</b> (${escapeHtml(x.emplacement || "?" )})`)
      .join("<br>");
  } else if (p) {
    title = escapeHtml(p.nom || "Vin détecté");
    sub = escapeHtml(p.domaine || "—");
    detailsHtml = "EAN : " + escapeHtml(ean);
  } else {
    title = "Vin inconnu";
    sub = "EAN : " + escapeHtml(ean);
    detailsHtml = "Aucune fiche automatique. Complétez ci-dessous.";
  }

  const infoLinks = buildInfoLinks(ean, cave[0] || p);

  $("result").innerHTML = `
    <div class="sectionTitle">Résultat</div>
    <h2 class="resultTitle">${title}</h2>
    <div class="resultMeta">${sub}</div>

    ${img ? `<img class="photo" src="${img}" alt="Photo">` : ""}

    <div class="resultBlock">${detailsHtml}</div>

    <div class="actionsRow">
      <button type="button" class="btn primary" id="btnAdd">+1</button>
<button type="button" class="btn danger" id="btnRemove">-1</button>
<button type="button" class="btn secondary" id="btnInfo">Infos</button>

    </div>

    <div id="infoBox" class="infoLinks hidden">
      <a href="${infoLinks.vivino}" target="_blank" rel="noopener">Vivino</a>
      <a href="${infoLinks.ws}" target="_blank" rel="noopener">Wine-Searcher</a>
      <a href="${infoLinks.google}" target="_blank" rel="noopener">Google</a>
    </div>
  `;

  show("result");

  $("btnAdd").onclick = () => applyAction("add");
  $("btnRemove").onclick = () => applyAction("remove");
  $("btnInfo").onclick = () => $("infoBox").classList.toggle("hidden");
}


function buildInfoLinks(ean, obj) {
  const name = obj && (obj.nom || obj.domaine) ? `${obj.nom || ""} ${obj.domaine || ""} ${obj.millesime || ""}`.trim() : ean;
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

async function applyAction(action) {
  const ean = last.ean;
  if (!ean) return;

  // si plusieurs millésimes en cave, demander lequel
  let millesime = "";
  if (last.dataInCave.length > 1) {
    const choices = last.dataInCave.map(x => x.millesime || "NV");
    const picked = prompt("Quel millésime ? " + choices.join(", "), choices[0]);
    millesime = (picked || "").trim() || "NV";
  } else if (last.dataInCave.length === 1) {
    millesime = (last.dataInCave[0].millesime || "NV").toString();
  } else {
    // pas en cave : on prend le formulaire si rempli
    const f = getFormData();
    millesime = (f.millesime || "NV").trim() || "NV";
  }

  // si add et pas en cave : on crée minimalement via add (API crée si absent)
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

  setStatus(action === "add" ? "Ajout…" : "Sortie…");
  const res = await apiPost(payload);
  if (!res.ok) {
    setStatus("Erreur");
    alert(res.error || "Erreur API");
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
  if (!f.couleur) return alert("La couleur est recommandée.");

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
  if (!res.ok) {
    setStatus("Erreur");
    alert(res.error || "Erreur API");
    return;
  }

  setStatus("Enregistré");
  alert("Fiche enregistrée.");
  await lookup(ean);
}

/* Scan caméra basique (si BarcodeDetector existe) */
let stream = null;

/* ===========================
   Scan caméra (QuaggaJS)
   =========================== */

let quaggaRunning = false;
let lastDetected = "";
let lastDetectedAt = 0;

function startScan() {
  // Quagga doit être chargé par le script CDN
  if (!window.Quagga) {
    alert("Quagga n'est pas chargé. Vérifiez que le script Quagga est bien dans index.html.");
    return;
  }

  show("cameraWrap");
  setStatus("Scan en cours…");

  const viewport = document.getElementById("scannerViewport");
  if (!viewport) {
    alert("scannerViewport introuvable dans la page.");
    return;
  }

  // Reset des gardes
  lastDetected = "";
  lastDetectedAt = 0;

  const config = {
    inputStream: {
      name: "Live",
      type: "LiveStream",
      target: viewport,
      constraints: {
        facingMode: "environment",
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    },
    locator: {
      patchSize: "medium",
      halfSample: true
    },
    numOfWorkers: 0, // iOS Safari : souvent mieux à 0
    frequency: 20,
    decoder: {
      readers: [
        "ean_reader",
        "ean_8_reader",
        "upc_reader",
        "upc_e_reader"
      ]
    },
    locate: true
  };

  Quagga.init(config, (err) => {
    if (err) {
      setStatus("Erreur caméra");
      alert("Impossible d'initialiser la caméra : " + err.message);
      hide("cameraWrap");
      return;
    }

    Quagga.start();
    quaggaRunning = true;

    // Dessin de la zone détectée (optionnel)
    Quagga.onProcessed(onQuaggaProcessed);
    Quagga.onDetected(onQuaggaDetected);
  });
}

function onQuaggaProcessed(result) {
  // Optionnel : dessiner une boîte autour du code-barres
  const drawingCtx = Quagga.canvas.ctx.overlay;
  const drawingCanvas = Quagga.canvas.dom.overlay;

  if (!drawingCtx || !drawingCanvas) return;

  drawingCtx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);

  if (result && result.boxes) {
    result.boxes
      .filter((b) => b !== result.box)
      .forEach((box) => {
        Quagga.ImageDebug.drawPath(box, { x: 0, y: 1 }, drawingCtx, {
          color: "rgba(0,255,0,0.3)",
          lineWidth: 2
        });
      });
  }

  if (result && result.box) {
    Quagga.ImageDebug.drawPath(result.box, { x: 0, y: 1 }, drawingCtx, {
      color: "rgba(255,0,0,0.6)",
      lineWidth: 3
    });
  }
}

function onQuaggaDetected(data) {
  const code = data && data.codeResult && data.codeResult.code;
  if (!code) return;

  const ean = normalizeEan(code);
  if (!ean) return;

  // Garde anti "double scan"
  // iOS peut détecter plusieurs fois le même code : on évite les doublons
  const now = Date.now();
  if (ean === lastDetected && now - lastDetectedAt < 1500) return;

  lastDetected = ean;
  lastDetectedAt = now;

  stopScan();
  $("ean").value = ean;
  lookup(ean);
}

function stopScan() {
  if (window.Quagga && quaggaRunning) {
    try {
      Quagga.offProcessed(onQuaggaProcessed);
      Quagga.offDetected(onQuaggaDetected);
      Quagga.stop();
    } catch (e) {}
  }
  quaggaRunning = false;
  hide("cameraWrap");
  setStatus("Prêt");
}


function bind() {
  $("btnLookup").addEventListener("click", () => lookup($("ean").value));
  $("btnScan").addEventListener("click", startScan);
  $("btnStop").addEventListener("click", stopScan);
  $("btnUpsert").addEventListener("click", upsert);
  $("cameraWrap")?.addEventListener("click", (e) => {
  if (e.target && e.target.id === "cameraWrap") stopScan();
});
  $("btnLookup")?.addEventListener("click", () => lookup($("ean")?.value || ""));


}

(function init() {
  bind();
  setStatus("Prêt");

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();

function lookupFromUI() {
  const input = document.getElementById("ean");
  if (input) input.blur(); // iOS : évite les clics “perdus” quand le clavier est ouvert
  const val = input ? input.value : "";
  lookup(val);
}

// rendre accessible au onclick HTML
window.lookupFromUI = lookupFromUI;
