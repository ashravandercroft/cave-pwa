// Remplacez cette URL par votre Apps Script /exec
const API_URL = "https://script.google.com/macros/s/AKfycbyxfNO9zWm3CT-GACd0oQE_ambHcJ33VHrQOxVxQIIEEpuv53G_A08cWqHXOsYcofaD/exec";

const $ = (id) => document.getElementById(id);

window.__APP_LOADED__ = "OK";
alert("APP.JS chargé V9");

// ✅ old_key uniquement en mode édition (via bouton "Modifier la fiche")
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

/**
 * IMPORTANT : ne remplir les champs que s'ils sont vides
 * => évite d'écraser le millésime que vous avez tapé
 */
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
    nom: $("f_nom").value.trim(),
    domaine: $("f_domaine").value.trim(),
    appellation: $("f_appellation").value.trim(),
    millesime: $("f_millesime").value.trim(),
    couleur: $("f_couleur").value,
    format: $("f_format").value.trim(),
    emplacement: $("f_emplacement").value.trim()
  };
}

function fillFormFromAny(o) {
  if (!o) return;

  $("f_nom").value = o.nom || "";
  $("f_domaine").value = o.domaine || "";
  $("f_appellation").value = o.appellation || "";
  $("f_millesime").value = o.millesime || "NV";
  $("f_couleur").value = o.couleur || "";
  $("f_format").value = o.format || "";
  $("f_emplacement").value = o.emplacement || "";
}

/**
 * lookup(ean, opts)
 * opts.keepScreen = true => ne cache pas result/form au démarrage
 */
