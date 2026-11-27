import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { imgProps } from "@/lib/img";
import { HomePhoto, useHasHomeImage } from "@/components/seller/site/homeImages";

/**
 * Section « Ils vendent sur Amachia » (maquette Claude Design « section-avis »).
 * Uniquement de vrais avis : ceux que les vendeurs laissent depuis leur espace (Paramètres › Mon avis).
 */
type Review = { name: string; collected?: boolean; shop?: string; logo?: string | null; city: string; category: string; rating: number; text: string; at: string; img: string | null };
type Data = { total: number; avg: number | null; dist: Record<string, number>; items: Review[] };

const AV: [string, string][] = [["oklch(0.68 0.19 42)", "#fff"], ["oklch(0.89 0.18 95)", "#161512"], ["#e9e6df", "#161512"], ["#161512", "#fff"]];
/** Initiale du prénom (Jean → J) quand la boutique n'a pas de logo */
const initials = (n: string) => n.trim().split(/\s+/).slice(0, 2).map((w) => w[0] ?? "").join("").toUpperCase() || "A";
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
  // vidéo choisie dans l'admin : elle remplace la pile de cartes, les vrais avis passent en dessous
  const hasPhoto = useHasHomeImage("avis");
  const [video, setVideo] = useState<{ url?: string; poster?: string | null } | null>(null);
  useEffect(() => {
    void (supabase as any).rpc("seller_home_video").then(({ data }: { data: { url?: string } | null }) => setVideo(data ?? {}));
  }, []);
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
            <h2 className="avis__title">Ils vendent <em>sur Amachia</em></h2>
            <ScoreCard data={data} />
            {empty ? (
              <p className="avis__note-legal">
                Les avis affichés ici sont laissés par de vrais vendeurs Amachia, depuis leur espace vendeur.{" "}
                <Link to="/inscription" className="font-semibold text-[var(--orange-ink)] underline-offset-2 hover:underline">Ouvrez votre boutique</Link> et partagez le vôtre.
              </p>
            ) : (
              <p className="avis__note-legal">Avis de vendeurs Amachia vérifiés, laissés depuis leur espace vendeur ou recueillis par l'équipe Amachia avec leur accord.</p>
            )}
          </div>
          {/* en face de la note : le cadre vidéo (lecture automatique en boucle, vidéo choisie dans l'admin) */}
          {!video?.url && hasPhoto
            ? <HomePhoto slot="avis" width={640} sizes="(min-width: 1024px) 480px, 100vw" shade={false} className="avis-video mx-auto aspect-[4/5] w-full max-w-[480px] rounded-[1.6rem]" />
            : <ReviewsVideo url={video?.url} poster={video?.poster ?? undefined} />}
        </div>
        {/* les vrais avis des vendeurs : un cadre par avis, sans image */}
        {data && data.items.length > 0 && (data.items.length >= 5 ? (
          /* à partir de 5 avis : défilement horizontal automatique et continu (pause au survol) */
          <div className="avis-marquee" aria-label="Avis des vendeurs">
            <div className="avis-marquee__track" style={{ animationDuration: `${data.items.length * 7}s` }}>
              {[...data.items, ...data.items].map((r, i) => <ReviewTextCard key={i} r={r} i={i % data.items.length} hidden={i >= data.items.length} />)}
            </div>
          </div>
        ) : (
          <div className="avis-list">
            {data.items.map((r, i) => <ReviewTextCard key={i} r={r} i={i} />)}
          </div>
        ))}
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

/** Carte d'un vrai avis : étoiles, texte de l'avis, photo de profil (logo de la boutique) ou initiales, nom, boutique, ville. */
function ReviewTextCard({ r, i, hidden }: { r: Review; i: number; hidden?: boolean }) {
  const [bg, fg] = AV[(i * 3) % 4];
  return (
    <article className="avis-quote" aria-hidden={hidden || undefined}>
      <span className="avis-quote__mark" aria-hidden>“</span>
      <span className="avis-card__stars" aria-label={`${r.rating} sur 5`}>{"★".repeat(r.rating)}<span className="off">{"★".repeat(5 - r.rating)}</span></span>
      <p className="avis-quote__text">{r.text}</p>
      <div className="avis-card__who avis-quote__who">
        {r.logo
          ? <img {...imgProps(r.logo, { width: 96 })} alt={r.shop || r.name} className="avis-quote__av object-cover" loading="lazy" />
          : <div className="avis-quote__av" style={{ background: bg, color: fg }}>{initials(r.name)}</div>}
        <div className="min-w-0">
          <div className="avis-card__name" translate="no">{r.name} <span>✓</span></div>
          {r.shop && <div className="avis-card__city font-semibold !text-[#2a2722]" translate="no">{r.shop}</div>}
          <div className="avis-card__city">{[r.city, ago(r.at), r.collected ? "recueilli par Amachia" : ""].filter(Boolean).join(" · ")}</div>
        </div>
      </div>
    </article>
  );
}

/** Cadre vidéo de la section avis : lecture automatique, en boucle, sans son (condition des navigateurs pour l'autoplay).
 *  Tant qu'aucune vidéo n'est ajoutée dans l'admin, le cadre reste en place avec un fond sobre. */
function ReviewsVideo({ url, poster }: { url?: string; poster?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  // le cadre prend les proportions exactes de la vidéo (carrée, verticale ou horizontale) : rien n'est écrasé ni coupé
  const [ratio, setRatio] = useState<number | null>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v || !url) return;
    const play = () => { void v.play().catch(() => {}); };
    play();
    // relance si le navigateur met la vidéo en pause (retour sur l'onglet, économie d'énergie)
    const onVis = () => { if (document.visibilityState === "visible") play(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [url]);
  return (
    <div className={`avis-video ${url ? "avis-video--fit" : "avis-video--empty"}`} style={ratio ? { aspectRatio: String(ratio), maxWidth: `min(560px, ${Math.round(80 * ratio)}vh)` } : undefined}>
      {url ? (
        <video ref={ref} src={url} poster={poster} autoPlay muted loop playsInline preload="auto" controls={false} disablePictureInPicture aria-label="Vidéo : ils vendent sur Amachia" onLoadedMetadata={(e) => { const v = e.currentTarget; if (v.videoWidth && v.videoHeight) setRatio(v.videoWidth / v.videoHeight); }} onEnded={(e) => { e.currentTarget.currentTime = 0; void e.currentTarget.play().catch(() => {}); }} />
      ) : (
        <div className="avis-video__placeholder" aria-hidden>
          <span className="avis-video__play"><svg viewBox="0 0 24 24" width="30" height="30"><path d="M8 5.5v13l11-6.5z" fill="currentColor" /></svg></span>
        </div>
      )}
    </div>
  );
}
