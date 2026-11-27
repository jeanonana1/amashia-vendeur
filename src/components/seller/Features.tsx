import { Sparkles, Bell, Bike, Wallet, BarChart3, Zap, Megaphone, RotateCcw, Star, Check, Banknote, Smartphone, CreditCard, Lock, User } from "lucide-react";
import { useEffect, useState } from "react";
import { Container, SectionHeading } from "@/components/seller/site/ui";
import { Reveal } from "@/components/seller/site/motion";
import { preferredLang } from "@/lib/sellerLang";
import { HomePhoto } from "@/components/seller/site/homeImages";

/** Grille « bento » des fonctionnalités, avec mini-interfaces illustratives. */
export function Features() {
  return (
    <section id="fonctionnalites" className="relative py-24 md:py-32">
      <Container>
        <Reveal variant="blur"><SectionHeading eyebrow="Tout-en-un" title={<>Une boutique complète, <span className="text-gradient">sans la complexité</span></>}
          text="De la fiche produit à l'argent dans votre solde : chaque étape est pensée pour vendre plus, depuis votre téléphone." /></Reveal>
        <div className="stagger mt-16 grid auto-rows-[minmax(0,auto)] gap-4 md:grid-cols-6">
          <Tile className="md:col-span-4" icon={<Sparkles size={18} />} title="Des fiches produits qui vendent, rédigées par l'IA"
            text="Titre, description, caractéristiques et mots-clés recherchés au Cameroun : l'assistant rédige à partir de vos informations. Vous pouvez aussi générer des photos de présentation.">
            <AiWriter />
          </Tile>
          <Tile className="md:col-span-2" icon={<Bell size={18} />} title="Commandes en temps réel" text="Une sonnerie et une notification à chaque commande, même navigateur fermé.">
            <div className="mt-6 space-y-2">
              {["Nouvelle commande", "En préparation", "En cours de livraison"].map((t, i) => (
                <div key={t} className="notif-in flex items-center gap-2.5 rounded-xl border border-border bg-[var(--surface-2)] px-3 py-2.5 text-left text-xs" style={{ animationDelay: `${i * 0.5}s` }}>
                  <span className={`h-2 w-2 rounded-full ${i === 0 ? "bg-primary" : i === 1 ? "bg-sky-400" : "bg-emerald-500"}`} />
                  <span className="font-semibold">{t}</span>
                </div>
              ))}
            </div>
          </Tile>
          <Tile className="md:col-span-2" icon={<Bike size={18} />} title="Livraison Prime" text="Amachia envoie un livreur proche de votre boutique : il récupère le colis et le livre au client. Ailleurs, expédition par agence.">
            <HomePhoto slot="prime" width={640} sizes="(min-width: 768px) 33vw, 100vw" className="mt-5 aspect-[16/9] rounded-xl" />
            <div className="mt-7 px-4">
              {/* le trait et le livreur avancent ensemble (même animation, même durée) */}
              <div className="relative h-1.5 rounded-full bg-secondary">
                <div className="ride-fill absolute inset-y-0 left-0 rounded-full bg-primary" />
                {[0, 50, 100].map((x) => <span key={x} className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-primary/60" style={{ left: `${x}%` }} />)}
                <span className="ride absolute top-1/2 grid h-8 w-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-primary text-black shadow-[0_6px_20px_-6px_var(--primary)]"><Bike size={15} /></span>
              </div>
              <div className="relative mt-4 h-4 text-[11px] font-semibold text-muted-foreground">
                <span className="absolute left-0 -translate-x-1/2">Amachia</span>
                <span className="absolute left-1/2 -translate-x-1/2">Boutique</span>
                <span className="absolute left-full flex -translate-x-1/2 items-center gap-1">Client <Check size={12} className="text-emerald-500" /></span>
              </div>
            </div>
          </Tile>
          <Tile className="md:col-span-2" icon={<Wallet size={18} />} title="Encaissement sécurisé" text="Paiement à la livraison, Orange Money, MTN MoMo ou carte : Amachia encaisse, vous suivez votre solde en direct.">
            <PaymentFlow />
          </Tile>
          <Tile className="md:col-span-2" icon={<BarChart3 size={18} />} title="Analytique claire" text="Ventes, visiteurs en direct, taux de conversion et sources de trafic (Facebook, TikTok…).">
            <Reveal variant="up" className="mt-6"><div className="flex h-16 items-end gap-1.5">{[30, 45, 38, 60, 52, 75, 90].map((h, i) => <div key={i} className="grow-y flex-1 rounded-t bg-primary/70" style={{ height: `${h}%`, transitionDelay: `${300 + i * 90}ms` }} />)}</div></Reveal>
          </Tile>
          <Tile className="md:col-span-3" icon={<Zap size={18} />} title="Ventes flash et coupons" text="Créez une vente flash avec compte à rebours ou un code promo réservé à vos articles, en deux clics." >
            <div className="mt-6 flex gap-2">
              <Countdown />
            </div>
          </Tile>
          <Tile className="md:col-span-3" icon={<Megaphone size={18} />} title="Sponsoring" text="Mettez vos produits en avant sur Amachia et mesurez les vues, clics et ventes de chaque campagne." >
            <div className="mt-6 grid grid-cols-3 gap-2 text-center">
              {["Vues", "Clics", "Ventes"].map((t, i) => <div key={t} className="rounded-xl border border-border bg-[var(--surface-2)] px-3 py-3"><div className="h-1.5 overflow-hidden rounded-full bg-secondary"><div className="fill-x h-full rounded-full bg-primary" style={{ width: `${[100, 64, 38][i]}%`, animationDelay: `${i * 0.3}s` }} /></div><p className="mt-2 text-[11px] text-muted-foreground">{t}</p></div>)}
            </div>
          </Tile>
          <Tile className="md:col-span-3" icon={<RotateCcw size={18} />} title="Retours encadrés" text="Les demandes de retour et remboursements arrivent dans votre espace, avec le motif et les photos du client." />
          <Tile className="md:col-span-3" icon={<Star size={18} />} title="Avis vérifiés" text="Seuls les acheteurs peuvent noter vos produits : des avis de confiance qui rassurent les nouveaux clients." />
        </div>
      </Container>
    </section>
  );
}

function Tile({ className = "", icon, title, text, children }: { className?: string; icon: React.ReactNode; title: string; text: string; children?: React.ReactNode }) {
  return (
    <Reveal variant="up" className={`group relative overflow-hidden rounded-[1.4rem] border border-border bg-card p-6 shadow-card hover:border-primary/40 sm:p-7 ${className}`}>
      <div className="glow-orb pointer-events-none absolute -right-20 -top-20 h-48 w-48 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/12 text-primary transition-transform duration-500 group-hover:-rotate-6 group-hover:scale-110">{icon}</span>
      <h3 className="mt-5 text-lg font-bold leading-snug sm:text-xl">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p>
      {children}
    </Reveal>
  );
}

/** Compte à rebours qui tourne vraiment (illustration d'une vente flash). */
function Countdown() {
  const [left, setLeft] = useState(2 * 3600 + 14 * 60 + 37);
  useEffect(() => { const t = window.setInterval(() => setLeft((s) => (s <= 0 ? 2 * 3600 + 14 * 60 + 37 : s - 1)), 1000); return () => window.clearInterval(t); }, []);
  const parts = [Math.floor(left / 3600), Math.floor((left % 3600) / 60), left % 60].map((v) => String(v).padStart(2, "0"));
  return (
    <>
      {parts.map((v, i) => (
        <div key={i} className="flex-1 overflow-hidden rounded-xl border border-border bg-[var(--surface-2)] py-3 text-center">
          <p key={v} className={`tabular text-2xl font-extrabold ${i === 2 ? "tick-flip text-primary" : ""}`}>{v}</p>
          <p className="text-[10px] text-muted-foreground">{["h", "min", "s"][i]}</p>
        </div>
      ))}
    </>
  );
}

/* Deux exemples de fiches : l'assistant « écrit » la fiche à partir des informations du vendeur. */
const AI_SAMPLES = [
  {
    input: "Écouteurs X12 · noir · 15 000 FCFA",
    title: "Écouteurs Bluetooth X12 sans fil – réduction de bruit, 30 h d'autonomie",
    bullets: ["Son clair et basses profondes", "Étui de charge rapide USB-C", "Garantie 6 mois · livraison à Yaoundé et Douala"],
    tags: ["écouteurs bluetooth", "sans fil", "Douala", "Yaoundé"],
  },
  {
    input: "Robe wax · tailles M à XXL · 12 500 FCFA",
    title: "Robe en wax 100 % coton – coupe évasée, du M au XXL",
    bullets: ["Tissu wax africain respirant", "Fermeture éclair au dos, doublure légère", "Idéale pour cérémonies et sorties"],
    tags: ["robe wax", "pagne", "mode africaine", "Yaoundé"],
  },
];

const AI_SAMPLES_EN = [
  {
    input: "X12 earbuds · black · 15,000 FCFA",
    title: "X12 wireless Bluetooth earbuds – noise cancelling, 30 h battery",
    bullets: ["Clear sound and deep bass", "Fast USB-C charging case", "6-month warranty · delivery in Yaoundé and Douala"],
    tags: ["bluetooth earbuds", "wireless", "Douala", "Yaoundé"],
  },
  {
    input: "Wax dress · sizes M to XXL · 12,500 FCFA",
    title: "100% cotton wax print dress – flared cut, M to XXL",
    bullets: ["Breathable African wax fabric", "Back zip, light lining", "Perfect for ceremonies and outings"],
    tags: ["wax dress", "ankara", "African fashion", "Yaoundé"],
  },
];

function AiWriter() {
  const [k, setK] = useState(0);
  const [samples, setSamples] = useState(AI_SAMPLES);
  useEffect(() => { if (preferredLang() === "en") setSamples(AI_SAMPLES_EN); }, []);
  const [n, setN] = useState(0); // nombre de caractères déjà écrits
  const sample = samples[k];
  const full = [sample.title, ...sample.bullets].join("\n");
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setN(full.length); return; }
    if (n < full.length) { const t = window.setTimeout(() => setN((x) => Math.min(full.length, x + 2)), 28); return () => window.clearTimeout(t); }
    const t = window.setTimeout(() => { setN(0); setK((x) => (x + 1) % AI_SAMPLES.length); }, 3200);
    return () => window.clearTimeout(t);
  }, [n, full.length, samples.length]);
  const written = full.slice(0, n).split("\n");
  const done = n >= full.length;
  return (
    <div className="mt-6 rounded-xl border border-border bg-[var(--surface-2)] p-4 text-left">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-primary"><Sparkles size={14} />Assistant fiche produit</div>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${done ? "bg-emerald-500/15 text-emerald-500" : "bg-primary/12 text-primary"}`}>{done ? "Fiche prête" : "Rédaction…"}</span>
      </div>
      <p className="mt-3 truncate rounded-lg border border-dashed border-border px-2.5 py-1.5 text-[11px] text-muted-foreground">Vos infos : <span translate="no" className="text-foreground">{sample.input}</span></p>
      <div translate="no" className="mt-3 min-h-[7.5rem] space-y-1.5">
        {written[0] !== undefined && <p className="text-sm font-bold leading-snug">{written[0]}{written.length === 1 && !done && <Caret />}</p>}
        {written.slice(1).map((b, i) => (
          <p key={i} className="flex gap-1.5 text-xs leading-relaxed text-muted-foreground"><span className="text-primary">•</span><span>{b}{i === written.length - 2 && !done && <Caret />}</span></p>
        ))}
      </div>
      <div translate="no" className="mt-3 flex min-h-[1.75rem] flex-wrap gap-1.5">
        {done && sample.tags.map((t, i) => <span key={t} className="hero-bubble-tag rounded-full bg-primary/12 px-2.5 py-1 text-[11px] font-medium text-primary" style={{ animationDelay: `${i * 0.12}s` }}>{t}</span>)}
      </div>
    </div>
  );
}

