import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout, useSellerName } from "@/components/seller/dashboard/DashboardLayout";
import {
  Wallet, Package, ShoppingCart, Users, TrendingUp, TrendingDown, ArrowUpRight,
} from "lucide-react";

export const Route = createFileRoute("/dashboard/")({
  head: () => ({ meta: [{ title: "Tableau de bord — Amashia Seller" }, { name: "description", content: "Tableau de bord : votre espace vendeur Amashia pour gérer votre activité." }, { property: "og:title", content: "Tableau de bord — Amashia Seller" }, { property: "og:description", content: "Tableau de bord : votre espace vendeur Amashia pour gérer votre activité." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: DashboardOverview,
});

const STATS = [
  { icon: Wallet, color: "text-emerald-400 bg-emerald-500/10", label: "Revenu Total", value: "6,659 FCFA", trend: "+2.3%", up: true, sub: "La semaine dernière" },
  { icon: Package, color: "text-violet-400 bg-violet-500/10", label: "Produits Totaux", value: "893", trend: "+8.1%", up: true, sub: "Le mois dernier" },
  { icon: ShoppingCart, color: "text-blue-400 bg-blue-500/10", label: "Commandes Totales", value: "9,856", trend: "+2.3%", up: true, sub: "La semaine dernière" },
  { icon: Users, color: "text-primary bg-primary/10", label: "Clients Totaux", value: "4.6k", trend: "-16.6%", up: false, sub: "Le mois dernier" },
];

const ORDERS = [
  { id: "#12345", client: "Jean Dupont", product: "Chemise en coton", amount: "15,000 FCFA", status: "En attente", color: "bg-amber-500/20 text-amber-400", date: "10 Jan 2025" },
  { id: "#12344", client: "Marie Kamga", product: "Robe africaine", amount: "35,000 FCFA", status: "Préparation", color: "bg-blue-500/20 text-blue-400", date: "10 Jan 2025" },
  { id: "#12343", client: "Paul Nkomo", product: "Chaussures sport", amount: "45,000 FCFA", status: "Expédié", color: "bg-emerald-500/20 text-emerald-400", date: "09 Jan 2025" },
  { id: "#12342", client: "Sophie Mbarga", product: "Sac à main", amount: "22,000 FCFA", status: "Livré", color: "bg-emerald-600/20 text-emerald-300", date: "09 Jan 2025" },
];

function DashboardOverview() {
  const name = useSellerName();
  return (
    <DashboardLayout title={`Bonjour, ${name}! 👋`} subtitle="Gérez votre boutique facilement">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
        {STATS.map((s) => {
          const Icon = s.icon;
          const Trend = s.up ? TrendingUp : TrendingDown;
          return (
            <div key={s.label} className="bg-card border border-border rounded-2xl p-5">
              <div className="flex items-start justify-between mb-4">
                <div className={`w-11 h-11 rounded-xl grid place-items-center ${s.color}`}><Icon size={20} /></div>
                <span className={`flex items-center gap-1 text-xs font-semibold ${s.up ? "text-emerald-400" : "text-red-400"}`}>
                  <Trend size={12} /> {s.trend}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{s.label}</p>
              <p className="text-2xl font-extrabold mt-1">{s.value}</p>
              <p className="text-[11px] text-muted-foreground mt-2">{s.sub}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
        <div className="lg:col-span-2 bg-card border border-border rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold">Performance</h3>
              <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-primary" /> Vues de page</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Clics</span>
              </div>
            </div>
            <div className="flex bg-secondary rounded-full p-1 text-xs">
              <button className="px-3 py-1.5 rounded-full">Jour</button>
              <button className="px-3 py-1.5 rounded-full bg-primary text-white font-semibold">Semaine</button>
              <button className="px-3 py-1.5 rounded-full">Mois</button>
            </div>
          </div>
          <Chart />
        </div>
        <div className="bg-card border border-border rounded-2xl p-6">
          <h3 className="font-bold mb-4">Conversions</h3>
          <div className="grid place-items-center py-4">
            <div className="relative w-44 h-44">
              <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                <circle cx="50" cy="50" r="42" stroke="currentColor" strokeWidth="8" fill="none" className="text-secondary" />
                <circle cx="50" cy="50" r="42" stroke="currentColor" strokeWidth="8" fill="none" strokeLinecap="round" strokeDasharray={`${65.2 * 2.64} 264`} className="text-primary" />
              </svg>
              <div className="absolute inset-0 grid place-items-center text-center">
                <div>
                  <p className="text-3xl font-extrabold">65.2%</p>
                  <p className="text-[10px] text-muted-foreground">Clients fidèles</p>
                </div>
              </div>
            </div>
          </div>
          <div className="space-y-2 text-sm border-t border-border pt-4">
            <div className="flex justify-between"><span className="text-muted-foreground">Cette semaine</span><span className="font-bold">23.5k</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Semaine dernière</span><span className="font-bold">41.05k</span></div>
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl p-6">
        <div className="flex justify-between items-center mb-5">
          <h3 className="font-bold">Commandes récentes</h3>
          <a className="text-xs text-primary cursor-pointer flex items-center gap-1">Voir tout <ArrowUpRight size={12} /></a>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase text-muted-foreground border-b border-border">
                <th className="text-left font-semibold py-3">Commande</th>
                <th className="text-left font-semibold py-3">Client</th>
                <th className="text-left font-semibold py-3">Produit</th>
                <th className="text-left font-semibold py-3">Montant</th>
                <th className="text-left font-semibold py-3">Statut</th>
                <th className="text-left font-semibold py-3">Date</th>
              </tr>
            </thead>
            <tbody>
              {ORDERS.map((o) => (
                <tr key={o.id} className="border-b border-border/50 hover:bg-secondary/30 transition">
                  <td className="py-4 font-semibold">{o.id}</td>
                  <td>{o.client}</td>
                  <td className="text-muted-foreground">{o.product}</td>
                  <td className="font-semibold">{o.amount}</td>
                  <td><span className={`px-3 py-1 rounded-full text-xs font-semibold ${o.color}`}>{o.status}</span></td>
                  <td className="text-muted-foreground">{o.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  );
}

function Chart() {
  const points1 = [40, 55, 35, 70, 50, 80, 65, 90, 75, 85, 60, 95];
  const points2 = [20, 30, 25, 40, 30, 50, 35, 60, 45, 55, 40, 70];
  const months = ["Jan","Fév","Mar","Avr","Mai","Jun","Jul","Aoû","Sep","Oct","Nov","Déc"];
  const max = 100, w = 100, h = 60;
  const path = (pts: number[]) => pts.map((v, i) => `${i === 0 ? "M" : "L"}${(i / (pts.length - 1)) * w},${h - (v / max) * h}`).join(" ");
  return (
    <div className="relative h-64">
      <svg viewBox={`0 0 ${w} ${h + 10}`} preserveAspectRatio="none" className="w-full h-full">
        <defs>
          <linearGradient id="g1" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="oklch(0.7 0.2 45)" stopOpacity="0.4" /><stop offset="100%" stopColor="oklch(0.7 0.2 45)" stopOpacity="0" /></linearGradient>
        </defs>
        <path d={`${path(points1)} L${w},${h} L0,${h} Z`} fill="url(#g1)" />
        <path d={path(points1)} stroke="oklch(0.7 0.2 45)" strokeWidth="0.6" fill="none" />
        <path d={path(points2)} stroke="oklch(0.7 0.18 150)" strokeWidth="0.6" fill="none" />
      </svg>
      <div className="flex justify-between text-[10px] text-muted-foreground mt-2">
        {months.map((m) => <span key={m}>{m}</span>)}
      </div>
    </div>
  );
}
