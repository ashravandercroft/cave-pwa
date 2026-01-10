// /scanner/app.js
const API_URL = "https://script.google.com/macros/s/AKfycbyxfNO9zWm3CT-GACd0oQE_ambHcJ33VHrQOxVxQIIEEpuv53G_A08cWqHXOsYcofaD/exec";
const $ = (id) => document.getElementById(id);



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

function show(id) {
  const el = $(id);
  if (el) el.classList.remove("hidden");
}

function hide(id) {
  const el = $(id);
  if (el) el.classList.add("hidden");
}

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
    btn.textContent = "Enregistrer la fiche";
    btn.style.display = "";
    btn.style.margin = "";
  }
}

/* ===========================
   Espace entre CTA cave et résultat
   =========================== */

function ensureScannerSpacing() {
  // CTA vers /cave
  const caveCta = document.querySelector(".caveCta");
  if (caveCta) {
    caveCta.style.display = "block";
    caveCta.style.marginBottom = "14px";
  }

  // Résultat
  const resEl = $("result");
  if (resEl) {
    resEl.style.marginTop = "14px";
  }
}

/* ===========================
   Lookup
   =========================== */

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
  } catch (e) {}

  last.product = offProduct;

  renderResult();
  setStatus("Prêt");
  hide("form");
}

/* ===========================
   Cards cave
   =========================== */

function renderCaveCards(cave) {
  const rows = (cave || []).map((x) => {
    const domaine = (x.domaine || "").trim();
    const nom = (x.nom || "").trim();
    const millesime = (x.millesime || "NV").toString().trim();
    const qty = Number(x.quantite || 0);

    const line1 = [domaine, nom].filter(Boolean).join(" - ") || "Vin";

    return `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; padding:10px; border:1px solid rgba(17,24,39,.10); border-radius:14px; background: rgba(255,255,255,.9); box-shadow: 0 6px 18px rgba(0,0,0,.04); margin-top:10px;">
        <div style="min-width:0;">
          <div style="font-weight:800; font-size:14px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
            ${escapeHtml(line1)}
          </div>
          <div style="margin-top:4px; font-size:13px; color: rgba(17,24,39,.72);">
            ${escapeHtml(millesime)}
          </div>
          <div style="margin-top:4px; font-size:13px; color: rgba(17,24,39,.72);">
            ${escapeHtml(String(qty))} bouteille(s)
          </div>
        </div>

        <div style="display:flex; gap:8px; flex:0 0 auto;">
          <button type="button" class="btn primary" data-act="rowAdd" data-key="${escapeHtml(x.key || "")}">+</button>
          <button type="button" class="btn danger" data-act="rowRemove" data-key="${escapeHtml(x.key || "")}">-</button>
        </div>
      </div>
    `;
  }).join("");

  return rows || "";
}

async function applyActionDirect(action, obj) {
  if (!obj || !obj.ean) return;

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

  const payload = {
    action: action === "rowAdd" ? "add" : "remove",
    qty,
    ean: obj.ean,
    millesime: (obj.millesime || "NV").toString().trim() || "NV",
    nom: obj.nom || "",
    domaine: obj.domaine || "",
    appellation: obj.appellation || "",
    couleur: obj.couleur || "",
    format: obj.format || "",
    emplacement: obj.emplacement || "",
    image_url: last.product ? last.product.image_url : "",
    source: "scanner"
  };

  setStatus(payload.action === "add" ? `Ajout… (+${qty})` : `Sortie… (-${qty})`);

  const res = await apiPost(payload);
  if (!res.ok) {
    setStatus("Erreur");
    alert(res.error || "Erreur API");
    return;
  }

  await lookup(last.ean, { keepScreen: true });
}

/* ===========================
   Render result
   =========================== */

