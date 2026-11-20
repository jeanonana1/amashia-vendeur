import { useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

/**
 * Fenêtre « Votre avis sur Amachia » : quelques minutes après la création du compte,
 * puis toutes les 2 heures tant que le vendeur n'a pas donné son avis.
 * L'avis (vrai, laissé par le vendeur) s'affiche ensuite dans la section « Ils vendent sur Amachia » de l'accueil.
 */
const FIRST_DELAY = 5 * 60_000;   // 5 minutes après l'inscription
const REPEAT = 2 * 3_600_000;     // puis toutes les 2 heures
const LOCAL = "amashia-review-prompted-at";
const db = () => supabase as any;

export function ReviewPrompt({ uid }: { uid: string }) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const pathRef = useRef(pathname);
  pathRef.current = pathname;
  const state = useRef<{ created: number; last: number; done: boolean } | null>(null);

  useEffect(() => {
    let alive = true;
    let timer = 0;
    void (async () => {
      const [{ data: prof }, { data: rev }] = await Promise.all([
        db().from("seller_profiles").select("created_at, review_prompted_at").eq("id", uid).maybeSingle(),
        db().from("seller_platform_reviews").select("id").eq("seller_id", uid).maybeSingle(),
      ]);
      if (!alive || rev || !prof) return;
      let local = 0;
      try { local = Number(localStorage.getItem(`${LOCAL}:${uid}`) || 0); } catch { /* stockage indisponible */ }
      state.current = { created: new Date(prof.created_at).getTime(), last: Math.max(prof.review_prompted_at ? new Date(prof.review_prompted_at).getTime() : 0, local), done: false };
      const check = () => {
        const st = state.current;
        if (!st || st.done) return;
        const due = st.last ? st.last + REPEAT : st.created + FIRST_DELAY;
        // pas pendant la création d'un produit ni une fenêtre déjà ouverte
        if (Date.now() >= due && !pathRef.current.includes("/produits/ajouter") && !document.querySelector("[role=dialog]")) {
          st.last = Date.now();
          try { localStorage.setItem(`${LOCAL}:${uid}`, String(st.last)); } catch { /* stockage indisponible */ }
          void db().from("seller_profiles").update({ review_prompted_at: new Date(st.last).toISOString() }).eq("id", uid);
          setOpen(true);
        }
      };
      check();
      timer = window.setInterval(check, 30_000);
    })();
    return () => { alive = false; window.clearInterval(timer); };
  }, [uid]);

  async function submit() {
    if (!rating) return toast.error("Choisissez une note de 1 à 5 étoiles");
    if (body.trim().length < 15) return toast.error("Écrivez au moins 15 caractères");
    setBusy(true);
    const { error } = await db().from("seller_platform_reviews").upsert({ seller_id: uid, rating, body: body.trim() }, { onConflict: "seller_id" });
    setBusy(false);
    if (error) return toast.error("Envoi impossible. Réessayez dans un instant.");
    if (state.current) state.current.done = true;
    setOpen(false);
    toast.success("Merci ! Votre avis est publié sur la page d'accueil Amachia Seller.");
  }

  if (!open) return null;
  const shown = hover || rating;
  const LABELS = ["", "Très déçu", "Déçu", "Correct", "Satisfait", "Excellent !"];
  return (
    <div className="fixed inset-0 z-[150] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4" onClick={() => setOpen(false)}>
      <div role="dialog" aria-modal="true" aria-label="Votre avis sur Amachia" className="app-select-sheet relative w-full max-w-md rounded-t-3xl border border-border bg-card p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <button onClick={() => setOpen(false)} className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full bg-secondary text-muted-foreground" aria-label="Plus tard"><X size={16} /></button>
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/15 text-3xl text-primary">★</span>
        <h3 className="mt-4 text-xl font-extrabold">Que pensez-vous d'Amachia ?</h3>
        <p className="mt-1.5 text-sm text-muted-foreground">Votre avis aide d'autres vendeurs à se lancer. Il sera affiché sur la page d'accueil avec votre prénom, le logo et la ville de votre boutique.</p>
        <div className="mt-5 flex items-center gap-1.5" role="radiogroup" aria-label="Note sur 5" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={rating === n} onMouseEnter={() => setHover(n)} onClick={() => setRating(n)}
              className={`grid h-12 w-12 place-items-center rounded-xl text-2xl transition-transform active:scale-90 ${n <= shown ? "scale-105 bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"}`}>★</button>
          ))}
          <span className="ml-2 text-sm font-semibold text-primary">{LABELS[shown]}</span>
        </div>
        <textarea value={body} onChange={(e) => setBody(e.target.value.slice(0, 240))} rows={3} placeholder="Ex. : Je publie mes produits le soir, Amachia s'occupe de la livraison et du paiement."
          className="mt-4 w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:border-primary focus:outline-none" />
        <p className="mt-1 text-right text-[11px] text-muted-foreground">{body.trim().length}/240 · 15 caractères minimum</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button onClick={() => setOpen(false)} className="h-12 rounded-full bg-secondary text-sm font-semibold">Plus tard</button>
          <button onClick={() => void submit()} disabled={busy} className="cta-sweep flex h-12 items-center justify-center gap-2 rounded-full bg-primary text-sm font-bold text-black disabled:opacity-60">{busy && <Loader2 size={16} className="animate-spin" />}Publier mon avis</button>
        </div>
      </div>
    </div>
  );
}
