import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/seller/dashboard/DashboardLayout";
import { Star, Sparkles, TrendingUp, Eye, Plus, X, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/sponsoring")({
  head: () => ({ meta: [{ title: "Sponsoring — Amashia Seller" }, { name: "description", content: "Sponsoring : votre espace vendeur Amashia pour gérer votre activité." }, { property: "og:title", content: "Sponsoring — Amashia Seller" }, { property: "og:description", content: "Sponsoring : votre espace vendeur Amashia pour gérer votre activité." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: SponsoringPage,
});

const PLANS = [
  { id: "basic", name: "Basique", price: 5000, duration: 7, features: ["Mise en avant boutique", "Badge Sponsorisé", "Statistiques basiques"], popular: false },
  { id: "pro", name: "Pro", price: 15000, duration: 30, features: ["Top des résultats", "Badge Premium", "Stats avancées", "Support prioritaire"], popular: true },
  { id: "elite", name: "Élite", price: 45000, duration: 90, features: ["Page d'accueil", "Badge Élite", "Analytics complets", "Account manager"], popular: false },
];

type Campaign = { id: string; name: string; plan: string; price: number; impressions: number; clicks: number; startedAt: string; durationDays: number };

function SponsoringPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<typeof PLANS[number] | null>(null);
  const [productName, setProductName] = useState("");

  useEffect(() => { setCampaigns(JSON.parse(localStorage.getItem("sponsor-campaigns") || "[]")); }, []);
  function save(next: Campaign[]) { setCampaigns(next); localStorage.setItem("sponsor-campaigns", JSON.stringify(next)); }

  function launch() {
    if (!selectedPlan || !productName) return toast.error("Sélectionnez un produit");
    const c: Campaign = {
      id: crypto.randomUUID(), name: productName, plan: selectedPlan.name, price: selectedPlan.price,
      impressions: 0, clicks: 0, startedAt: new Date().toISOString(), durationDays: selectedPlan.duration,
    };
    save([c, ...campaigns]);
    toast.success(`Campagne ${selectedPlan.name} lancée — ${selectedPlan.price.toLocaleString()} FCFA débités`);
    setSelectedPlan(null); setProductName("");
  }
  function del(id: string) { if (confirm("Arrêter la campagne ?")) save(campaigns.filter((c) => c.id !== id)); }

  const totalSpent = campaigns.reduce((a, c) => a + c.price, 0);

  return (
    <DashboardLayout title="Sponsoring" subtitle="Boostez votre visibilité">
      <div className="bg-gradient-primary text-black rounded-2xl p-7 mb-6 flex flex-wrap items-center gap-6">
        <div className="w-16 h-16 rounded-2xl bg-white/20 grid place-items-center"><Sparkles size={28} /></div>
        <div className="flex-1 min-w-[200px]">
          <h2 className="text-2xl font-extrabold">Augmentez vos ventes jusqu'à 3x</h2>
          <p className="opacity-90 text-sm">Sponsorisez vos produits pour gagner en visibilité.</p>
        </div>
        <div className="text-right">
          <p className="text-sm opacity-80">Investi ce mois</p>
          <p className="text-2xl font-extrabold">{totalSpent.toLocaleString()} FCFA</p>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-5 mb-6">
        {PLANS.map((p) => (
          <div key={p.id} className={`bg-card border-2 rounded-2xl p-6 relative ${p.popular ? "border-primary" : "border-border"}`}>
            {p.popular && <span className="absolute -top-3 left-6 px-3 py-1 rounded-full bg-gradient-primary text-black text-xs font-bold">Populaire</span>}
            <h3 className="font-bold text-lg">{p.name}</h3>
            <p className="text-3xl font-extrabold mt-2">{p.price.toLocaleString()} <span className="text-base text-muted-foreground font-normal">FCFA</span></p>
            <p className="text-xs text-muted-foreground">{p.duration} jours</p>
            <ul className="space-y-2 my-5 text-sm">
              {p.features.map((f) => <li key={f} className="flex items-center gap-2"><Star size={14} className="text-primary" /> {f}</li>)}
            </ul>
            <button onClick={() => setSelectedPlan(p)} className={`w-full py-3 rounded-full font-semibold text-sm ${p.popular ? "bg-gradient-primary text-black" : "bg-secondary"}`}>Choisir</button>
          </div>
        ))}
      </div>

      <div className="bg-card border border-border rounded-2xl p-6">
        <h3 className="font-bold mb-5">Campagnes en cours</h3>
        {campaigns.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground text-sm">Aucune campagne. Choisissez un forfait pour commencer.</div>
        ) : (
          <div className="space-y-3">
            {campaigns.map((c) => {
              const elapsed = Math.floor((Date.now() - new Date(c.startedAt).getTime()) / 86400000);
              const remaining = Math.max(0, c.durationDays - elapsed);
              return (
                <div key={c.id} className="border border-border rounded-xl p-4 flex flex-wrap items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-primary grid place-items-center text-black"><Sparkles size={18} /></div>
                  <div className="flex-1 min-w-[200px]">
                    <p className="font-bold">{c.name}</p>
                    <p className="text-xs text-muted-foreground">Plan {c.plan} • {remaining} jours restants</p>
                  </div>
                  <div className="flex gap-6 text-sm">
                    <div><p className="text-xs text-muted-foreground flex items-center gap-1"><Eye size={12} /> Impressions</p><p className="font-bold">{c.impressions.toLocaleString()}</p></div>
                    <div><p className="text-xs text-muted-foreground flex items-center gap-1"><TrendingUp size={12} /> Clics</p><p className="font-bold">{c.clicks}</p></div>
                  </div>
                  <button onClick={() => del(c.id)} className="w-8 h-8 grid place-items-center rounded-lg bg-destructive/10 text-destructive"><Trash2 size={14} /></button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selectedPlan && (
        <div className="fixed inset-0 bg-black/60 grid place-items-center z-50 p-4" onClick={() => setSelectedPlan(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-card border border-border rounded-2xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold">Plan {selectedPlan.name}</h3>
              <button onClick={() => setSelectedPlan(null)} className="w-8 h-8 grid place-items-center rounded-lg hover:bg-secondary"><X size={16} /></button>
            </div>
            <div className="bg-secondary rounded-xl p-4 text-sm">
              <div className="flex justify-between mb-1"><span className="text-muted-foreground">Durée</span><span className="font-bold">{selectedPlan.duration} jours</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Coût</span><span className="font-bold text-primary">{selectedPlan.price.toLocaleString()} FCFA</span></div>
            </div>
            <div><label className="block text-sm mb-2 font-medium">Produit à sponsoriser *</label>
              <input value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="Nom du produit" className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm" />
            </div>
            <button onClick={launch} className="w-full py-3 rounded-full bg-gradient-primary text-black font-semibold">Confirmer et lancer</button>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
