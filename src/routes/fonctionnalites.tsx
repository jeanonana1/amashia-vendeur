import { createFileRoute } from "@tanstack/react-router";
import { Header } from "@/components/seller/Header";
import { Footer } from "@/components/seller/Footer";
import { FinalCTA } from "@/components/seller/FinalCTA";
import { Features } from "@/components/seller/Features";
import { Container, PageHero, PrimaryCta, GhostCta } from "@/components/seller/site/ui";
import { Store, Package, ShoppingBag, Wallet, BarChart3, Megaphone, Check } from "lucide-react";

export const Route = createFileRoute("/fonctionnalites")({
  head: () => ({
    links: [{ rel: "canonical", href: "https://seller.amachia.com/fonctionnalites" }],
    meta: [
      { title: "Fonctionnalités — Amachia Seller" }, { name: "description", content: "Boutique, produits, commandes, livraison Prime, paiements, analytique, promotions : tous les outils pour vendre sur Amachia." },
      { property: "og:title", content: "Fonctionnalités — Amachia Seller" }, { property: "og:description", content: "Tous les outils pour vendre sur Amachia." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

const blocks = [
  { icon: Store, tag: "Boutique", title: "Une vitrine à votre image", text: "Logo, bannière, description et catégories : votre boutique a sa propre page sur Amachia, avec un lien « Visiter la boutique » sur chacun de vos produits.", items: ["Page boutique publique", "Logo et bannière recadrables", "Point de retrait géolocalisé pour les livreurs", "Ancienneté et avis affichés"] },
  { icon: Package, tag: "Produits", title: "Des fiches complètes en quelques minutes", text: "Ajoutez photos, variantes et prix par option. L'assistant IA rédige la fiche à partir de vos informations, et l'enregistrement automatique évite de tout perdre.", items: ["Couleurs, tailles et attributs", "Prix différent par option", "Photos par couleur", "Alertes de stock et réapprovisionnement"] },
  { icon: ShoppingBag, tag: "Commandes", title: "Chaque commande, suivie de bout en bout", text: "Sonnerie et notification à chaque commande, puis le même statut partout : Commande reçue, En préparation, En cours de livraison, Livrée.", items: ["Alerte même navigateur fermé", "Statut synchronisé avec le livreur", "Retours et remboursements", "Coordonnées clients protégées"] },
  { icon: Wallet, tag: "Paiements", title: "Votre argent, en toute transparence", text: "Le client paie Amachia. Votre solde disponible et le montant en attente de livraison sont visibles en direct, commission comprise.", items: ["Paiement à la livraison", "Orange Money et MTN MoMo", "Détail des commissions par commande", "Historique des versements"] },
  { icon: BarChart3, tag: "Analytique", title: "Comprenez ce qui fait vendre", text: "Ventes, commandes, visiteurs en direct, conversion et sources de trafic : identifiez vos meilleurs produits et vos meilleures campagnes.", items: ["Visiteurs en temps réel", "Évolution des ventes", "Sources : Facebook, TikTok…", "Clients et produits les plus vendus"] },
  { icon: Megaphone, tag: "Croissance", title: "Des outils pour accélérer", text: "Ventes flash avec compte à rebours, coupons réservés à vos articles et campagnes sponsorisées avec statistiques détaillées.", items: ["Ventes flash", "Codes promo vendeur", "Produits sponsorisés", "Mesure des vues, clics et ventes"] },
];

function Page() {
  return (
    <div className="min-h-screen overflow-x-clip bg-background">
      <Header />
      <main>
        <PageHero eyebrow="Fonctionnalités" title={<>Tout pour vendre. <span className="text-gradient">Rien de superflu.</span></>}
          text="Votre espace vendeur réunit la boutique, les produits, les commandes, les paiements et la croissance, dans une interface pensée pour le téléphone.">
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"><PrimaryCta /><GhostCta to="/tarification">Voir les tarifs</GhostCta></div>
        </PageHero>
        <section className="py-10">
          <Container className="space-y-6">
            {blocks.map((b, i) => (
              <div key={b.title} className="grid items-center gap-8 rounded-[1.6rem] border border-border bg-card p-6 shadow-card sm:p-10 md:grid-cols-2">
                <div className={i % 2 ? "md:order-2" : ""}>
                  <span className="inline-flex items-center gap-2 rounded-full bg-primary/12 px-3 py-1 text-xs font-bold text-primary"><b.icon size={14} />{b.tag}</span>
                  <h2 className="mt-4 text-2xl font-extrabold leading-tight sm:text-3xl">{b.title}</h2>
                  <p className="mt-3 leading-relaxed text-muted-foreground">{b.text}</p>
                </div>
                <ul className={`grid gap-3 sm:grid-cols-2 ${i % 2 ? "md:order-1" : ""}`}>
                  {b.items.map((it) => (
                    <li key={it} className="flex items-start gap-3 rounded-2xl border border-border bg-[var(--surface-2)] p-4 text-sm font-medium">
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary text-black"><Check size={13} strokeWidth={3} /></span>{it}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </Container>
        </section>
        <Features />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}
