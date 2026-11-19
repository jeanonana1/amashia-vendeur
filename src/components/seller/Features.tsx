import { Sparkles, Bell, Bike, Wallet, BarChart3, Zap, Megaphone, RotateCcw, Star, Check } from "lucide-react";
import { Container, SectionHeading } from "@/components/seller/site/ui";

/** Grille « bento » des fonctionnalités, avec mini-interfaces illustratives. */
export function Features() {
  return (
    <section id="fonctionnalites" className="relative py-24 md:py-32">
      <Container>
        <SectionHeading eyebrow="Tout-en-un" title={<>Une boutique complète, <span className="text-gradient">sans la complexité</span></>}
          text="De la fiche produit à l'argent dans votre solde : chaque étape est pensée pour vendre plus, depuis votre téléphone." />
        <div className="mt-16 grid auto-rows-[minmax(0,auto)] gap-4 md:grid-cols-6">
          <Tile className="md:col-span-4" icon={<Sparkles size={18} />} title="Des fiches produits qui vendent, rédigées par l'IA"
            text="Titre, description, caractéristiques et mots-clés recherchés au Cameroun : l'assistant rédige à partir de vos informations. Vous pouvez aussi générer des photos de présentation.">
            <div className="mt-6 rounded-xl border border-border bg-[var(--surface-2)] p-4 text-left">
              <div className="flex items-center gap-2 text-xs font-semibold text-primary"><Sparkles size={14} />Assistant fiche produit</div>
              <div className="mt-3 space-y-2">
                <div className="h-3 w-4/5 rounded-full bg-foreground/80" />
                <div className="h-2.5 w-full rounded-full bg-muted-foreground/25" />
                <div className="h-2.5 w-11/12 rounded-full bg-muted-foreground/25" />
                <div className="h-2.5 w-2/3 rounded-full bg-muted-foreground/25" />
              </div>
              <div className="mt-4 flex flex-wrap gap-1.5">{["Livraison rapide", "Garantie", "Yaoundé", "Douala"].map((t) => <span key={t} className="rounded-full bg-primary/12 px-2.5 py-1 text-[11px] font-medium text-primary">{t}</span>)}</div>
            </div>
          </Tile>
          <Tile className="md:col-span-2" icon={<Bell size={18} />} title="Commandes en temps réel" text="Une sonnerie et une notification à chaque commande, même navigateur fermé.">
            <div className="mt-6 space-y-2">
              {["Nouvelle commande", "En préparation", "En cours de livraison"].map((t, i) => (
                <div key={t} className="flex items-center gap-2.5 rounded-xl border border-border bg-[var(--surface-2)] px-3 py-2.5 text-left text-xs">
                  <span className={`h-2 w-2 rounded-full ${i === 0 ? "bg-primary" : i === 1 ? "bg-sky-400" : "bg-emerald-500"}`} />
                  <span className="font-semibold">{t}</span>
                </div>
              ))}
            </div>
          </Tile>
          <Tile className="md:col-span-2" icon={<Bike size={18} />} title="Livraison Prime" text="Un livreur Amashia proche de votre boutique récupère le colis et le livre au client. Ailleurs, expédition par agence.">
            <div className="mt-6 flex items-center gap-2 text-left text-[11px]">
              {["Boutique", "Livreur", "Client"].map((t, i) => (
                <div key={t} className="flex flex-1 items-center gap-2">
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${i < 2 ? "bg-primary text-black" : "bg-secondary text-muted-foreground"}`}><Check size={14} /></span>
                  {i < 2 && <span className={`h-0.5 flex-1 rounded ${i === 0 ? "bg-primary" : "bg-gradient-to-r from-primary to-secondary"}`} />}
                </div>
              ))}
            </div>
          </Tile>
          <Tile className="md:col-span-2" icon={<Wallet size={18} />} title="Encaissement sécurisé" text="Paiement à la livraison, Orange Money, MTN MoMo ou carte : Amashia encaisse, vous suivez votre solde en direct." />
          <Tile className="md:col-span-2" icon={<BarChart3 size={18} />} title="Analytique claire" text="Ventes, visiteurs en direct, taux de conversion et sources de trafic (Facebook, TikTok…).">
            <div className="mt-6 flex h-16 items-end gap-1.5">{[30, 45, 38, 60, 52, 75, 90].map((h, i) => <div key={i} className="flex-1 rounded-t bg-primary/70" style={{ height: `${h}%` }} />)}</div>
          </Tile>
          <Tile className="md:col-span-3" icon={<Zap size={18} />} title="Ventes flash et coupons" text="Créez une vente flash avec compte à rebours ou un code promo réservé à vos articles, en deux clics." >
            <div className="mt-6 flex gap-2">
              {["02", "14", "37"].map((n, i) => <div key={i} className="flex-1 rounded-xl border border-border bg-[var(--surface-2)] py-3 text-center"><p className="tabular text-2xl font-extrabold">{n}</p><p className="text-[10px] text-muted-foreground">{["h", "min", "s"][i]}</p></div>)}
            </div>
          </Tile>
          <Tile className="md:col-span-3" icon={<Megaphone size={18} />} title="Sponsoring" text="Mettez vos produits en avant sur Amashia et mesurez les vues, clics et ventes de chaque campagne." >
            <div className="mt-6 grid grid-cols-3 gap-2 text-center">
              {["Vues", "Clics", "Ventes"].map((t) => <div key={t} className="rounded-xl border border-border bg-[var(--surface-2)] py-3"><div className="mx-auto h-1.5 w-8 rounded-full bg-primary" /><p className="mt-2 text-[11px] text-muted-foreground">{t}</p></div>)}
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
    <div className={`group relative overflow-hidden rounded-[1.4rem] border border-border bg-card p-6 shadow-card transition hover:border-primary/40 sm:p-7 ${className}`}>
      <div className="glow-orb pointer-events-none absolute -right-20 -top-20 h-48 w-48 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/12 text-primary">{icon}</span>
      <h3 className="mt-5 text-lg font-bold leading-snug sm:text-xl">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p>
      {children}
    </div>
  );
}
