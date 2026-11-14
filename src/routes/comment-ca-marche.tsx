import { createFileRoute } from "@tanstack/react-router";
import { Header } from "@/components/seller/Header";
import { Footer } from "@/components/seller/Footer";
import { FinalCTA } from "@/components/seller/FinalCTA";
import { CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/comment-ca-marche")({
  head: () => ({
    meta: [
      { title: "Comment ça marche — Amashia Seller" }, { property: "og:title", content: "Comment ça marche — Amashia Seller" }, { property: "og:description", content: "Trois étapes simples pour lancer votre boutique en ligne et commencer à vendre." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
      { name: "description", content: "Trois étapes simples pour lancer votre boutique en ligne et commencer à vendre." },
    ],
  }),
  component: Page,
});

const steps = [
  {
    n: "01",
    title: "Créez votre boutique",
    desc: "Inscrivez-vous gratuitement en quelques secondes. Renseignez les informations de base de votre entreprise et personnalisez l'apparence de votre boutique selon vos préférences.",
    items: ["Inscription rapide et gratuite", "Configuration guidée étape par étape", "Personnalisation du design", "Ajout de votre logo et couleurs"],
    img: "/images/visual-338f4c83c902.webp",
  },
  {
    n: "02",
    title: "Ajoutez vos produits ou services",
    desc: "Importez facilement vos produits avec photos, descriptions détaillées et prix. Organisez-les par catégories et gérez vos stocks en temps réel pour une meilleure visibilité.",
    items: ["Upload de photos multiples", "Descriptions détaillées", "Gestion des variations", "Suivi des stocks automatique"],
    img: "/images/visual-c8118462b524.webp",
  },
  {
    n: "03",
    title: "Recevez les commandes et soyez payé",
    desc: "Vos clients découvrent vos produits et passent commande directement. Vous recevez des notifications instantanées, gérez les livraisons et recevez vos paiements de manière sécurisée.",
    items: ["Notifications en temps réel", "Gestion des commandes simplifiée", "Paiements sécurisés", "Suivi de livraison intégré"],
    img: "/images/visual-a2961a58018a.webp",
  },
];

function Page() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <section className="pt-20 pb-16 md:pt-28">
          <div className="container mx-auto px-6 text-center max-w-4xl">
            <h1 className="text-5xl md:text-7xl font-extrabold leading-[1.05]">
              Comment ça <span className="text-gradient">fonctionne</span>
            </h1>
            <p className="mt-8 text-lg text-muted-foreground">
              Trois étapes simples pour lancer votre boutique en ligne et commencer à vendre
            </p>
          </div>
        </section>

        <section className="pb-16">
          <div className="container mx-auto px-6 space-y-24 md:space-y-32">
            {steps.map((s, i) => (
              <div key={s.n} className={`grid md:grid-cols-2 gap-12 lg:gap-20 items-center ${i % 2 === 1 ? "md:[&>div:first-child]:order-2" : ""}`}>
                <div>
                  <div className="w-16 h-16 rounded-full bg-gradient-primary text-black grid place-items-center font-extrabold text-xl mb-8 shadow-elegant">
                    {s.n}
                  </div>
                  <h2 className="text-4xl md:text-5xl font-extrabold mb-6">{s.title}</h2>
                  <p className="text-muted-foreground text-lg mb-8">{s.desc}</p>
                  <ul className="space-y-3">
                    {s.items.map((it) => (
                      <li key={it} className="flex items-center gap-3">
                        <CheckCircle2 size={20} className="text-primary shrink-0" />
                        <span>{it}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="relative">
                  <div className="absolute -inset-6 bg-primary/20 blur-3xl rounded-full" />
                  <img src={s.img} alt={s.title} loading="lazy" decoding="async" className="relative rounded-3xl shadow-elegant w-full" />
                </div>
              </div>
            ))}
          </div>
        </section>

        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}
