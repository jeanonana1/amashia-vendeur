import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { imgProps } from "@/lib/img";

/**
 * Section « Ils vendent sur Amashia » (maquette Claude Design « section-avis »).
 * Uniquement de vrais avis : ceux que les vendeurs laissent depuis leur espace (Paramètres › Mon avis).
 */
type Review = { name: string; city: string; category: string; rating: number; text: string; at: string; img: string | null };
type Data = { total: number; avg: number | null; dist: Record<string, number>; items: Review[] };

/** Photo d'illustration par catégorie (public/avis/<catégorie>.webp), utilisée quand la boutique n'a pas de photo. */
const CAT_IMG: Record<string, string> = {
  mode: "mode", "mode & vêtements": "mode", vêtements: "mode", "électronique": "electronique", "téléphones & tablettes": "electronique",
  "beauté": "beaute", "beauté & soins": "beaute", "beauté & cosmétiques": "beaute", maison: "maison", "maison & décoration": "maison", "maison & jardin": "maison",
  "cuisine & maison": "maison", alimentation: "alimentation", "bijoux & accessoires": "bijoux", bijoux: "bijoux", "sports & loisirs": "sport", services: "services",
};
const catImg = (c: string) => { const k = CAT_IMG[c.trim().toLowerCase()]; return k ? `/avis/${k}.webp` : null; };

const AV: [string, string][] = [["oklch(0.68 0.19 42)", "#fff"], ["oklch(0.89 0.18 95)", "#161512"], ["#e9e6df", "#161512"], ["#161512", "#fff"]];
const initials = (n: string) => n.split(/\s+/).filter(Boolean).map((x) => x[0]).join("").slice(0, 2).toUpperCase();
const fmt1 = (v: number) => v.toFixed(1).replace(".", ",");

function ago(iso: string) {
  const d = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 864e5));
  if (d < 1) return "aujourd'hui";
  if (d < 30) return `il y a ${d} j`;
  const m = Math.floor(d / 30);
  return m < 12 ? `il y a ${m} mois` : `il y a ${Math.floor(m / 12)} an${m >= 24 ? "s" : ""}`;
}

export function SellerReviews() {
  const [data, setData] = useState<Data | null>(null);
  useEffect(() => {
    void (supabase as any).rpc("seller_platform_reviews_public").then(({ data }: { data: Data | null }) =>
      setData(data ?? { total: 0, avg: null, dist: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }, items: [] }));
  }, []);
  const empty = data !== null && data.total === 0;
  return (
    <section id="avis" className="px-4 py-16 sm:px-6 md:py-24">
      <div className="avis-panel mx-auto max-w-[1240px] rounded-[2rem] px-5 py-14 sm:px-10 md:py-20">
        <div className="avis__grid">
          <div className="avis__left">
            <div className="avis__eyebrow">04 — Avis vendeurs</div>
            <h2 className="avis__title">Ils vendent <em>sur Amashia</em></h2>
            <ScoreCard data={data} />
            {empty ? (
              <p className="avis__note-legal">
                Les avis affichés ici sont laissés par de vrais vendeurs Amashia, depuis leur espace vendeur.{" "}
                <Link to="/inscription" className="font-semibold text-[var(--orange-ink)] underline-offset-2 hover:underline">Ouvrez votre boutique</Link> et partagez le vôtre.
              </p>
            ) : (
              <p className="avis__note-legal">Avis laissés par des vendeurs Amashia vérifiés, depuis leur espace vendeur.</p>
            )}
          </div>
          {data && (empty ? <EmptyDeck /> : <Deck items={data.items} />)}
          {!data && <div className="avis-deck" />}
        </div>
      </div>
    </section>
  );
}

