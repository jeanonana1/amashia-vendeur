import { Store, Package, ShoppingBag, CreditCard, BarChart3, Headphones } from "lucide-react";

const features = [
  { icon: Store, title: "Création de boutique", desc: "Créez votre boutique en ligne en quelques minutes. Design personnalisable et professionnel sans compétences techniques." },
  { icon: Package, title: "Gestion des produits", desc: "Ajoutez, modifiez et organisez vos produits et services facilement. Gestion des stocks en temps réel." },
  { icon: ShoppingBag, title: "Suivi des commandes", desc: "Recevez et gérez vos commandes en un seul endroit. Notifications instantanées et suivi de livraison." },
  { icon: CreditCard, title: "Paiements instantanés", desc: "Recevez vos paiements rapidement et en toute sécurité. Plusieurs méthodes de paiement acceptées." },
  { icon: BarChart3, title: "Analytics avancés", desc: "Suivez vos ventes, revenus et performances. Tableaux de bord détaillés et rapports personnalisés." },
  { icon: Headphones, title: "Support client", desc: "Gérez vos clients et leurs demandes efficacement. Chat intégré et système de tickets." },
];

export function Features() {
  return (
    <section className="py-24 md:py-32">
      <div className="container mx-auto px-6">
        <div className="text-center max-w-3xl mx-auto mb-20">
          <h2 className="text-4xl md:text-6xl font-extrabold">
            Tout ce dont vous avez besoin pour <span className="text-gradient">réussir</span>
          </h2>
          <p className="mt-6 text-lg text-muted-foreground">
            Des outils puissants et simples pour gérer votre activité de vente en ligne
          </p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f, i) => (
            <div
              key={i}
              className="group bg-card border border-border rounded-2xl p-8 hover:border-primary/50 hover:shadow-elegant transition-all duration-300"
            >
              <div className="w-14 h-14 rounded-2xl bg-gradient-primary grid place-items-center text-white mb-6 group-hover:scale-110 transition-transform">
                <f.icon size={24} />
              </div>
              <h3 className="text-xl font-bold mb-3">{f.title}</h3>
              <p className="text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
