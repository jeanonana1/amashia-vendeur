import { Bike, Bell, Sparkles, Smartphone, ShieldCheck, Truck, Wallet, BadgeCheck } from "lucide-react";
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
            <PrimaryCta className="w-full sm:w-auto">Ouvrir ma boutique gratuitement</PrimaryCta>
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

/** Maquette (illustration) de l'espace vendeur, animée. */
function ProductMock() {
  const bars = [38, 52, 44, 61, 57, 74, 69, 88, 80, 96, 90, 100];
  return (
    <div className="relative mx-auto mt-16 max-w-5xl animate-rise" style={{ animationDelay: "0.15s" }}>
      <div className="glow-orb absolute -inset-x-10 -top-10 bottom-0 -z-10 opacity-80" />
      <div className="ring-gradient overflow-hidden rounded-[1.6rem] border border-border bg-card shadow-card">
        {/* barre de fenêtre */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <span className="h-3 w-3 rounded-full bg-[#ff5f57]" /><span className="h-3 w-3 rounded-full bg-[#febc2e]" /><span className="h-3 w-3 rounded-full bg-[#28c840]" />
          <div className="mx-auto hidden rounded-full bg-secondary px-4 py-1 text-[11px] text-muted-foreground sm:block">amashia-vendeur.vercel.app/dashboard</div>
        </div>
        <div className="grid md:grid-cols-[200px_1fr]">
          <aside className="hidden border-r border-border p-4 md:block">
            {["Aperçu", "Produits", "Commandes", "Livraison", "Paiements", "Analytique", "Promotions"].map((n, i) => (
              <div key={n} className={`mb-1 rounded-lg px-3 py-2 text-xs ${i === 0 ? "bg-primary/12 font-semibold text-primary" : "text-muted-foreground"}`}>{n}</div>
            ))}
          </aside>
          <div className="p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div className="text-left">
                <p className="text-[11px] text-muted-foreground">Bonjour 👋</p>
                <p className="text-base font-bold sm:text-lg">Votre boutique aujourd'hui</p>
              </div>
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/12 px-2.5 py-1 text-[11px] font-semibold text-emerald-500"><span className="relative flex h-2 w-2"><span className="animate-ping-soft absolute inline-flex h-full w-full rounded-full bg-emerald-500" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" /></span>En direct</span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
              {[{ l: "Ventes", v: "▲", c: "text-primary" }, { l: "Commandes", v: "●", c: "text-emerald-500" }, { l: "Visiteurs", v: "◆", c: "text-sky-400" }].map((k) => (
                <div key={k.l} className="rounded-xl border border-border bg-[var(--surface-2)] p-3 text-left">
                  <p className="text-[10px] text-muted-foreground sm:text-[11px]">{k.l}</p>
                  <div className="mt-2 h-2 w-3/4 rounded-full bg-secondary"><div className="h-2 w-2/3 rounded-full bg-current opacity-70" style={{ color: "var(--primary)" }} /></div>
                  <p className={`mt-1 text-xs ${k.c}`}>{k.v}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-xl border border-border bg-[var(--surface-2)] p-3 sm:p-4">
              <div className="flex items-end gap-1.5 sm:gap-2" style={{ height: 120 }}>
                {bars.map((h, i) => (
                  <div key={i} className="flex-1 rounded-t-md bg-gradient-to-t from-primary/25 to-primary transition-all" style={{ height: `${h}%`, opacity: 0.45 + i * 0.045 }} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* cartes flottantes */}
      <FloatCard className="left-[-0.5rem] top-24 sm:left-[-2.5rem]" delay="0.5s" icon={<Bell size={16} />} tone="bg-primary text-black" title="Nouvelle commande" text="Sonnerie dans votre espace" />
      <FloatCard className="right-[-0.5rem] top-44 sm:right-[-2.5rem]" delay="0.8s" icon={<Bike size={16} />} tone="bg-sky-500 text-white" title="Livreur Prime en route" text="Récupération chez vous" />
      <FloatCard className="bottom-[-1.25rem] left-1/2 -translate-x-1/2 sm:left-[18%] sm:translate-x-0" delay="1.1s" icon={<Wallet size={16} />} tone="bg-emerald-500 text-white" title="Commande livrée" text="Le montant passe dans votre solde" />
      <p className="mt-16 text-center text-[11px] text-muted-foreground">Illustration de l'espace vendeur</p>
    </div>
  );
}

function FloatCard({ className, delay, icon, tone, title, text }: { className: string; delay: string; icon: React.ReactNode; tone: string; title: string; text: string }) {
  return (
    <div className={`glass absolute z-10 hidden items-center gap-3 rounded-2xl border border-border px-3.5 py-3 shadow-card animate-rise sm:flex ${className}`} style={{ animationDelay: delay }}>
      <span className={`grid h-9 w-9 place-items-center rounded-xl ${tone}`}>{icon}</span>
      <div className="text-left">
        <p className="text-[13px] font-bold leading-tight">{title}</p>
        <p className="text-[11px] text-muted-foreground">{text}</p>
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
