

/**
 * Version anglaise du site : chaque texte français affiché (interface, fiches des
 * vendeurs, avis…) est traduit une fois par le service de traduction Amachia (Claude),
 * puis gardé en cache (CDN + navigateur). Les éléments marqués translate="no"
 * (prix, noms, adresses, numéros de commande…) ne sont jamais traduits.
 */

const ENDPOINT = "/api/translate";
const STORE = "amashia-seller-tr-en-v1";
const ATTRS = ["placeholder", "title", "aria-label", "alt"] as const;
const SKIP = 'head, script, style, noscript, textarea, code, pre, svg, [translate="no"], .notranslate, [contenteditable="true"]';

// Textes déjà en anglais (dictionnaire de l'interface) : rien à traduire
const english = new Set<string>();

// Dictionnaire anglais livré avec le site : les textes de l'interface s'affichent tout de suite traduits
import bundled from "./tr-en.json";
const cache = new Map<string, string>(bundled as [string, string][]);
try {
  const saved = JSON.parse(localStorage.getItem(STORE) || "[]") as [string, string][];
  for (const [k, v] of saved) cache.set(k, v);
} catch { /* stockage indisponible */ }
let saveTimer = 0;
function persist() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try { localStorage.setItem(STORE, JSON.stringify([...cache.entries()].slice(-4000))); } catch { /* plein */ }
  }, 1000);
}

/** Les nombres deviennent des marqueurs : « 3 vendus » et « 12 vendus » partagent la même traduction. */
function toTemplate(s: string) {
  const nums: string[] = [];
  const tpl = s.replace(/\d[\d\s.,:/h]*\d|\d/g, (m) => { nums.push(m); return `⟦${nums.length - 1}⟧`; });
  return { tpl, nums };
}
const fromTemplate = (t: string, nums: string[]) => t.replace(/⟦(\d+)⟧/g, (_, i) => nums[Number(i)] ?? "");

function worthTranslating(s: string) {
  if (s.length < 2 || s.length > 1500 || english.has(s)) return false;
  const letters = s.replace(/FCFA|AMA-[A-Z0-9]+|https?:\/\/\S+|\S+@\S+/g, "");
  return /[A-Za-zÀ-ÿ]{2,}/.test(letters);
}

// ---------- File d'attente des traductions (par lots) ----------
const waiting = new Map<string, ((t: string) => void)[]>();
let queue: string[] = [];
let running = 0;
let flushTimer = 0;
const BATCH = 60;
const CONCURRENCY = 4;

function request(tpl: string): Promise<string> {
  const hit = cache.get(tpl);
  if (hit !== undefined) return Promise.resolve(hit);
  return new Promise((resolve) => {
    const list = waiting.get(tpl);
    if (list) return list.push(resolve);
    waiting.set(tpl, [resolve]);
    queue.push(tpl);
    // texte encore jamais traduit : la page est masquée tout de suite (avant l'affichage du français)
    // seulement au tout premier affichage : ensuite, les nouveaux textes se traduisent sans masquer la page
    if (active && Date.now() - startedAt < 1200) holdPage();
    updateBusy();
    // les textes d'un même rendu partent ensemble
    if (!flushTimer) flushTimer = window.setTimeout(pump, 16);
  });
}

function settle(tpl: string, t: string) {
  waiting.get(tpl)?.forEach((r) => r(t));
  waiting.delete(tpl);
}

function pump() {
  flushTimer = 0;
  while (running < CONCURRENCY && queue.length) {
    const batch = queue.slice(0, BATCH);
    queue = queue.slice(BATCH);
    running++;
    fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ to: "en", q: batch }) })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: { t?: unknown }) => {
        const out = Array.isArray(d.t) ? d.t : [];
        batch.forEach((tpl, i) => {
          const t = typeof out[i] === "string" && (out[i] as string).trim() ? (out[i] as string) : tpl;
          cache.set(tpl, t);
          settle(tpl, t);
        });
        persist();
      })
      .catch(() => batch.forEach((tpl) => settle(tpl, tpl))) // service indisponible : le texte reste en français
      .finally(() => { running--; updateBusy(); if (queue.length) pump(); });
  }
}

// ---------- Écran de chargement : la page n'apparaît qu'une fois traduite ----------
let showTimer = 0;
let safetyTimer = 0;
const isBusy = () => waiting.size > 0 || queue.length > 0 || running > 0;

/** Masque la page (écran de chargement) ; elle réapparaît dès que tout est traduit. */
export function holdPage() {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-tr", "wait");
  window.clearTimeout(safetyTimer);
  // filet de sécurité : la page s'affiche quoi qu'il arrive
  safetyTimer = window.setTimeout(releasePage, 2_500);
}
function releasePage() {
  window.clearTimeout(showTimer);
  showTimer = 0;
  window.clearTimeout(safetyTimer);
  document.documentElement.removeAttribute("data-tr");
}
function updateBusy() {
  if (!active) return;
  if (!isBusy()) {
    // laisse le temps aux traductions reçues d'être appliquées avant d'afficher
    window.setTimeout(() => { if (!isBusy()) releasePage(); }, 30);
  }
}

