import { Sparkles } from "lucide-react";
import { IconLivreurMoto as Bike, IconNotifications as Bell, IconMobileMoney as Smartphone, IconPaiementSecurise as ShieldCheck, IconLivraison as Truck, IconPortefeuille as Wallet, IconVerifie as BadgeCheck } from "@/components/icons/AmachiaIcons";
import { useEffect, useRef, useState } from "react";
import { Backdrop, Container, Eyebrow, GhostCta, PrimaryCta } from "@/components/seller/site/ui";
import { HomePhoto, useHasHomeImage, useHomeImages, useHomePreview, type HomeImageSlot } from "@/components/seller/site/homeImages";
import type React from "react";

/** Page d'accueil — en-tête : promesse + photo (si choisie dans l'admin) ou maquette animée de l'espace vendeur. */
export function Hero() {
  // carrousel dès qu'au moins une des 3 photos d'en-tête est choisie
  const h1 = useHasHomeImage("hero"), h2 = useHasHomeImage("hero2"), h3 = useHasHomeImage("hero3");
  const photo = h1 || h2 || h3;
  return (
    <section className="relative isolate overflow-hidden pb-10 pt-12 md:pt-20">
      <Backdrop />
      <Container>
        {photo ? <HeroSplit /> : (
          <>
            <div className="mx-auto max-w-4xl text-center animate-rise">
              <Eyebrow>La plateforme des vendeurs Amachia · Cameroun</Eyebrow>
              <h1 className="mt-6 font-extrabold leading-[1.05]">
                <span className="block text-balance text-[clamp(2.2rem,10vw,3.4rem)] sm:whitespace-nowrap sm:text-[clamp(2rem,5.8vw,3.5rem)]">Vendez partout au Cameroun.</span>
                <span className="mt-1 block text-balance text-[clamp(2.2rem,10vw,3.4rem)] text-gradient sm:text-[clamp(2rem,5.8vw,3.5rem)]">On s'occupe du reste.</span>
              </h1>
              <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-xl">{PITCH}</p>
              <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"><HeroCtas /></div>
              <HeroTicks className="mx-auto mt-8 justify-center" />
            </div>
            <ProductMock />
          </>
        )}
      </Container>
      <PartnerMarquee />
    </section>
  );
}

const PITCH = "Publiez vos produits en quelques minutes, recevez vos commandes en temps réel. Le paiement et la livraison sont gérés par Amachia, de votre boutique jusqu'au client.";

function HeroCtas() {
  return (
    <>
      <PrimaryCta className="w-full sm:w-auto">Créer ma boutique gratuitement</PrimaryCta>
      <GhostCta to="/comment-ca-marche" className="w-full sm:w-auto">Voir comment ça marche</GhostCta>
    </>
  );
}

function HeroTicks({ className = "" }: { className?: string }) {
  return (
    <ul className={`flex max-w-2xl flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground ${className}`}>
      {["Inscription gratuite", "Commission seulement sur les ventes", "Paiement à la livraison et Mobile Money"].map((t) => (
        <li key={t} className="flex items-center gap-1.5"><BadgeCheck size={16} className="text-primary" />{t}</li>
      ))}
    </ul>
  );
}

/**
 * En-tête avec photo : texte à gauche, photo en portrait à droite (sur mobile : texte puis photo),
 * entourée de petites notifications animées qui racontent le parcours d'une vente (illustration).
 */
function HeroSplit() {
  return (
    <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10">
      <div className="text-center animate-rise lg:text-left">
        <Eyebrow>La plateforme des vendeurs Amachia · Cameroun</Eyebrow>
        <h1 className="mt-6 text-[clamp(2.2rem,9vw,3.1rem)] font-extrabold leading-[1.06] lg:text-[clamp(2.4rem,3.7vw,3.5rem)]">
          <span className="block text-balance">Vendez partout au Cameroun.</span>
          <span className="mt-1 block text-balance text-gradient">On s'occupe du reste.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg lg:mx-0">{PITCH}</p>
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start"><HeroCtas /></div>
        <HeroTicks className="mx-auto mt-7 justify-center lg:mx-0 lg:justify-start" />
      </div>

      <div className="relative mx-auto w-full max-w-[460px] animate-rise lg:max-w-none" style={{ animationDelay: "0.12s" }}>
        {/* halo orange derrière la photo */}
        <div aria-hidden className="glow-orb absolute -inset-8 -z-10 opacity-80" />
        <HeroDeck />

        {/* notifications (illustration) */}
      </div>
    </div>
  );
}

