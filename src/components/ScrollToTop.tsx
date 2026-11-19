import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";

/**
 * Chaque changement de page (lien, bouton, recherche, page suivante d'une liste…) affiche la nouvelle page
 * depuis l'en-tête, y compris dans les zones qui défilent à l'intérieur d'un cadre.
 * Seuls les retours « Précédent / Suivant » du navigateur gardent la position où l'on était.
 */
const idx = (state: unknown) => Number((state as Record<string, unknown> | undefined)?.__TSR_index ?? NaN);
const keyOf = (search: unknown) => {
  const s = (search ?? {}) as Record<string, unknown>;
  return `${s.page ?? ""}|${s.q ?? ""}|${s.query ?? ""}`;
};

export function ScrollToTop() {
  const router = useRouter();
  useEffect(() => {
    let popped = false;
    const onPop = () => { popped = true; };
    window.addEventListener("popstate", onPop);
    const top = () => {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      document.querySelectorAll<HTMLElement>("main, [data-scroll-top], .overflow-y-auto, .overflow-auto").forEach((el) => {
        if (el.scrollTop > 0 && !el.closest("[role='dialog'], [data-radix-popper-content-wrapper], aside, nav")) el.scrollTop = 0;
      });
    };
    let pending = false;
    const unsubBefore = router.subscribe("onBeforeNavigate", (e) => {
      const from = e.fromLocation, to = e.toLocation;
      const fromIdx = idx(from?.state), toIdx = idx(to.state);
      // retour / avance du navigateur : on garde la position mémorisée
      const isHistoryMove = popped || (!Number.isNaN(fromIdx) && !Number.isNaN(toIdx) && toIdx < fromIdx);
      popped = false;
      const changed = from?.pathname !== to.pathname || keyOf(from?.search) !== keyOf(to.search);
      pending = !isHistoryMove && changed && !to.hash;
    });
    // on remonte une fois la nouvelle page chargée puis affichée (et encore juste après, pour les contenus qui arrivent tard)
    const run = () => { if (!pending) return; top(); requestAnimationFrame(top); setTimeout(top, 60); setTimeout(top, 250); };
    const unsubResolved = router.subscribe("onResolved", run);
    const unsubRendered = router.subscribe("onRendered", () => { run(); pending = false; });
    return () => { unsubBefore(); unsubResolved(); unsubRendered(); window.removeEventListener("popstate", onPop); };
  }, [router]);
  return null;
}
