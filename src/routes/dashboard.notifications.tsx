import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout } from "@/components/seller/dashboard/DashboardLayout";
import { ShoppingCart, Star, Wallet, AlertCircle, MessageSquare, Bell, CheckCheck } from "lucide-react";

export const Route = createFileRoute("/dashboard/notifications")({
  head: () => ({ meta: [{ title: "Notifications — Amashia Seller" }, { name: "description", content: "Notifications : votre espace vendeur Amashia pour gérer votre activité." }, { property: "og:title", content: "Notifications — Amashia Seller" }, { property: "og:description", content: "Notifications : votre espace vendeur Amashia pour gérer votre activité." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: NotificationsPage,
});

const NOTIFS = [
  { icon: ShoppingCart, color: "bg-emerald-500/20 text-emerald-400", title: "Nouvelle commande #12345", desc: "Jean Dupont a commandé pour 45,000 FCFA", time: "Il y a 5 min", unread: true },
  { icon: Wallet, color: "bg-amber-500/20 text-amber-400", title: "Paiement reçu", desc: "Vous avez reçu 35,000 FCFA pour la commande #12344", time: "Il y a 1h", unread: true },
  { icon: Star, color: "bg-violet-500/20 text-violet-400", title: "Nouvel avis 5 étoiles", desc: "Marie Kamga a laissé un avis sur Robe Wax Élégante", time: "Il y a 3h", unread: true },
  { icon: AlertCircle, color: "bg-red-500/20 text-red-400", title: "Stock faible", desc: "Sac à main artisanal - 0 unités restantes", time: "Hier", unread: false },
  { icon: MessageSquare, color: "bg-blue-500/20 text-blue-400", title: "Nouveau message", desc: "Paul Nkomo vous a envoyé un message", time: "Hier", unread: false },
  { icon: Bell, color: "bg-primary/20 text-primary", title: "Mise à jour Amashia", desc: "Découvrez les nouvelles fonctionnalités", time: "2 jours", unread: false },
];

function NotificationsPage() {
  return (
    <DashboardLayout title="Notifications" subtitle="Restez informé de votre activité">
      <div className="bg-card border border-border rounded-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex bg-secondary rounded-full p-1 text-xs">
            {["Toutes", "Non lues", "Commandes", "Paiements", "Avis"].map((t, i) => (
              <button key={t} className={`px-4 py-1.5 rounded-full ${i === 0 ? "bg-primary text-black font-semibold" : ""}`}>{t}</button>
            ))}
          </div>
          <button className="text-sm text-primary flex items-center gap-2"><CheckCheck size={14} /> Tout marquer comme lu</button>
        </div>

        <div className="space-y-2">
          {NOTIFS.map((n, i) => {
            const Icon = n.icon;
            return (
              <div key={i} className={`flex items-start gap-4 p-4 rounded-2xl transition ${n.unread ? "bg-primary/5 border border-primary/20" : "hover:bg-secondary/30"}`}>
                <div className={`w-10 h-10 rounded-xl grid place-items-center shrink-0 ${n.color}`}><Icon size={18} /></div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-sm">{n.title}</p>
                    {n.unread && <span className="w-2 h-2 rounded-full bg-primary" />}
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">{n.desc}</p>
                  <p className="text-xs text-muted-foreground mt-1">{n.time}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
}
