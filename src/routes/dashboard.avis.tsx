import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout } from "@/components/seller/dashboard/DashboardLayout";
import { Star, MessageSquare } from "lucide-react";

export const Route = createFileRoute("/dashboard/avis")({
  head: () => ({ meta: [{ title: "Avis — Amashia Seller" }, { name: "description", content: "Avis : votre espace vendeur Amashia pour gérer votre activité." }, { property: "og:title", content: "Avis — Amashia Seller" }, { property: "og:description", content: "Avis : votre espace vendeur Amashia pour gérer votre activité." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: AvisPage,
});

const REVIEWS = [
  { name: "Marie Kamga", rating: 5, product: "Robe Wax Élégante", text: "Magnifique robe ! La qualité du tissu est exceptionnelle et la livraison a été rapide. Je recommande vivement cette boutique !", date: "Il y a 2 jours", reply: false },
  { name: "Jean Dupont", rating: 5, product: "Chemise en Coton Bio", text: "Parfait, exactement comme sur la photo. Très satisfait de mon achat.", date: "Il y a 4 jours", reply: true },
  { name: "Paul Nkomo", rating: 4, product: "Sac à main artisanal", text: "Beau produit mais la livraison a pris un peu de temps.", date: "Il y a 1 semaine", reply: false },
  { name: "Sophie Mbarga", rating: 5, product: "Boucles d'oreilles", text: "Adorable ! Mes amies adorent. Je vais commander d'autres modèles.", date: "Il y a 2 semaines", reply: true },
];

function AvisPage() {
  return (
    <DashboardLayout title="Avis clients" subtitle="Gérez votre réputation">
      <div className="grid lg:grid-cols-3 gap-5 mb-6">
        <div className="bg-card border border-border rounded-2xl p-6 text-center">
          <p className="text-6xl font-extrabold text-primary">4.8</p>
          <div className="flex justify-center gap-1 my-3">
            {[1,2,3,4,5].map((i) => <Star key={i} size={20} className="text-amber-400 fill-amber-400" />)}
          </div>
          <p className="text-sm text-muted-foreground">Note moyenne</p>
          <p className="text-xs text-muted-foreground mt-1">Basée sur 235 avis</p>
        </div>
        <div className="lg:col-span-2 bg-card border border-border rounded-2xl p-6">
          <h3 className="font-bold mb-4">Répartition des notes</h3>
          <div className="space-y-2">
            {[{s:5,p:78},{s:4,p:15},{s:3,p:5},{s:2,p:1},{s:1,p:1}].map((r) => (
              <div key={r.s} className="flex items-center gap-3 text-sm">
                <span className="w-4">{r.s}</span>
                <Star size={12} className="text-amber-400 fill-amber-400" />
                <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                  <div className="h-full bg-amber-400" style={{ width: `${r.p}%` }} />
                </div>
                <span className="w-10 text-right text-muted-foreground">{r.p}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl p-6">
        <h3 className="font-bold mb-5">Avis récents</h3>
        <div className="space-y-4">
          {REVIEWS.map((r, i) => (
            <div key={i} className="border border-border rounded-2xl p-5">
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-full bg-gradient-primary grid place-items-center text-white font-bold">{r.name[0]}</div>
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <p className="font-bold">{r.name}</p>
                    <div className="flex gap-0.5">
                      {[1,2,3,4,5].map((i) => <Star key={i} size={12} className={i <= r.rating ? "text-amber-400 fill-amber-400" : "text-muted-foreground"} />)}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">{r.product} • {r.date}</p>
                  <p className="text-sm mt-3 leading-relaxed">{r.text}</p>
                  {!r.reply && (
                    <button className="mt-3 px-4 py-2 rounded-full bg-primary/15 text-primary text-xs font-semibold flex items-center gap-2"><MessageSquare size={12} /> Répondre</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