async function lookup(ean, opts = {}) {
  ean = normalizeEan(ean);
  if (!ean) { alert("Veuillez saisir ou scanner un code-barres."); return; }

  last.ean = ean;

  // ✅ IMPORTANT : à chaque nouveau scan/recherche, on sort du mode édition
  editingOldKey = "";

  setStatus("Recherche…");

  if (!opts.keepScreen) {
    hide("result");
    hide("form");
  }

  // 1) chercher dans la cave
  const found = await apiGet(API_URL + "?action=find&ean=" + encodeURIComponent(ean));
  if (!found.ok) {
    setStatus("Erreur API");
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

  // ✅ NOUVEAU COMPORTEMENT :
  // - on affiche TOUJOURS le formulaire
  // - si déjà en cave => on préremplit les infos (nom/domaine/etc)
  // - MAIS on laisse le millésime vide pour pouvoir ajouter un nouveau millésime
  show("form");

  if (last.dataInCave.length > 0) {
    const base = last.dataInCave[0];
    fillFormFromAny(base);

    // Millésime volontairement vide (choix utilisateur)
    $("f_millesime").value = "";
  } else {
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

    // ✅ MODIF : on n'affiche QUE millésime + quantité (plus de (?) / parenthèses)
    detailsHtml = cave
      .map(x => `• ${escapeHtml(x.millesime || "NV")} : <b>${escapeHtml(String(x.quantite || 0))}</b>`)
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
      <button type="button" class="btn secondary" id="btnEdit">Modifier la fiche</button>
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

  // ✅ MODIF : demander quel millésime on veut éditer, si plusieurs
  $("btnEdit").onclick = () => {
    if (!last.dataInCave || last.dataInCave.length === 0) {
      show("form");
      fillFormFromAny(last.product || {});
      return;
    }

    let objToEdit = last.dataInCave[0];

    if (last.dataInCave.length > 1) {
      const choices = last.dataInCave.map(x => x.millesime || "NV");
      const picked = prompt("Quel millésime voulez-vous modifier ? " + choices.join(", "), choices[0]);
      const m = (picked || "").trim() || choices[0];
      objToEdit = last.dataInCave.find(x => (x.millesime || "NV") === m) || last.dataInCave[0];
    }

    // ✅ ici on active la migration (uniquement pour édition)
    editingOldKey = String(objToEdit.key || "").trim();

    show("form");
    fillFormFromAny(objToEdit);

    setTimeout(() => {
      $("form")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
  };
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

/**
 * ✅ OPTION A + FIX "VIN" :
 * - le millésime prend priorité sur le formulaire
 * - si le formulaire est vide, on prend les infos existantes en cave
 */
async function applyAction(action) {
  const ean = last.ean;
  if (!ean) return;

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

  // Millésime : priorité au formulaire
  let millesime = (getFormData().millesime || "").trim();

  // si pas indiqué et plusieurs millésimes => demander
  if (!millesime) {
    if (last.dataInCave.length > 1) {
      const choices = last.dataInCave.map(x => x.millesime || "NV");
      const picked = prompt("Quel millésime ? " + choices.join(", "), choices[0]);
      millesime = (picked || "").trim();
    } else if (last.dataInCave.length === 1) {
      millesime = (last.dataInCave[0].millesime || "NV").toString();
    }
  }
  if (!millesime) millesime = "NV";

  // ✅ IMPORTANT : toujours envoyer un nom/domaine/etc
  let base = getFormData();
  const hasAnyInfo = base.nom || base.domaine || base.couleur || base.format;

  if (!hasAnyInfo && last.dataInCave.length > 0) {
    base = {
      nom: last.dataInCave[0].nom || "",
      domaine: last.dataInCave[0].domaine || "",
      appellation: last.dataInCave[0].appellation || "",
      couleur: last.dataInCave[0].couleur || "",
      format: last.dataInCave[0].format || "",
      emplacement: last.dataInCave[0].emplacement || ""
    };
  }

  const payload = {
    action,
    qty,
    ean,
    millesime,
    nom: base.nom || "",
    domaine: base.domaine || "",
    appellation: base.appellation || "",
    couleur: base.couleur || "",
    format: base.format || "",
    emplacement: base.emplacement || "",
    image_url: last.product ? last.product.image_url : "",
    source: "scanner"
  };

  setStatus(action === "add" ? `Ajout… (+${qty})` : `Sortie… (-${qty})`);

  const res = await apiPost(payload);
  if (!res.ok) {
    setStatus("Erreur");
    alert(res.error || "Erreur API");
    return;
  }

  const name = (payload.nom || "").trim() || "Le vin";
  alert(action === "add"
    ? `"${name}" a été ajouté à la cave (+${qty}).`
    : `"${name}" a été sorti de la cave (–${qty}).`
  );

  await lookup(ean, { keepScreen: true });
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

    // ✅ old_key envoyé uniquement si vous avez cliqué sur "Modifier la fiche"
    old_key: editingOldKey,

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

  // ✅ reset : on sort du mode édition après enregistrement
  editingOldKey = "";

  await lookup(ean, { keepScreen: true });

  setTimeout(() => {
    $("result")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 200);
}

/* ===========================
   Scan caméra (QuaggaJS)
   =========================== */

let quaggaRunning = false;
let lastDetected = "";
let lastDetectedAt = 0;

function startScan() {
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
    numOfWorkers: 0,
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

    Quagga.onProcessed(onQuaggaProcessed);
    Quagga.onDetected(onQuaggaDetected);
  });
}

function onQuaggaProcessed(result) {
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
  $("btnLookup")?.addEventListener("click", () => lookup($("ean")?.value || ""));
  $("btnScan")?.addEventListener("click", startScan);
  $("btnStop")?.addEventListener("click", stopScan);
  $("btnUpsert")?.addEventListener("click", upsert);

  $("cameraWrap")?.addEventListener("click", (e) => {
    if (e.target && e.target.id === "cameraWrap") stopScan();
  });

  $("ean")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      lookup($("ean")?.value || "");
    }
  });
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
  if (input) input.blur();
  const val = input ? input.value : "";
  lookup(val);
}
window.lookupFromUI = lookupFromUI;
