import { Bike, Bell, Sparkles, Smartphone, ShieldCheck, Truck, Wallet, BadgeCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Backdrop, Container, Eyebrow, GhostCta, PrimaryCta } from "@/components/seller/site/ui";

/** Page d'accueil — en-tête : promesse + maquette animée de l'espace vendeur. */
export function Hero() {
  return (
    <section className="relative isolate overflow-hidden pb-10 pt-12 md:pt-20">
      <Backdrop />
      <Container>
        <div className="mx-auto max-w-4xl text-center animate-rise">
          <Eyebrow>La plateforme des vendeurs Amashia · Cameroun</Eyebrow>
          <h1 className="mt-6 text-balance text-[2.6rem] font-extrabold leading-[1.02] sm:text-6xl md:text-7xl">
            Vendez partout au Cameroun.
            <br className="hidden sm:block" /> <span className="text-gradient">On s'occupe du reste.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-xl">
            Publiez vos produits en quelques minutes, recevez vos commandes en temps réel. Le paiement et la livraison sont gérés par Amashia, de votre boutique jusqu'au client.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <PrimaryCta className="w-full sm:w-auto">Créer ma boutique gratuitement</PrimaryCta>
            <GhostCta to="/comment-ca-marche" className="w-full sm:w-auto">Voir comment ça marche</GhostCta>
          </div>
          <ul className="mx-auto mt-8 flex max-w-2xl flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            {["Inscription gratuite", "Commission seulement sur les ventes", "Paiement à la livraison et Mobile Money"].map((t) => (
              <li key={t} className="flex items-center gap-1.5"><BadgeCheck size={16} className="text-primary" />{t}</li>
            ))}
          </ul>
        </div>
        <ProductMock />
      </Container>
      <PartnerMarquee />
    </section>
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
          <div className="mx-auto hidden rounded-full bg-secondary px-4 py-1 text-[11px] text-muted-foreground sm:block">amashia-vendeur.vercel.app/dashboard</div>
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

      {/* bulles flottantes */}
      <FloatCard className="-left-1 -top-6 sm:left-[-2.5rem] sm:top-24" delay={0.9} dur={5} icon={<Bell size={16} />} tone="bg-primary text-black" title="Nouvelle commande" text="Sonnerie dans votre espace" />
      <FloatCard className="hidden sm:flex sm:right-[-2.5rem] sm:top-40" delay={1.3} dur={6} icon={<Bike size={16} />} tone="bg-sky-500 text-white" title="Livreur Prime en route" text="Récupération chez vous" />
      <FloatCard className="bottom-[-1.5rem] left-1/2 -translate-x-1/2 sm:left-[16%] sm:translate-x-0" delay={1.7} dur={5.5} icon={<Wallet size={16} />} tone="bg-emerald-500 text-white" title="Commande livrée" text="Le montant passe dans votre solde" />
      <p className="mt-24 text-center text-[11px] text-muted-foreground sm:mt-16">Illustration de l'espace vendeur (exemple)</p>
    </div>
  );
}

/* Trois séries d'exemple : le graphique « bascule » de l'une à l'autre à chaque cycle. */
const SERIES = [
  { label: "Cette semaine", days: ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"], h: [34, 52, 46, 68, 61, 88, 79] },
  { label: "Semaine dernière", days: ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"], h: [28, 41, 57, 50, 72, 66, 94] },
  { label: "Il y a 2 semaines", days: ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"], h: [45, 39, 63, 58, 77, 92, 84] },
];
const PER_POINT = 2500; // 1 % de hauteur = 2 500 FCFA (exemple)
const fmt = (n: number) => Math.round(n).toLocaleString("fr-FR");

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
    <div className="p-4 sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 text-left">
          <p className="text-[11px] text-muted-foreground">Bonjour 👋</p>
          <p className="truncate text-base font-bold sm:text-lg">Vos ventes · <span key={set} className="tick-flip inline-block text-primary">{serie.label}</span></p>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-500/12 px-2.5 py-1 text-[11px] font-semibold text-emerald-500"><span className="relative flex h-2 w-2"><span className="animate-ping-soft absolute inline-flex h-full w-full rounded-full bg-emerald-500" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" /></span>En direct</span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
        {[
          { l: "Ventes", v: total >= 1e6 ? `${(total / 1e6).toFixed(2).replace(".", ",")} M` : fmt(total), unit: "FCFA", c: "text-primary" },
          { l: "Commandes", v: fmt(orders), unit: "", c: "text-emerald-500" },
          { l: "Visiteurs", v: fmt(visitors), unit: "", c: "text-sky-400" },
        ].map((k) => (
          <div key={k.l} className="min-w-0 rounded-xl border border-border bg-[var(--surface-2)] p-2.5 text-left sm:p-3">
            <p className="text-[10px] text-muted-foreground sm:text-[11px]">{k.l}</p>
            <p className={`hero-num mt-1 truncate text-sm font-extrabold tabular-nums sm:text-lg ${k.c}`}>{k.v}{k.unit && <span className="ml-0.5 align-super text-[8px] sm:text-[9px]">{k.unit}</span>}</p>
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

function FloatCard({ className, delay, dur, icon, tone, title, text }: { className: string; delay: number; dur: number; icon: React.ReactNode; tone: string; title: string; text: string }) {
  return (
    <div className={`absolute z-20 ${className.includes("hidden") ? "" : "flex"} ${className}`}>
      <div className="animate-pop" style={{ animationDelay: `${delay}s` }}>
        <div className="animate-bob flex items-center gap-2.5 rounded-2xl border border-border bg-card/95 px-3 py-2.5 shadow-card backdrop-blur sm:gap-3 sm:px-3.5 sm:py-3" style={{ animationDuration: `${dur}s`, animationDelay: `${delay}s` }}>
          <span className={`relative grid h-8 w-8 place-items-center rounded-xl sm:h-9 sm:w-9 ${tone}`}>
            <span className={`animate-ping-soft absolute inset-0 rounded-xl ${tone} opacity-60`} style={{ animationDelay: `${delay}s` }} />
            <span className="relative">{icon}</span>
          </span>
          <div className="text-left">
            <p className="text-[12px] font-bold leading-tight sm:text-[13px]">{title}</p>
            <p className="hidden text-[11px] text-muted-foreground sm:block">{text}</p>
          </div>
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
