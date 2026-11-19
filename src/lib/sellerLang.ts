/**
 * Langue du site vendeur : choix du vendeur (Paramètres / inscription / bouton FR-EN),
 * sinon la langue du téléphone ou de l'ordinateur. En anglais, toute la page est traduite
 * automatiquement (service de traduction Amashia, résultats gardés en cache).
 */
export type SellerLang = "fr" | "en";
export const LANG_KEY = "amashia-seller-lang";
export const LANG_EVENT = "amashia-seller-lang";

export function preferredLang(): SellerLang {
  if (typeof window === "undefined") return "fr";
  try {
    const s = localStorage.getItem(LANG_KEY);
    if (s === "en" || s === "fr") return s;
  } catch { /* stockage indisponible */ }
  const list = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const l of list) {
    const x = (l || "").toLowerCase();
    if (x.startsWith("en")) return "en";
    if (x.startsWith("fr")) return "fr";
  }
  return "fr";
}

export async function applySellerLang(l: SellerLang = preferredLang()) {
  if (typeof window === "undefined") return;
  document.documentElement.lang = l;
  const m = await import("@/lib/autoTranslate");
  if (l === "en") m.startAutoTranslate(); else m.stopAutoTranslate();
}

/** Change la langue (et la mémorise) : la page se traduit tout de suite. */
export function setSellerLang(l: SellerLang) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(LANG_KEY, l); } catch { /* stockage indisponible */ }
  if (l === "en") {
    document.documentElement.setAttribute("data-tr", "wait");
    void import("@/lib/autoTranslate").then((m) => m.holdPage());
  }
  void applySellerLang(l);
  window.dispatchEvent(new Event(LANG_EVENT));
}

/** Script exécuté dans <head> avant l'affichage : la page anglaise reste masquée jusqu'à sa traduction. */
export const LANG_BOOT_SCRIPT = `(function(){try{var s=localStorage.getItem(${JSON.stringify(LANG_KEY)});var l=s==="en"||s==="fr"?s:null;if(!l){var p=navigator.languages&&navigator.languages.length?navigator.languages:[navigator.language];for(var i=0;i<p.length;i++){var x=(p[i]||"").toLowerCase();if(x.indexOf("en")===0){l="en";break}if(x.indexOf("fr")===0){l="fr";break}}}if(l==="en"){var d=document.documentElement;d.setAttribute("data-tr","wait");d.lang="en";setTimeout(function(){d.removeAttribute("data-tr")},2500)}}catch(e){}})();`;
