import { createFileRoute } from "@tanstack/react-router";
import { Header } from "@/components/seller/Header";
import { Footer } from "@/components/seller/Footer";
import { FinalCTA } from "@/components/seller/FinalCTA";
import { Smartphone, Shirt, Heart, Home, Utensils, Book, Trophy, Activity, Gem, Car, Baby, Wrench, ShieldCheck, BarChart3, Headphones, Store } from "lucide-react";

export const Route = createFileRoute("/tarification")({
  head: () => ({
    meta: [
      { title: "Tarification — Amashia Seller" }, { property: "og:title", content: "Tarification — Amashia Seller" }, { property: "og:description", content: "Tarification simple et transparente. Payez uniquement une commission sur vos ventes." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
      { name: "description", content: "Tarification simple et transparente. Payez uniquement une commission sur vos ventes." },
    ],
  }),
  component: Page,
});

const cats = [
  { icon: Smartphone, rate: "8%", title: "Électronique & High-Tech", desc: "Smartphones, ordinateurs, accessoires tech" },
  { icon: Shirt, rate: "12%", title: "Mode & Vêtements", desc: "Vêtements, chaussures, accessoires de mode" },
  { icon: Heart, rate: "10%", title: "Beauté & Cosmétiques", desc: "Maquillage, soins de la peau, parfums" },
  { icon: Home, rate: "12%", title: "Maison & Décoration", desc: "Meubles, décoration, électroménager" },
  { icon: Utensils, rate: "15%", title: "Alimentation & Boissons", desc: "Produits alimentaires, boissons, épicerie" },
  { icon: Book, rate: "15%", title: "Livres & Médias", desc: "Livres, magazines, musique, films" },
  { icon: Trophy, rate: "10%", title: "Sports & Loisirs", desc: "Équipements sportifs, jeux, loisirs" },
  { icon: Activity, rate: "8%", title: "Santé & Bien-être", desc: "Compléments, équipements fitness, santé" },
  { icon: Gem, rate: "20%", title: "Bijoux & Montres", desc: "Bijoux, montres, accessoires précieux" },
  { icon: Car, rate: "12%", title: "Automobile & Moto", desc: "Pièces auto, accessoires, équipements" },
  { icon: Baby, rate: "15%", title: "Jouets & Enfants", desc: "Jouets, vêtements enfants, puériculture" },
  { icon: Wrench, rate: "20%", title: "Services", desc: "Coiffure, réparation, services professionnels" },
];

const included = [
  { icon: ShieldCheck, title: "Paiements sécurisés", desc: "Transactions protégées et versements garantis" },
  { icon: BarChart3, title: "Analytics détaillés", desc: "Suivez vos ventes et performances en temps réel" },
  { icon: Headphones, title: "Support dédié", desc: "Assistance disponible pour tous les vendeurs" },
  { icon: Store, title: "Boutique personnalisée", desc: "Créez votre vitrine unique sur Amashia" },
];

const faq = [
  { q: "Comment sont calculées les commissions ?", a: "Les commissions sont calculées sur le prix de vente final de chaque produit, selon la catégorie. Elles sont automatiquement déduites lors du paiement." },
  { q: "Y a-t-il des frais cachés ?", a: "Non, absolument aucun frais caché. Vous payez uniquement la commission sur vos ventes réussies. L'inscription et la création de boutique sont entièrement gratuites." },
  { q: "Quand suis-je payé ?", a: "Les paiements sont effectués automatiquement chaque semaine sur votre compte Mobile Money ou bancaire, après déduction de la commission." },
  { q: "Puis-je vendre dans plusieurs catégories ?", a: "Oui, vous pouvez vendre des produits dans différentes catégories. Chaque produit sera soumis au taux de commission de sa catégorie respective." },
];

function Page() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <section className="pt-20 pb-12 md:pt-28">
          <div className="container mx-auto px-6 text-center max-w-4xl">
            <h1 className="text-5xl md:text-7xl font-extrabold leading-[1.05]">
              Tarification <span className="text-gradient">simple</span> et transparente
            </h1>
            <p className="mt-8 text-lg text-muted-foreground">
              Payez uniquement une commission sur vos ventes. Pas d'abonnement mensuel, pas de frais cachés.
            </p>
            <div className="mt-12 inline-flex bg-card border border-border rounded-3xl p-8 gap-12">
              <div className="text-left">
                <p className="text-muted-foreground text-sm">Commission moyenne</p>
                <p className="text-4xl md:text-5xl font-extrabold text-primary mt-2">8-20%</p>
              </div>
              <div className="w-px bg-border" />
              <div className="text-left">
                <p className="text-muted-foreground text-sm">Inscription</p>
                <p className="text-4xl md:text-5xl font-extrabold mt-2">Gratuite</p>
              </div>
            </div>
          </div>
        </section>

        <section className="py-24">
          <div className="container mx-auto px-6">
            <div className="text-center max-w-2xl mx-auto mb-16">
              <h2 className="text-4xl md:text-5xl font-extrabold">Commissions par <span className="text-gradient">catégorie</span></h2>
              <p className="mt-4 text-muted-foreground">Des taux compétitifs adaptés à chaque type de produit ou service</p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {cats.map((c) => (
                <div key={c.title} className="bg-card border border-border rounded-2xl p-6 hover:border-primary/50 transition relative">
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-12 h-12 rounded-xl bg-primary/15 grid place-items-center text-primary">
                      <c.icon size={20} />
                    </div>
                    <span className="text-2xl font-extrabold text-primary">{c.rate}</span>
                  </div>
                  <h3 className="font-bold mb-2">{c.title}</h3>
                  <p className="text-sm text-muted-foreground">{c.desc}</p>
                </div>
              ))}
            </div>
            <p className="mt-10 text-center text-sm text-muted-foreground bg-card border border-border rounded-xl p-4 max-w-2xl mx-auto">
              <strong className="text-foreground">Note :</strong> Les commissions sont prélevées uniquement sur les ventes réussies. Aucun frais d'inscription ou d'abonnement.
            </p>
          </div>
        </section>

        <section className="py-24 bg-card/30">
          <div className="container mx-auto px-6">
            <div className="text-center max-w-2xl mx-auto mb-16">
              <h2 className="text-4xl md:text-5xl font-extrabold">Tout ce dont vous avez <span className="text-gradient">besoin</span></h2>
              <p className="mt-4 text-muted-foreground">Fonctionnalités incluses pour tous les vendeurs</p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {included.map((i) => (
                <div key={i.title} className="text-center">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-primary text-black grid place-items-center mx-auto mb-4">
                    <i.icon size={26} />
                  </div>
                  <h3 className="font-bold mb-2">{i.title}</h3>
                  <p className="text-sm text-muted-foreground">{i.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-24">
          <div className="container mx-auto px-6 max-w-3xl">
            <div className="text-center mb-16">
              <h2 className="text-4xl md:text-5xl font-extrabold">Questions <span className="text-gradient">fréquentes</span></h2>
              <p className="mt-4 text-muted-foreground">Vous avez des questions ? Nous avons les réponses.</p>
            </div>
            <div className="space-y-4">
              {faq.map((f) => (
                <details key={f.q} className="group bg-card border border-border rounded-2xl p-6 hover:border-primary/50 transition">
                  <summary className="cursor-pointer font-bold flex justify-between items-center">
                    {f.q}
                    <span className="text-primary group-open:rotate-45 transition-transform text-2xl leading-none">+</span>
                  </summary>
                  <p className="mt-4 text-muted-foreground text-sm">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}
