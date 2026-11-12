import { createFileRoute, Link } from "@tanstack/react-router";
import { Header } from "@/components/seller/Header";
import { Footer } from "@/components/seller/Footer";
import { FinalCTA } from "@/components/seller/FinalCTA";
import { Store, Package, ShoppingBag, CreditCard, BarChart3, Users, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/fonctionnalites")({
  head: () => ({
    meta: [
      { title: "Fonctionnalités — Amashia Seller" }, { property: "og:title", content: "Fonctionnalités — Amashia Seller" }, { property: "og:description", content: "Découvrez toutes les fonctionnalités d'Amashia Seller pour gérer et développer votre boutique en ligne." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
      { name: "description", content: "Découvrez toutes les fonctionnalités d'Amashia Seller pour gérer et développer votre boutique en ligne." },
    ],
  }),
  component: Page,
});

const features = [
  { icon: Store, title: "Création de boutique", desc: "Créez votre boutique en ligne professionnelle en quelques minutes. Personnalisez le design, ajoutez votre logo et vos couleurs de marque.", items: ["Design personnalisable", "Nom de domaine personnalisé", "Templates professionnels", "Responsive mobile"] },
  { icon: Package, title: "Gestion des produits et services", desc: "Ajoutez et gérez facilement vos produits ou services. Photos multiples, descriptions détaillées, variations et gestion des stocks.", items: ["Catalogue illimité", "Gestion des stocks", "Variations de produits", "Import en masse"] },
  { icon: ShoppingBag, title: "Commandes et livraison", desc: "Recevez et gérez vos commandes en temps réel. Notifications instantanées, suivi de livraison et gestion des retours.", items: ["Notifications en temps réel", "Suivi de livraison", "Gestion des retours", "Historique complet"] },
  { icon: CreditCard, title: "Paiements et revenus", desc: "Acceptez plusieurs méthodes de paiement. Recevez vos paiements rapidement et en toute sécurité avec des frais transparents.", items: ["Paiements sécurisés", "Multiples méthodes", "Virements rapides", "Frais transparents"] },
  { icon: BarChart3, title: "Analytique", desc: "Suivez vos performances avec des tableaux de bord détaillés. Analysez vos ventes, revenus, clients et produits populaires.", items: ["Tableaux de bord en temps réel", "Rapports détaillés", "Analyse des ventes", "Insights clients"] },
  { icon: Users, title: "Gestion de la clientèle", desc: "Gérez vos relations clients efficacement. Base de données clients, historique des achats et communication directe.", items: ["Base de données clients", "Historique des achats", "Chat intégré", "Fidélisation"] },
];

function Page() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <section className="pt-20 pb-24 md:pt-28 md:pb-32">
          <div className="container mx-auto px-6 text-center max-w-4xl">
            <h1 className="text-5xl md:text-7xl font-extrabold leading-[1.05]">
              Des <span className="text-gradient">fonctionnalités</span> puissantes pour votre succès
            </h1>
            <p className="mt-8 text-lg text-muted-foreground">
              Tous les outils dont vous avez besoin pour gérer et développer votre activité de vente en ligne, le tout dans une seule plateforme intuitive.
            </p>
          </div>
        </section>
        <section className="pb-24">
          <div className="container mx-auto px-6">
            <div className="grid md:grid-cols-2 gap-6">
              {features.map((f) => (
                <div key={f.title} className="bg-card border border-border rounded-2xl p-8 hover:border-primary/50 transition group">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-primary grid place-items-center text-white mb-6 group-hover:scale-110 transition">
                    <f.icon size={24} />
                  </div>
                  <h3 className="text-2xl font-bold mb-3">{f.title}</h3>
                  <p className="text-muted-foreground mb-6">{f.desc}</p>
                  <ul className="space-y-3">
                    {f.items.map((it) => (
                      <li key={it} className="flex items-center gap-3 text-sm">
                        <CheckCircle2 size={18} className="text-primary shrink-0" />
                        <span>{it}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section className="py-16">
          <div className="container mx-auto px-6 text-center">
            <h2 className="text-3xl md:text-5xl font-extrabold">Prêt à <span className="text-gradient">commencer</span> ?</h2>
            <p className="mt-4 text-muted-foreground">Créez votre compte gratuitement et découvrez toutes nos fonctionnalités</p>
            <Link to="/inscription" className="inline-flex mt-8 px-8 py-4 rounded-full bg-gradient-primary text-white font-semibold shadow-elegant hover:shadow-glow transition">
              Créer mon compte vendeur
            </Link>
          </div>
        </section>
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}