/**
 * Carrousel de l'en-tête : jusqu'à 3 photos en cartes empilées (la carte du dessus passe derrière toutes les 5 s).
 * Pause au survol ; arrêt du défilement si l'utilisateur préfère réduire les animations. Les photos sont servies
 * en qualité maximale (fichier d'origine).
 */
const DECK: HomeImageSlot[] = ["hero", "hero2", "hero3"];
function HeroDeck() {
  const imgs = useHomeImages();
  const preview = useHomePreview();
  const slides = DECK.filter((s) => imgs[s]?.url || preview);
  const n = slides.length;
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (n < 2 || paused) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = window.setInterval(() => setIdx((i) => (i + 1) % n), 4200);
    return () => window.clearInterval(t);
  }, [n, paused, idx]);
  // balayage au doigt (mobile) : carte suivante / précédente
  const touchX = useRef<number | null>(null);
  const go = (d: number) => n > 1 && setIdx((i) => (i + d + n) % n);
  // position de chaque carte : 0 = dessus ; les suivantes dépassent UNIQUEMENT à droite (pas en haut, en bas ni à gauche)
  // seule la photo principale est visible ; les suivantes restent cachées (floues et transparentes) jusqu'à leur tour
  // pile de cartes : les 2 suivantes dépassent à droite, mais leur photo est masquée (voile blanc dépoli)
  const pose = ["z-30 translate-x-0 scale-100",
    "z-20 translate-x-[6%] scale-[.94]",
    "z-10 translate-x-[11%] scale-[.88]"];
  return (
    <div className="relative isolate" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      onTouchStart={(e) => { touchX.current = e.touches[0].clientX; setPaused(true); }}
      onTouchEnd={(e) => { const x0 = touchX.current; touchX.current = null; setPaused(false); if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1); }}>
      {/* léger zoom continu sur la photo affichée (effet vivant) */}
      <style>{`.deck-live img{animation:deck-zoom 1.1s cubic-bezier(.22,1,.36,1) both}@keyframes deck-zoom{from{transform:scale(1.12)}to{transform:scale(1)}}@media (prefers-reduced-motion:reduce){.deck-live img{animation:none}}`}</style>
      <div className="relative aspect-[4/5] w-full">
        {slides.map((slot, i) => {
          const rel = (i - idx + n) % n;
          return (
            <div key={slot} aria-hidden={rel !== 0}
              className={`absolute inset-0 origin-right transition-transform ${rel === 0 ? "deck-live" : ""} duration-[800ms] ease-[cubic-bezier(.22,1,.36,1)] will-change-transform ${pose[Math.min(rel, 2)]}`}>
              <HomePhoto slot={slot} priority={i === 0} original shade={false}
                className="h-full w-full overflow-hidden rounded-[2rem] border border-border shadow-[0_30px_60px_-25px_rgba(0,0,0,.7)] [&_img]:object-[45%_25%]">
                <div aria-hidden className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/55 to-transparent" />
                {/* cartes en attente : photo cachée par un voile blanc dépoli ; il disparaît quand la carte passe devant */}
                <div aria-hidden className={`absolute inset-0 bg-white/85 backdrop-blur-2xl transition-opacity duration-500 ${rel === 0 ? "opacity-0" : "opacity-100"}`} />
              </HomePhoto>
            </div>
          );
        })}
      </div>
      {n > 1 && (
        <div className="mt-6 flex justify-center gap-2">
          {slides.map((s, i) => (
            <button key={s} type="button" onClick={() => setIdx(i)} aria-label={`Photo ${i + 1} sur ${n}`}
              className={`h-2 rounded-full transition-all duration-500 ${i === idx ? "w-7 bg-primary" : "w-2 bg-foreground/25 hover:bg-foreground/40"}`} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Maquette (illustration) de l'espace vendeur : le graphique des ventes s'anime en boucle. */
function ProductMock() {
  return (
    <div className="relative mx-auto mt-16 max-w-5xl animate-rise" style={{ animationDelay: "0.15s" }}>
      <div className="glow-orb absolute -inset-x-10 -top-10 bottom-0 -z-10 opacity-70" />
      <div className="ring-gradient relative overflow-hidden rounded-[1.6rem] border border-border bg-card shadow-card">
        {/* barre de fenêtre */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <span className="h-3 w-3 rounded-full bg-[#ff5f57]" /><span className="h-3 w-3 rounded-full bg-[#febc2e]" /><span className="h-3 w-3 rounded-full bg-[#28c840]" />
          <div className="mx-auto hidden rounded-full bg-secondary px-4 py-1 text-[11px] text-muted-foreground sm:block">seller.amachia.com/dashboard</div>
        </div>
        <div className="grid md:grid-cols-[200px_1fr]">
          <aside className="hidden border-r border-border p-4 md:block">
            {["Aperçu", "Produits", "Commandes", "Livraison", "Paiements", "Analytique", "Promotions"].map((n, i) => (
              <div key={n} className={`mb-1 rounded-lg px-3 py-2 text-xs animate-rise ${i === 0 ? "bg-primary/12 font-semibold text-primary" : "text-muted-foreground"}`} style={{ animationDelay: `${0.3 + i * 0.06}s` }}>{n}</div>
            ))}
          </aside>
          <LiveChart />
        </div>
      </div>

      <p className="mt-5 text-center text-[11px] text-muted-foreground">Illustration de l'espace vendeur (exemple)</p>
    </div>
  );
}

/* Trois séries d'exemple : le graphique « bascule » de l'une à l'autre à chaque cycle. */
const SERIES = [
  { label: "Cette semaine", days: ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"], h: [34, 52, 46, 68, 61, 88, 79] },
  { label: "Sem. dernière", days: ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"], h: [28, 41, 57, 50, 72, 66, 94] },
  { label: "Il y a 2 sem.", days: ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"], h: [45, 39, 63, 58, 77, 92, 84] },
];
const PER_POINT = 2500; // 1 % de hauteur = 2 500 FCFA (exemple)
const fmt = (n: number) => Math.round(n).toLocaleString("fr-FR");
/** Montant court et de largeur stable : 0, 85 K, 500 K, 1,07 M… */
const compactFcfa = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2).replace(".", ",")} M` : n >= 1000 ? `${Math.round(n / 1000)} K` : fmt(n));

function LiveChart() {
  const [set, setSet] = useState(0);
  const [step, setStep] = useState(0); // nombre de barres déjà montées
  const n = SERIES[0].h.length;
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setStep(n); return; }
    const t = window.setInterval(() => {
      setStep((s) => {
        if (s >= n + 5) { setSet((k) => (k + 1) % SERIES.length); return 0; }
        return s + 1;
      });
    }, 650);
    return () => window.clearInterval(t);
  }, [n]);
  const serie = SERIES[set];
  const reached = serie.h.slice(0, Math.min(step, n));
  const total = reached.reduce((a, b) => a + b, 0) * PER_POINT;
  const orders = reached.reduce((a, b) => a + Math.round(b / 9), 0);
  const visitors = reached.reduce((a, b) => a + b * 6, 0);
  const done = step >= n;
  const maxI = serie.h.indexOf(Math.max(...serie.h));
  const bubbleI = done ? maxI : step - 1;
  // tracé de la courbe qui relie le sommet des barres atteintes
  const pts = reached.map((h, i) => `${((i + 0.5) / n) * 100},${100 - h}`).join(" ");

  return (
    <div className="p-4 max-[339px]:p-3 sm:p-6" style={{ contain: "layout" }}>
      {/* dimensions fixes : rien ne bouge pendant l'animation */}
      <div className="flex h-11 items-center justify-between gap-2 sm:h-12">
        <div className="min-w-0 text-left">
          <p className="h-4 text-[11px] leading-4 text-muted-foreground">Bonjour 👋</p>
          <p className="h-6 whitespace-nowrap text-[clamp(12.5px,4vw,15px)] font-bold leading-6 sm:h-7 sm:text-lg sm:leading-7">Vos ventes · <span key={set} className="tick-flip inline-block text-primary">{serie.label}</span></p>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-500/12 px-2 py-1 text-[10px] font-semibold text-emerald-500 sm:px-2.5 sm:text-[11px]"><span className="relative flex h-2 w-2"><span className="animate-ping-soft absolute inline-flex h-full w-full rounded-full bg-emerald-500" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" /></span><span className="max-[339px]:hidden">En direct</span></span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
        {[
          { l: "Ventes", v: compactFcfa(total), unit: "FCFA", c: "text-primary" },
          { l: "Commandes", v: fmt(orders), unit: "", c: "text-emerald-500" },
          { l: "Visiteurs", v: fmt(visitors), unit: "", c: "text-sky-400" },
        ].map((k) => (
          <div key={k.l} className="h-[66px] min-w-0 overflow-hidden rounded-xl border border-border bg-[var(--surface-2)] p-2.5 text-left max-[339px]:p-2 sm:h-[78px] sm:p-3">
            <p className="text-[10px] text-muted-foreground sm:text-[11px]">{k.l}</p>
            <p className={`hero-num mt-1 h-6 whitespace-nowrap text-[clamp(12.5px,3.9vw,15px)] font-extrabold leading-6 tabular-nums sm:h-7 sm:text-lg sm:leading-7 ${k.c}`}>{k.v}{k.unit && <span className="ml-0.5 hidden align-super text-[8px] min-[400px]:inline sm:text-[9px]">{k.unit}</span>}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-xl border border-border bg-[var(--surface-2)] px-3 pb-2 pt-10 sm:px-4 sm:pt-12">
        <div className="relative" style={{ height: 150 }}>
          {/* graduations */}
          {[25, 50, 75].map((g) => <div key={g} className="absolute inset-x-0 border-t border-dashed border-border/70" style={{ bottom: `${g}%` }} />)}
          <div className="absolute inset-0 flex items-end gap-1.5 sm:gap-2.5">
            {serie.h.map((h, i) => {
              const up = i < step;
              const isBubble = i === bubbleI && step > 0;
              return (
                <div key={i} className="relative flex h-full flex-1 items-end">
                  <div className={`hero-bar w-full rounded-t-md ${up ? (done && i === maxI ? "bg-primary" : "bg-gradient-to-t from-primary/30 to-primary/85") : "bg-primary/10"}`} style={{ height: up ? `${h}%` : "3%" }} />
                  {isBubble && (
                    <div key={`${set}-${i}-${done}`} className="hero-bubble pointer-events-none absolute left-1/2 z-10 whitespace-nowrap rounded-lg bg-foreground px-1.5 py-1 text-[9px] font-bold text-background shadow-lg sm:px-2 sm:text-[11px]" style={{ bottom: `calc(${h}% + 8px)` }}>
                      {done ? "🏆 " : "+"}{fmt(h * PER_POINT)} <span className="text-[8px] opacity-70 sm:text-[9px]">FCFA</span>
                      <span className="absolute left-1/2 top-full -translate-x-1/2 border-x-4 border-t-4 border-x-transparent border-t-foreground" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {/* courbe des visites */}
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
            {reached.length > 1 && <polyline points={pts} fill="none" stroke="oklch(0.75 0.13 230)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />}
            {reached.map((h, i) => <circle key={i} cx={((i + 0.5) / n) * 100} cy={100 - h} r="1.4" fill="oklch(0.75 0.13 230)" vectorEffect="non-scaling-stroke" />)}
          </svg>
        </div>
        <div className="mt-2 flex gap-1.5 text-center text-[9px] text-muted-foreground sm:gap-2.5 sm:text-[10px]">
          {serie.days.map((d, i) => <span key={d} className={`flex-1 ${i < step ? "text-foreground" : ""}`}>{d}</span>)}
        </div>
      </div>
    </div>
  );
}


/** Bandeau défilant : moyens de paiement et services inclus. */
function PartnerMarquee() {
  const items = [
    { i: <Smartphone size={16} />, t: "Orange Money" }, { i: <Smartphone size={16} />, t: "MTN Mobile Money" }, { i: <Wallet size={16} />, t: "Paiement à la livraison" },
    { i: <ShieldCheck size={16} />, t: "Carte bancaire" }, { i: <Bike size={16} />, t: "Livraison Prime" }, { i: <Truck size={16} />, t: "Expédition par agence" },
    { i: <Sparkles size={16} />, t: "Fiches produits par IA" }, { i: <Bell size={16} />, t: "Commandes en temps réel" },
  ];
  return (
    <div className="relative mt-20 overflow-hidden border-y border-border py-5 [mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)]">
      <div className="animate-marquee flex w-max gap-10 pr-10">
        {[...items, ...items].map((x, k) => (
          <span key={k} className="flex shrink-0 items-center gap-2 text-sm font-semibold text-muted-foreground"><span className="text-primary">{x.i}</span>{x.t}</span>
        ))}
      </div>
    </div>
  );
}