function Caret() {
  return <span className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] animate-pulse bg-primary align-baseline" />;
}

/* Encaissement : un moyen de paiement s'allume, l'argent passe par Amachia (sécurisé) et arrive dans le solde. */
const PAY_METHODS = [
  { l: "À la livraison", icon: Banknote, tone: "bg-emerald-500 text-white", amount: 12500 },
  { l: "Orange Money", icon: Smartphone, tone: "bg-[#ff7900] text-black", amount: 8000 },
  { l: "MTN MoMo", icon: Smartphone, tone: "bg-[#ffcc00] text-black", amount: 15000 },
  { l: "Carte", icon: CreditCard, tone: "bg-sky-500 text-white", amount: 22500 },
];

function PaymentFlow() {
  const [i, setI] = useState(0);
  const [balance, setBalance] = useState(245000);
  const [shown, setShown] = useState(245000);
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = window.setInterval(() => {
      setI((k) => {
        const next = (k + 1) % PAY_METHODS.length;
        setBalance((b) => (b > 900000 ? 245000 : b + PAY_METHODS[next].amount));
        return next;
      });
    }, 3000);
    return () => window.clearInterval(t);
  }, []);
  // le solde monte doucement quand la pièce arrive (après le passage par Amachia)
  useEffect(() => {
    if (shown === balance) return;
    let raf = 0; const from = shown; const t0 = performance.now() + 1500;
    const tick = (t: number) => {
      const k = Math.max(0, Math.min(1, (t - t0) / 600));
      setShown(Math.round(from + (balance - from) * k));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [balance]); // eslint-disable-line react-hooks/exhaustive-deps
  const m = PAY_METHODS[i];
  return (
    <div className="mt-6 space-y-3 text-left">
      <div className="grid grid-cols-4 gap-1.5">
        {PAY_METHODS.map((x, k) => (
          <div key={x.l} className={`flex min-w-0 flex-col items-center gap-1 rounded-xl border px-1 py-2 text-center transition-all duration-500 ${k === i ? "scale-[1.04] border-primary bg-primary/10" : "border-border bg-[var(--surface-2)] opacity-60"}`}>
            <span className={`grid h-7 w-7 place-items-center rounded-lg ${x.tone}`}><x.icon size={14} /></span>
            <span className="flex h-[22px] w-full items-center justify-center text-[9.5px] font-semibold leading-[11px]">{x.l}</span>
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-border bg-[var(--surface-2)] p-3">
        <div className="relative flex h-9 items-center justify-between">
          <div className="absolute inset-x-4 top-1/2 h-0.5 -translate-y-1/2 rounded bg-border" />
          <span className="relative z-10 grid h-9 w-9 place-items-center rounded-full bg-secondary text-muted-foreground"><User size={15} /></span>
          <span className="halo relative z-10 grid h-9 w-9 place-items-center rounded-full bg-primary text-black"><Lock size={15} /></span>
          <span className="relative z-10 grid h-9 w-9 place-items-center rounded-full bg-emerald-500 text-white"><Wallet size={15} /></span>
          <span key={i} className={`pay-coin absolute top-1/2 z-20 grid h-5 w-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-[9px] font-black shadow-lg ${m.tone}`}>F</span>
        </div>
        <div className="mt-1.5 grid grid-cols-3 text-[10px] font-semibold text-muted-foreground">
          <span>Client</span><span className="text-center text-primary">Amachia</span><span className="text-right">Votre solde</span>
        </div>
      </div>
      <div className="relative flex h-12 items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3">
        <span className="text-[11px] font-semibold text-muted-foreground">Solde disponible</span>
        <span className="tabular text-base font-extrabold text-emerald-500">{shown.toLocaleString("fr-FR")}<span className="ml-0.5 align-super text-[8px]">FCFA</span></span>
        <span key={`b${i}`} className="pay-plus pointer-events-none absolute -top-3 right-3 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-white">+{m.amount.toLocaleString("fr-FR")} FCFA</span>
      </div>
    </div>
  );
}
