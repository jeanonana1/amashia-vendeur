import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout } from "@/components/seller/dashboard/DashboardLayout";
import { Truck, Package, MapPin, Clock, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/dashboard/livraison")({
  head: () => ({ meta: [{ title: "Livraison — Amashia Seller" }, { name: "description", content: "Livraison : votre espace vendeur Amashia pour gérer votre activité." }, { property: "og:title", content: "Livraison — Amashia Seller" }, { property: "og:description", content: "Livraison : votre espace vendeur Amashia pour gérer votre activité." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: LivraisonPage,
});

const SHIPMENTS = [
  { id: "AMS-7821", client: "Jean Dupont", address: "Akwa, Douala", status: "En cours", icon: Truck, color: "bg-blue-500/20 text-blue-400", eta: "2h" },
  { id: "AMS-7820", client: "Marie Kamga", address: "Bonapriso, Douala", status: "Prêt", icon: Package, color: "bg-amber-500/20 text-amber-400", eta: "Aujourd'hui" },
  { id: "AMS-7819", client: "Paul Nkomo", address: "Bastos, Yaoundé", status: "Livré", icon: CheckCircle2, color: "bg-emerald-500/20 text-emerald-400", eta: "Hier" },
  { id: "AMS-7818", client: "Sophie Mbarga", address: "Bafoussam", status: "En attente", icon: Clock, color: "bg-violet-500/20 text-violet-400", eta: "Demain" },
];

function LivraisonPage() {
  return (
    <DashboardLayout title="Livraison" subtitle="Suivez vos expéditions">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: "En cours", value: "47", icon: Truck, color: "text-blue-400 bg-blue-500/10" },
          { label: "À expédier", value: "23", icon: Package, color: "text-amber-400 bg-amber-500/10" },
          { label: "Livrées", value: "9,650", icon: CheckCircle2, color: "text-emerald-400 bg-emerald-500/10" },
          { label: "En attente", value: "12", icon: Clock, color: "text-violet-400 bg-violet-500/10" },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="bg-card border border-border rounded-2xl p-5">
              <div className={`w-11 h-11 rounded-xl grid place-items-center mb-3 ${s.color}`}><Icon size={20} /></div>
              <p className="text-sm text-muted-foreground">{s.label}</p>
              <p className="text-2xl font-extrabold mt-1">{s.value}</p>
            </div>
          );
        })}
      </div>

      <div className="bg-card border border-border rounded-2xl p-6 mb-6">
        <h3 className="font-bold mb-5">Expéditions en cours</h3>
        <div className="space-y-3">
          {SHIPMENTS.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.id} className="border border-border rounded-2xl p-4 flex items-center gap-4 hover:border-primary/50 transition">
                <div className={`w-12 h-12 rounded-xl grid place-items-center ${s.color}`}><Icon size={20} /></div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="font-bold">{s.id}</span>
                    <span className={`px-3 py-0.5 rounded-full text-xs font-semibold ${s.color}`}>{s.status}</span>
                  </div>
                  <p className="text-sm text-muted-foreground flex items-center gap-2"><MapPin size={12} /> {s.client} — {s.address}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">ETA</p>
                  <p className="font-bold">{s.eta}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl p-6">
        <h3 className="font-bold mb-4">Transporteurs partenaires</h3>
        <div className="grid md:grid-cols-3 gap-4">
          {["Amashia Express", "DHL", "La Poste"].map((t) => (
            <div key={t} className="border border-border rounded-xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-primary grid place-items-center text-black"><Truck size={18} /></div>
              <div>
                <p className="font-semibold text-sm">{t}</p>
                <p className="text-xs text-muted-foreground">Disponible</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
