import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { DashboardLayout } from "@/components/seller/dashboard/DashboardLayout";
import { Search, Star, X, MapPin, ShoppingBag, Wallet, Calendar } from "lucide-react";

export const Route = createFileRoute("/dashboard/clients")({
  head: () => ({ meta: [{ title: "Clients — Amashia Seller" }, { name: "description", content: "Clients : votre espace vendeur Amashia pour gérer votre activité." }, { property: "og:title", content: "Clients — Amashia Seller" }, { property: "og:description", content: "Clients : votre espace vendeur Amashia pour gérer votre activité." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: ClientsPage,
});

type Client = {
  name: string; email: string; city: string;
  orders: number; total: string; status: string; color: string;
  joined: string; lastOrder: string; avgBasket: string;
};

const CLIENTS: Client[] = [
  { name: "Jean Dupont", email: "jean@mail.com", city: "Douala", orders: 12, total: "245,000", status: "VIP", color: "bg-amber-500/20 text-amber-400", joined: "Mars 2024", lastOrder: "08 Jan 2025", avgBasket: "20,416" },
  { name: "Marie Kamga", email: "marie@mail.com", city: "Yaoundé", orders: 8, total: "180,000", status: "Fidèle", color: "bg-emerald-500/20 text-emerald-400", joined: "Mai 2024", lastOrder: "05 Jan 2025", avgBasket: "22,500" },
  { name: "Paul Nkomo", email: "paul@mail.com", city: "Douala", orders: 5, total: "95,000", status: "Régulier", color: "bg-blue-500/20 text-blue-400", joined: "Juillet 2024", lastOrder: "02 Jan 2025", avgBasket: "19,000" },
  { name: "Sophie Mbarga", email: "sophie@mail.com", city: "Bafoussam", orders: 3, total: "67,000", status: "Nouveau", color: "bg-violet-500/20 text-violet-400", joined: "Novembre 2024", lastOrder: "28 Déc 2024", avgBasket: "22,333" },
  { name: "Eric Talla", email: "eric@mail.com", city: "Garoua", orders: 1, total: "22,000", status: "Nouveau", color: "bg-violet-500/20 text-violet-400", joined: "Janvier 2025", lastOrder: "03 Jan 2025", avgBasket: "22,000" },
];

function ClientsPage() {
  const [selected, setSelected] = useState<Client | null>(null);
  const [q, setQ] = useState("");
  const filtered = CLIENTS.filter((c) => (c.name + c.email + c.city).toLowerCase().includes(q.toLowerCase()));

  return (
    <DashboardLayout title="Clients" subtitle="Gérez votre clientèle (les numéros restent privés)">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total clients", value: "4,652" },
          { label: "Nouveaux ce mois", value: "234" },
          { label: "Clients VIP", value: "89" },
          { label: "Taux fidélité", value: "65.2%" },
        ].map((s) => (
          <div key={s.label} className="bg-card border border-border rounded-2xl p-5">
            <p className="text-sm text-muted-foreground">{s.label}</p>
            <p className="text-2xl font-extrabold mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-card border border-border rounded-2xl p-6">
        <div className="flex items-center justify-between gap-4 mb-5">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un client..." className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-background border border-border text-sm focus:outline-none focus:border-primary" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase text-muted-foreground border-b border-border">
                <th className="text-left font-semibold py-3">Client</th>
                <th className="text-left font-semibold py-3">Ville</th>
                <th className="text-left font-semibold py-3">Commandes</th>
                <th className="text-left font-semibold py-3">Total dépensé</th>
                <th className="text-left font-semibold py-3">Statut</th>
                <th className="text-right font-semibold py-3">VIP</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const isVip = c.status === "VIP";
                return (
                  <tr key={c.email} onClick={() => setSelected(c)} className="border-b border-border/50 hover:bg-secondary/30 transition cursor-pointer">
                    <td className="py-4 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-gradient-primary grid place-items-center text-white font-bold text-sm">{c.name[0]}</div>
                      <div>
                        <p className="font-semibold">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.email}</p>
                      </div>
                    </td>
                    <td className="text-muted-foreground">{c.city}</td>
                    <td className="font-semibold">{c.orders}</td>
                    <td className="font-semibold">{c.total} FCFA</td>
                    <td><span className={`px-3 py-1 rounded-full text-xs font-semibold ${c.color}`}>{c.status}</span></td>
                    <td className="text-right">
                      <Star size={16} className={`inline ${isVip ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground mt-4">🔒 Les numéros de téléphone des clients ne sont jamais affichés.</p>
      </div>

      {selected && (
        <div className="fixed inset-0 bg-black/60 grid place-items-center z-50 p-4 overflow-y-auto" onClick={() => setSelected(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-card border border-border rounded-2xl p-6 w-full max-w-2xl space-y-5 my-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gradient-primary grid place-items-center text-white font-bold text-lg">{selected.name[0]}</div>
                <div>
                  <h3 className="text-xl font-bold flex items-center gap-2">
                    {selected.name}
                    {selected.status === "VIP" && <Star size={16} className="fill-amber-400 text-amber-400" />}
                  </h3>
                  <p className="text-xs text-muted-foreground">{selected.email}</p>
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="w-8 h-8 grid place-items-center rounded-lg hover:bg-secondary"><X size={16} /></button>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-secondary rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><MapPin size={12} /> Ville</p>
                <p className="font-bold">{selected.city}</p>
              </div>
              <div className="bg-secondary rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1">Statut</p>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${selected.color}`}>{selected.status}</span>
              </div>
              <div className="bg-secondary rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><ShoppingBag size={12} /> Commandes</p>
                <p className="font-bold">{selected.orders}</p>
              </div>
              <div className="bg-secondary rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Wallet size={12} /> Total dépensé</p>
                <p className="font-bold text-primary">{selected.total} FCFA</p>
              </div>
              <div className="bg-secondary rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Calendar size={12} /> Client depuis</p>
                <p className="font-bold">{selected.joined}</p>
              </div>
              <div className="bg-secondary rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1">Dernière commande</p>
                <p className="font-bold">{selected.lastOrder}</p>
              </div>
              <div className="bg-secondary rounded-xl p-4 md:col-span-2">
                <p className="text-xs text-muted-foreground mb-1">Panier moyen</p>
                <p className="font-bold">{selected.avgBasket} FCFA</p>
              </div>
            </div>

            <div className="rounded-xl p-3 bg-primary/5 border border-primary/20 text-xs text-muted-foreground">
              🔒 Pour la confidentialité, le numéro de téléphone du client n'est pas affiché.
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
