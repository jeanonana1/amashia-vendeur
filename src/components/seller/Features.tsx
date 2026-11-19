import { Sparkles, Bell, Bike, Wallet, BarChart3, Zap, Megaphone, RotateCcw, Star, Check } from "lucide-react";
import { useEffect, useState } from "react";
import { Container, SectionHeading } from "@/components/seller/site/ui";
import { Reveal } from "@/components/seller/site/motion";

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
            <div className="mt-6 rounded-xl border border-border bg-[var(--surface-2)] p-4 text-left">
              <div className="flex items-center gap-2 text-xs font-semibold text-primary"><Sparkles size={14} />Assistant fiche produit</div>
              <div className="mt-3 space-y-2">
                {[["80%", "h-3 bg-foreground/80"], ["100%", "h-2.5 bg-muted-foreground/25"], ["92%", "h-2.5 bg-muted-foreground/25"], ["66%", "h-2.5 bg-muted-foreground/25"]].map(([w, c], i) => (
                  <div key={i} className={`type-line rounded-full ${c}`} style={{ ["--w" as string]: w, animationDelay: `${i * 0.25}s` }} />
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-1.5">{["Livraison rapide", "Garantie", "Yaoundé", "Douala"].map((t, i) => <span key={t} className="notif-in rounded-full bg-primary/12 px-2.5 py-1 text-[11px] font-medium text-primary" style={{ animationDelay: `${1.2 + i * 0.2}s`, animationDuration: "5s" }}>{t}</span>)}</div>
            </div>
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
          <Tile className="md:col-span-2" icon={<Bike size={18} />} title="Livraison Prime" text="Un livreur Amashia proche de votre boutique récupère le colis et le livre au client. Ailleurs, expédition par agence.">
            <div className="mt-7 px-1">
              <div className="relative h-1.5 rounded-full bg-secondary">
                <div className="fill-x absolute inset-0 rounded-full bg-primary" />
                <span className="ride absolute top-1/2 grid h-8 w-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-primary text-black shadow-[0_6px_20px_-6px_var(--primary)]"><Bike size={15} /></span>
              </div>
              <div className="mt-4 flex justify-between text-[11px] font-semibold text-muted-foreground"><span>Boutique</span><span>Livreur</span><span className="flex items-center gap-1">Client <Check size={12} className="text-emerald-500" /></span></div>
            </div>
          </Tile>
          <Tile className="md:col-span-2" icon={<Wallet size={18} />} title="Encaissement sécurisé" text="Paiement à la livraison, Orange Money, MTN MoMo ou carte : Amashia encaisse, vous suivez votre solde en direct." />
          <Tile className="md:col-span-2" icon={<BarChart3 size={18} />} title="Analytique claire" text="Ventes, visiteurs en direct, taux de conversion et sources de trafic (Facebook, TikTok…).">
            <Reveal variant="up" className="mt-6"><div className="flex h-16 items-end gap-1.5">{[30, 45, 38, 60, 52, 75, 90].map((h, i) => <div key={i} className="grow-y flex-1 rounded-t bg-primary/70" style={{ height: `${h}%`, transitionDelay: `${300 + i * 90}ms` }} />)}</div></Reveal>
          </Tile>
          <Tile className="md:col-span-3" icon={<Zap size={18} />} title="Ventes flash et coupons" text="Créez une vente flash avec compte à rebours ou un code promo réservé à vos articles, en deux clics." >
            <div className="mt-6 flex gap-2">
              <Countdown />
            </div>
          </Tile>
          <Tile className="md:col-span-3" icon={<Megaphone size={18} />} title="Sponsoring" text="Mettez vos produits en avant sur Amashia et mesurez les vues, clics et ventes de chaque campagne." >
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
