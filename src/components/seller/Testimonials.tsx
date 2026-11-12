import { BadgeCheck, Star } from "lucide-react";

const testimonials = [
  {
    name: "Aminata Diallo",
    role: "Propriétaire de boutique de mode",
    location: "Dakar, Sénégal",
    text: "Amashia Seller a transformé mon activité. En trois mois, mes ventes ont triplé et je peux maintenant gérer ma boutique depuis mon téléphone. C'est incroyablement simple et efficace.",
    img: "/images/visual-36929e5ea498.jpg",
  },
  {
    name: "Kwame Mensah",
    role: "Restaurateur",
    location: "Accra, Ghana",
    text: "Grâce à cette plateforme, j'ai pu digitaliser mon restaurant et recevoir des commandes en ligne. Le système de paiement est sécurisé et les clients adorent la facilité de commande.",
    img: "/images/visual-e7ad3f34f225.jpg",
  },
  {
    name: "Fatou Ndiaye",
    role: "Salon de coiffure",
    location: "Abidjan, Côte d'Ivoire",
    text: "Mes clientes peuvent maintenant réserver leurs rendez-vous en ligne et voir mes créations. J'ai gagné tellement de temps et mes revenus ont augmenté de 150% en six mois.",
    img: "/images/visual-e0633f9978b6.jpg",
  },
];

export function Testimonials() {
  return (
    <section className="py-24 md:py-32">
      <div className="container mx-auto px-6">
        <div className="text-center max-w-3xl mx-auto mb-20">
          <h2 className="text-4xl md:text-6xl font-extrabold">
            Ils nous font <span className="text-gradient">confiance</span>
          </h2>
          <p className="mt-6 text-lg text-muted-foreground">
            Découvrez comment Amashia Seller aide les vendeurs africains à réussir
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-8">
          {testimonials.map((t) => (
            <div key={t.name} className="bg-card border border-border rounded-3xl overflow-hidden hover:border-primary/50 transition">
              <div className="aspect-[4/5] relative overflow-hidden">
                <img src={t.img} alt={t.name} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-card to-transparent" />
                <div className="absolute top-4 right-4 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/90 text-white text-xs font-medium">
                  <BadgeCheck size={14} /> Vérifié
                </div>
              </div>
              <div className="p-7">
                <div className="flex gap-0.5 text-gold mb-3">
                  {Array.from({ length: 5 }).map((_, i) => <Star key={i} size={16} fill="currentColor" />)}
                </div>
                <p className="text-muted-foreground mb-5 text-sm leading-relaxed">"{t.text}"</p>
                <div>
                  <p className="font-bold">{t.name}</p>
                  <p className="text-sm text-muted-foreground">{t.role}</p>
                  <p className="text-xs text-primary mt-1">{t.location}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
