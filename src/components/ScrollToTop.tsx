import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";

/**
 * Chaque changement de page (lien, bouton, page suivante d'une liste…) ramène en haut de la page,
 * y compris dans les zones qui défilent à l'intérieur d'un cadre (menus, tableaux de bord).
 * Seuls les retours « Précédent / Suivant » du navigateur gardent la position où l'on était.
 */
export function ScrollToTop() {
  const router = useRouter();
  useEffect(() => {
    let popped = false;
    const onPop = () => { popped = true; };
    window.addEventListener("popstate", onPop);
    const pageOf = (search: unknown) => String((search as Record<string, unknown> | undefined)?.page ?? "");
    const unsub = router.subscribe("onResolved", (e) => {
      const fromBack = popped; popped = false;
      if (fromBack) return;
      const pathChanged = e.fromLocation?.pathname !== e.toLocation.pathname;
      const pageChanged = pageOf(e.fromLocation?.search) !== pageOf(e.toLocation.search);
      if (!pathChanged && !pageChanged) return;
      if (e.toLocation.hash) return; // lien vers une section précise de la page
      const top = () => {
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
        document.querySelectorAll<HTMLElement>("main, [data-scroll-top], .overflow-y-auto, .overflow-auto").forEach((el) => {
          if (el.scrollTop > 0 && !el.closest("[role='dialog'], [data-radix-popper-content-wrapper], aside, nav")) el.scrollTop = 0;
        });
      };
      top();
      requestAnimationFrame(top);
    });
    return () => { unsub(); window.removeEventListener("popstate", onPop); };
  }, [router]);
  return null;
}