/* ---------- Carte note : animation unique de 2,2 s au premier passage à l'écran ---------- */
function ScoreCard({ data }: { data: Data | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(0);
  const total = data?.total ?? 0;
  const avg = data?.avg ? Number(data.avg) : 0;
  useEffect(() => {
    const el = ref.current;
    if (!el || !data || total === 0) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setK(1); return; }
    let raf = 0;
    const io = new IntersectionObserver((en) => {
      if (!en[0].isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const f = (now: number) => { const v = Math.min(1, (now - t0) / 2200); setK(v); if (v < 1) raf = requestAnimationFrame(f); };
      raf = requestAnimationFrame(f);
    }, { threshold: 0.4 });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [data, total]);
  const on = total ? Math.min(5, Math.ceil(k * 5.2 * (avg / 5))) : 0;
  return (
    <div ref={ref} className="score">
      <div className="score__top">
        <span className="score__avg" style={total ? undefined : { opacity: 0.3 }}>{fmt1(total ? avg * Math.min(1, k * 1.2) : 0)}</span>
        <div className="score__meta">
          <span className="score__stars" aria-label={total ? `${fmt1(avg)} sur 5` : "Pas encore d'avis"}>{"★".repeat(on)}<span className="off">{"★".repeat(5 - on)}</span></span>
          <span className="score__count">{total ? <><span>{Math.round(total * k)}</span> avis de vendeur{total > 1 ? "s" : ""}</> : "Aucun avis pour le moment"}</span>
        </div>
      </div>
      <div className="score__rows">
        {[5, 4, 3, 2, 1].map((n, i) => {
          const c = Number(data?.dist?.[n] ?? 0);
          const t = Math.max(0, Math.min(1, (k - i * 0.1) / 0.6)), e = 1 - Math.pow(1 - t, 3);
          return (
            <div key={n} className="score__row">
              <span className="lbl">{n} ★</span>
              <div className="score__bar"><i style={{ width: `${total ? (c / total) * 100 * e : 0}%` }} /></div>
              <span className="num">{Math.round(c * e)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Carrousel : cartes empilées, animation deck en boucle ---------- */
function Deck({ items }: { items: Review[] }) {
  // l'animation est prévue pour 10 cartes (40 s) ; avec moins d'avis, on répète la liste
  const list = items.length ? Array.from({ length: 10 }, (_, i) => items[i % items.length]) : [];
  const single = items.length === 1;
  return (
    <div className="avis-deck">
      {(single ? list.slice(0, 1) : list).map((r, i) => {
        const [bg, fg] = AV[(i * 3) % 4];
        return (
          <article key={i} className={`avis-card ${single ? "avis-card--still" : ""}`} style={{ animationDelay: `${-4 * i}s` }} aria-hidden={i >= items.length || undefined}>
            <div className="avis-card__media">
              {r.img
                ? <img {...imgProps(r.img, { width: 640 })} alt={`Boutique de ${r.name}${r.category ? `, vendeur ${r.category.toLowerCase()}` : ""}${r.city ? ` à ${r.city}` : ""}`} loading="lazy" width={800} height={600} />
                : catImg(r.category) && <img src={catImg(r.category)!} alt="" loading="lazy" width={800} height={600} onError={(e) => { e.currentTarget.style.display = "none"; }} />}
              {r.category && <span className="avis-card__cat">{r.category.toUpperCase()}</span>}
            </div>
            <div className="avis-card__body">
              <span className="avis-card__stars" aria-label={`${r.rating} sur 5`}>{"★".repeat(r.rating)}<span className="off">{"★".repeat(5 - r.rating)}</span></span>
              <p className="avis-card__text">« {r.text} »</p>
              <div className="avis-card__who">
                <div className="avis-card__av" style={{ background: bg, color: fg }}>{initials(r.name)}</div>
                <div className="min-w-0"><div className="avis-card__name" translate="no">{r.name} <span>✓</span></div><div className="avis-card__city">{[r.city, ago(r.at)].filter(Boolean).join(" · ")}</div></div>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

/** Aucun avis encore : même pile animée, mais une invitation à laisser le premier avis (aucun faux témoignage). */
function EmptyDeck() {
  const cats = ["Mode", "Électronique", "Beauté", "Maison", "Alimentation"];
  return (
    <div className="avis-deck">
      {Array.from({ length: 10 }, (_, i) => (
        <article key={i} className="avis-card" style={{ animationDelay: `${-4 * i}s` }} aria-hidden={i > 0 || undefined}>
          <div className="avis-card__media">
            <div className="absolute inset-0 grid place-items-center text-[44px] text-[#d9d5cc]">★</div>
            {catImg(cats[i % cats.length]) && <img src={catImg(cats[i % cats.length])!} alt="" loading="lazy" width={800} height={600} onError={(e) => { e.currentTarget.style.display = "none"; }} />}
            <span className="avis-card__cat">{cats[i % cats.length].toUpperCase()}</span>
          </div>
          <div className="avis-card__body">
            <span className="avis-card__stars"><span className="off">★★★★★</span></span>
            <p className="avis-card__text">Votre avis apparaîtra ici. Les vendeurs Amashia partagent leur expérience depuis leur espace vendeur.</p>
            <div className="avis-card__who">
              <div className="avis-card__av" style={{ background: AV[(i * 3) % 4][0], color: AV[(i * 3) % 4][1] }}>?</div>
              <div><div className="avis-card__name">Votre boutique</div><div className="avis-card__city">Yaoundé ou Douala</div></div>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
