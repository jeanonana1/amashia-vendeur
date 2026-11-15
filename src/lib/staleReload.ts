/**
 * Après une mise en ligne, une page restée ouverte peut réclamer des fichiers de l'ancienne version
 * (menu, panier…) qui n'existent plus : au lieu d'afficher une erreur, on recharge la page une fois
 * pour obtenir la nouvelle version.
 */
const STALE = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|ChunkLoadError|Loading chunk \d+ failed|Load failed.*\.js/i;

export const isStaleChunk = (e: unknown) => STALE.test(String((e as Error)?.message ?? e ?? ""));

export function reloadForNewVersion(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const k = "amashia-reload-at";
    if (Date.now() - Number(sessionStorage.getItem(k) || 0) < 15_000) return false; // évite une boucle
    sessionStorage.setItem(k, String(Date.now()));
  } catch { /* navigation privée */ }
  window.location.reload();
  return true;
}

if (typeof window !== "undefined") {
  window.addEventListener("vite:preloadError", (e) => { e.preventDefault(); reloadForNewVersion(); });
  window.addEventListener("unhandledrejection", (e) => { if (isStaleChunk(e.reason)) reloadForNewVersion(); });
}
