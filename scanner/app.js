const API_URL = "https://script.google.com/macros/s/AKfycbyxfNO9zWm3CT-GACd0oQE_ambHcJ33VHrQOxVxQIIEEpuv53G_A08cWqHXOsYcofaD/exec";

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
  $("f_nom").value = p.nom || "";
  $("f_domaine").value = p.domaine || "";
  $("f_appellation").value = p.appellation || "";
  $("f_millesime").value = p.millesime || "";
  $("f_couleur").value = p.couleur || "";
  $("f_format").value = p.format || "";
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

  // si aucune donnée cave et pas de fiche complète, on ouvre le formulaire
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
  let qtyInfo = "";

  if (cave.length > 0) {
    // plusieurs millésimes possibles
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
      <button class="btn primary" id="btnAdd">Ajouter en cave (+1)</button>
      <button class="btn danger" id="btnRemove">Sortir de la cave (–1)</button>
      <button class="btn secondary" id="btnInfo">Informations sur le vin</button>
    </div>

    <div id="infoBox" class="small hidden" style="margin-top:12px;">
      <div><a href="${infoLinks.vivino}" target="_blank" rel="noopener">Vivino</a></div>
      <div><a href="${infoLinks.ws}" target="_blank" rel="noopener">Wine-Searcher</a></div>
      <div><a href="${infoLinks.google}" target="_blank" rel="noopener">Google</a></div>
    </div>
  `;

  show("result");

  $("btnAdd").addEventListener("click", () => applyAction("add"));
  $("btnRemove").addEventListener("click", () => applyAction("remove"));
  $("btnInfo").addEventListener("click", () => {
    const box = $("infoBox");
    box.classList.toggle("hidden");
  });
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
  if (!f.couleur) return alert("La couleur est recommandée (au minimum).");

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

async function startScan() {
  if (!("BarcodeDetector" in window)) {
    alert("Le scan caméra automatique n’est pas disponible sur cet iPhone dans cette version. Utilisez la saisie EAN pour l’instant (on ajoutera QuaggaJS ensuite).");
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

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();