// ---------- Application dans la page ----------
type TextState = { src: string; out: string };
const texts = new Map<Text, TextState>();
const attrs = new Map<Element, Record<string, TextState>>();
let active = false;
let observer: MutationObserver | null = null;

function translateTextNode(node: Text) {
  const value = node.nodeValue ?? "";
  const known = texts.get(node);
  if (known && value === known.out) return; // déjà traduit par nous
  const trimmed = value.trim();
  if (!worthTranslating(trimmed) || node.parentElement?.closest(SKIP)) { texts.delete(node); return; }
  const { tpl, nums } = toTemplate(trimmed.replace(/\s+/g, " "));
  const state: TextState = { src: value, out: value };
  texts.set(node, state);
  // traduction déjà connue : appliquée immédiatement, sans attente
  const hit = cache.get(tpl);
  if (hit !== undefined) {
    const lead = value.match(/^\s*/)![0], trail = value.match(/\s*$/)![0];
    state.out = lead + fromTemplate(hit, nums) + trail;
    if (state.out !== value) node.nodeValue = state.out;
    return;
  }
  void request(tpl).then((t) => {
    if (!active || texts.get(node) !== state || node.nodeValue !== value) return;
    const lead = value.match(/^\s*/)![0], trail = value.match(/\s*$/)![0];
    // le nom « Prime » (abonnement Amachia Prime) ne se traduit jamais
    let out = fromTemplate(t, nums);
    if (/\bPrime\b/.test(trimmed)) out = out.replace(/\bPremium\b/g, "Prime").replace(/\bPRIME\b|\bPREMIUM\b/g, "PRIME");
    state.out = lead + out + trail;
    if (state.out !== value) node.nodeValue = state.out;
  });
}

function translateAttrs(el: Element) {
  if (el.closest(SKIP)) return;
  for (const a of ATTRS) {
    const value = el.getAttribute(a);
    if (!value) continue;
    const rec = attrs.get(el) ?? {};
    if (rec[a] && rec[a].out === value) continue;
    const trimmed = value.trim();
    if (!worthTranslating(trimmed)) continue;
    const { tpl, nums } = toTemplate(trimmed);
    const state: TextState = { src: value, out: value };
    rec[a] = state;
    attrs.set(el, rec);
    void request(tpl).then((t) => {
      if (!active || el.getAttribute(a) !== value) return;
      state.out = fromTemplate(t, nums);
      el.setAttribute(a, state.out);
    });
  }
}

function walk(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) return translateTextNode(root as Text);
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const el = root as Element;
  if (el.closest(SKIP)) return;
  translateAttrs(el);
  const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: (n) => (n.nodeType === Node.ELEMENT_NODE && (n as Element).matches(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  let n: Node | null;
  while ((n = tw.nextNode())) {
    if (n.nodeType === Node.TEXT_NODE) translateTextNode(n as Text);
    else translateAttrs(n as Element);
  }
}

let titleSrc = "";
function translateTitle() {
  const t = document.title;
  if (!t || t === titleSrc) return;
  const { tpl, nums } = toTemplate(t);
  void request(tpl).then((r) => { if (active && document.title === t) { titleSrc = fromTemplate(r, nums); document.title = titleSrc; } });
}

let startedAt = 0;
export function startAutoTranslate() {
  if (active || typeof window === "undefined") return;
  active = true;
  startedAt = Date.now();
  document.documentElement.lang = "en";
  // toute la page (et non <body> seul : React peut recréer <body> après un écart d'hydratation)
  walk(document.body);
  translateTitle();
  if (!isBusy()) window.setTimeout(() => { if (!isBusy()) releasePage(); }, 30);
  observer = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.target.nodeName === "TITLE" || m.target.parentNode?.nodeName === "TITLE") continue;
      if (m.type === "characterData") translateTextNode(m.target as Text);
      else if (m.type === "attributes") translateAttrs(m.target as Element);
      else m.addedNodes.forEach((n) => walk(n));
    }
    translateTitle();
  });
  observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] });
}

/** Retour au français : chaque texte retrouve sa version d'origine. */
export function stopAutoTranslate() {
  if (!active) return;
  active = false;
  observer?.disconnect();
  observer = null;
  for (const [node, s] of texts) if (node.isConnected && node.nodeValue === s.out) node.nodeValue = s.src;
  for (const [el, rec] of attrs) for (const [a, s] of Object.entries(rec)) if (el.isConnected && el.getAttribute(a) === s.out) el.setAttribute(a, s.src);
  texts.clear();
  attrs.clear();
  releasePage();
  document.documentElement.lang = "fr";
}