function renderResult() {
  const ean = last.ean;
  const cave = last.dataInCave || [];
  const p = last.product;

  let title = "";
  let sub = "";
  let img = (p && p.image_url) ? p.image_url : "";

  let caveCardsHtml = "";
  let ctaHtml = "";

  if (cave.length > 0) {
    const total = cave.reduce((s, x) => s + Number(x.quantite || 0), 0);
    title = "Déjà dans la cave";
    sub = "Total : " + total + " bouteille(s)";

    caveCardsHtml = renderCaveCards(cave);

    ctaHtml = `
      <div style="margin-top:12px; display:flex; justify-content:center;">
        <button type="button" class="btn secondary" id="btnNewVintage">Nouveau millésime en cave</button>
      </div>
    `;
  } else if (p) {
    title = escapeHtml(p.nom || "Vin détecté");
    sub = escapeHtml(p.domaine || "—");

    ctaHtml = `
      <div style="margin-top:12px; display:flex; justify-content:center;">
        <button type="button" class="btn secondary" id="btnNewWine">Nouveau vin en cave</button>
      </div>
    `;
  } else {
    title = "Vin inconnu";
    sub = "EAN : " + escapeHtml(ean);

    ctaHtml = `
      <div style="margin-top:12px; display:flex; justify-content:center;">
        <button type="button" class="btn secondary" id="btnNewWine">Nouveau vin en cave</button>
      </div>
    `;
  }

  const infoLinks = buildInfoLinks(ean, cave[0] || p);

  const resEl = $("result");
  resEl.innerHTML = `
    <div class="sectionTitle">Résultat</div>
    <h2 class="resultTitle">${title}</h2>
    <div class="resultMeta">${sub}</div>

    ${img ? `<img class="photo" src="${img}" alt="Photo">` : ""}

    ${caveCardsHtml ? `<div style="margin-top:10px;">${caveCardsHtml}</div>` : ""}

    ${ctaHtml}

    <div class="actionsRow" style="margin-top:12px; justify-content:center;">
      <button type="button" class="btn secondary" id="btnInfo">Infos</button>
    </div>

    <div id="infoBox" class="infoLinks hidden">
      <a href="${infoLinks.vivino}" target="_blank" rel="noopener">Vivino</a>
      <a href="${infoLinks.ws}" target="_blank" rel="noopener">Wine-Searcher</a>
      <a href="${infoLinks.google}" target="_blank" rel="noopener">Google</a>
    </div>
  `;

  show("result");

  // IMPORTANT : applique l’espace (CTA cave est au-dessus de #result dans ton HTML)
  ensureScannerSpacing();

  $("btnInfo").onclick = () => $("infoBox").classList.toggle("hidden");

  resEl.querySelectorAll("button[data-act='rowAdd'], button[data-act='rowRemove']").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-key") || "";
      const obj = (last.dataInCave || []).find(x => (x.key || "") === key);
      if (!obj) return;
      applyActionDirect(btn.getAttribute("data-act"), obj);
    });
  });

  const btnNewVintage = document.getElementById("btnNewVintage");
  if (btnNewVintage) {
    btnNewVintage.onclick = () => {
      show("form");

      const base = (last.dataInCave && last.dataInCave[0]) ? last.dataInCave[0] : (last.product || {});
      fillFormFromAny(base);

      if ($("f_millesime")) $("f_millesime").value = "";

      setUpsertButtonMode("add");
      editingOldKey = "";

      setTimeout(() => {
        $("form")?.scrollIntoView({ behavior:"smooth", block:"start" });
      }, 120);
    };
  }

  const btnNewWine = document.getElementById("btnNewWine");
  if (btnNewWine) {
    btnNewWine.onclick = () => {
      show("form");
      fillFormFromProduct(last.product || {});
      setUpsertButtonMode("add");
      editingOldKey = "";

      setTimeout(() => {
        $("form")?.scrollIntoView({ behavior:"smooth", block:"start" });
      }, 120);
    };
  }
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

async function upsert() {
  const ean = normalizeEan($("ean")?.value || last.ean);
  if (!ean) return alert("EAN manquant.");

  const f = getFormData();
  if (!f.nom) return alert("Le nom est obligatoire.");

  const btnLabel = ($("btnUpsert")?.textContent || "").toLowerCase();
  const isAddMode = btnLabel.includes("ajouter");

  if (isAddMode) {
    const txt = prompt("Combien de bouteilles ajouter ?", "1");
    if (txt === null) return;

    let qty = parseInt(String(txt).trim(), 10);
    if (!Number.isFinite(qty) || qty <= 0) return alert("Quantité invalide.");

    const payload = {
      action: "add",
      qty,
      ean,
      millesime: (f.millesime || "NV").trim() || "NV",
      nom: f.nom || "",
      domaine: f.domaine || "",
      appellation: f.appellation || "",
      couleur: f.couleur || "",
      format: f.format || "",
      emplacement: f.emplacement || "",
      image_url: last.product ? last.product.image_url : "",
      source: "scanner"
    };

    setStatus("Ajout…");
    const res = await apiPost(payload);
    if (!res.ok) {
      setStatus("Erreur");
      alert(res.error || "Erreur API");
      return;
    }

    setStatus("Enregistré");
    alert("Ajout effectué.");
    editingOldKey = "";
    await lookup(ean, { keepScreen: true });
    return;
  }

  // Mode upsert conservé
  const payload = {
    action: "upsert",
    ean,
    millesime: f.millesime || "NV",
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

  editingOldKey = "";
  await lookup(ean, { keepScreen: true });
}

/* ===========================
   Quagga (inchangé)
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
    locator: { patchSize: "medium", halfSample: true },
    numOfWorkers: 0,
    frequency: 20,
    decoder: { readers: ["ean_reader", "ean_8_reader", "upc_reader", "upc_e_reader"] },
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
  if ($("ean")) $("ean").value = ean;
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

  // applique l’espacement aussi au chargement, même avant un scan
  ensureScannerSpacing();

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
