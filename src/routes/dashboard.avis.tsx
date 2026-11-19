import { createFileRoute } from "@tanstack/react-router";
import { imgProps } from "@/lib/img";
import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/seller/dashboard/DashboardLayout";
import { Star, MessageSquare, BadgeCheck, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { dateTime, num, REVIEWS_SEEN_EVENT } from "@/lib/sellerStats";
import { Select } from "@/components/ui/app-select";

export const Route = createFileRoute("/dashboard/avis")({
  head: () => ({ meta: [{ title: "Avis — Amashia Seller" }, { name: "description", content: "Avis : votre espace vendeur Amashia pour gérer votre activité." }, { property: "og:title", content: "Avis — Amashia Seller" }, { property: "og:description", content: "Avis : votre espace vendeur Amashia pour gérer votre activité." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: AvisPage,
});

/** Avis laissé par un client sur le site Amashia, sur un produit du vendeur. */
type Review = {
  id: string; rating: number; comment: string | null; author: string; photos: string[] | null;
  verified: boolean; created_at: string; product_id: string; product_title: string; product_image: string | null;
};

function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span className="flex">
      {[1, 2, 3, 4, 5].map((i) => <Star key={i} size={size} className={i <= Math.round(value) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"} />)}
    </span>
  );
}

function AvisPage() {
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<number | null>(null);
  const [product, setProduct] = useState<string>("");
  const [q, setQ] = useState("");

  // date de la visite précédente : les avis reçus depuis sont marqués « Nouveau » ; la pastille du menu disparaît
  const [seenBefore, setSeenBefore] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    void (async () => {
      try {
        const { data } = await (supabase as any).rpc("mark_reviews_seen");
        setSeenBefore((data as string | null) ?? null);
      } catch { setSeenBefore(null); }
      window.dispatchEvent(new Event(REVIEWS_SEEN_EVENT));
    })();
  }, []);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      let data: unknown = null; let error: { message: string } | null = null;
      try { ({ data, error } = await (supabase as any).rpc("seller_reviews")); } catch (e) { error = { message: (e as Error).message }; }
      if (!alive) return;
      // une coupure réseau passagère (veille du téléphone, changement de page…) n'efface pas les données
      // déjà affichées et le message disparaît dès que la connexion revient
      if (error) setError(error.message);
      else { setReviews((data as Review[]) || []); setError(null); }
    };
    void load();
    // nouveaux avis affichés automatiquement (toutes les 30 secondes)
    const t = window.setInterval(load, 30_000);
    const onOnline = () => void load();
    window.addEventListener("online", onOnline);
    window.addEventListener("focus", onOnline);
    return () => { alive = false; window.clearInterval(t); window.removeEventListener("online", onOnline); window.removeEventListener("focus", onOnline); };
  }, []);

  const all = reviews ?? [];
  const avg = all.length ? all.reduce((s, r) => s + r.rating, 0) / all.length : 0;
  const dist = [5, 4, 3, 2, 1].map((n) => ({ n, count: all.filter((r) => r.rating === n).length }));
  const products = useMemo(() => [...new Map(all.map((r) => [r.product_id, r.product_title])).entries()], [all]);
  const list = useMemo(() => all.filter((r) =>
    (filter === null || r.rating === filter) &&
    (!product || r.product_id === product) &&
    (!q.trim() || `${r.comment ?? ""} ${r.author}`.toLowerCase().includes(q.trim().toLowerCase()))), [all, filter, product, q]);

  return (
    <DashboardLayout title="Avis clients" subtitle="Les avis laissés par les clients sur vos produits, sur Amashia">
      <div className="mb-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="grid place-items-center rounded-2xl border border-border bg-card p-6 text-center">
          <div>
            <p className="text-5xl font-extrabold">{all.length ? avg.toFixed(1).replace(".", ",") : "—"}</p>
            <div className="my-2 flex justify-center"><Stars value={avg} size={20} /></div>
            <p className="text-sm text-muted-foreground">{num(all.length)} avis au total</p>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6 lg:col-span-2">
          <h3 className="mb-4 font-bold">Répartition des notes</h3>
          <div className="space-y-2.5">
            {dist.map(({ n, count }) => (
              <button key={n} onClick={() => setFilter(filter === n ? null : n)} className={`flex w-full items-center gap-3 rounded-lg px-2 py-1 text-sm transition ${filter === n ? "bg-primary/15" : "hover:bg-secondary/50"}`}>
                <span className="flex w-10 items-center gap-1">{n} <Star size={12} className="fill-amber-400 text-amber-400" /></span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-secondary"><span className="block h-full rounded-full bg-amber-400" style={{ width: `${all.length ? (count / all.length) * 100 : 0}%` }} /></span>
                <span className="w-8 text-right text-muted-foreground">{count}</span>
              </button>
            ))}
          </div>
          {filter !== null && <button onClick={() => setFilter(null)} className="mt-3 text-xs text-primary hover:underline">Afficher toutes les notes</button>}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 sm:p-6">
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <h3 className="mr-auto font-bold">Avis récents</h3>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher" className="rounded-xl border border-border bg-background py-2 pl-8 pr-3 text-sm" />
          </div>
          {products.length > 1 && (
            <Select value={product} onChange={(e) => setProduct(e.target.value)} className="max-w-[220px] rounded-xl border border-border bg-background px-3 py-2 text-sm">
              <option value="">Tous les produits</option>
              {products.map(([id, t]) => <option key={id} value={id}>{t}</option>)}
            </Select>
          )}
        </div>

        {error && reviews === null && <p className="py-6 text-center text-sm text-red-400">Connexion impossible pour le moment. Nouvel essai automatique dans quelques secondes…</p>}
        {reviews === null && !error && <div className="h-40 animate-pulse rounded-xl bg-secondary/40" />}
        {reviews && list.length === 0 && (
          <p className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
            <MessageSquare size={28} />
            {all.length === 0 ? "Aucun avis pour le moment. Les avis de vos clients sur Amashia apparaîtront ici." : "Aucun avis ne correspond à ces filtres."}
          </p>
        )}

        <div className="space-y-3">
          {list.map((r) => (
            <article key={r.id} className="rounded-xl border border-border p-4">
              <div className="flex gap-3">
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-white">
                  {r.product_image && <img {...imgProps(r.product_image, { width: 64 })} loading="lazy" alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-1 text-xs text-muted-foreground">{r.product_title}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2">
                    <Stars value={r.rating} />
                    <span className="text-sm font-semibold">{r.author}</span>
                    {r.verified && <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-400"><BadgeCheck size={11} /> Achat vérifié</span>}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Publié le {dateTime(r.created_at)}
                    {seenBefore !== undefined && (seenBefore === null || r.created_at > seenBefore) && (
                      <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-black">Nouveau</span>
                    )}
                  </p>
                  {r.comment && <p className="mt-2 whitespace-pre-line text-sm">{r.comment}</p>}
                  {Array.isArray(r.photos) && r.photos.length > 0 && (
                    <div className="mt-2 flex gap-2">
                      {r.photos.map((src, i) => <a key={i} href={src} target="_blank" rel="noreferrer"><img {...imgProps(src, { width: 64 })} loading="lazy" alt={`Photo ${i + 1}`} className="h-16 w-16 rounded-lg border border-border object-cover" /></a>)}
                    </div>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
