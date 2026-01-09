// /cave/app.js (modifié)
// Objectif : nouvelle présentation des vins + mini-encadré commentaire + ligne de boutons selon ton ordre

// Même API que le scanner
const API_URL = "https://script.google.com/macros/s/AKfycbyxfNO9zWm3CT-GACd0oQE_ambHcJ33VHrQOxVxQIIEEpuv53G_A08cWqHXOsYcofaD/exec";
const $ = (id) => document.getElementById(id);

alert("CAVE APP.JS V-NOUVEAU-LAYOUT");

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

/* ---------- NOTE /10 ---------- */

function normalizeRatingHalf(v) {
  if (v === "" || v === null || v === undefined) return "";
  const n = Number(String(v).replace(",", "."));
  if (Number.isNaN(n)) return "";
  const clamped = Math.max(0, Math.min(10, n));
  return Math.round(clamped * 2) / 2; // pas de 0,5
}

/* ---------- AFFICHAGE ---------- */

function fmtWineTitle(o){
  const nom = (o.nom || "").trim() || "Vin";
  return nom;
}

function fmtHeader(o){
  const domaine = (o.domaine || "").trim() || "Domaine";
  const millesime = (o.millesime || "NV").toString().trim();
  return `${domaine} - ${millesime}`;
}

/* ---------- FILTRES ---------- */

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
