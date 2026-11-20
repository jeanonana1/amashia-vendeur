import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/seller/dashboard/DashboardLayout";
import { Truck, Package, MapPin, Clock, CheckCircle2, Loader2, Inbox } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ORDER_FIELDS, ORDER_STATUS, OrderDetailModal, OrderStatusTrack, type SellerOrderLine } from "@/components/seller/dashboard/OrderDetailModal";

export const Route = createFileRoute("/dashboard/livraison")({
  head: () => ({ meta: [{ title: "Livraison — Amachia Seller" }, { name: "description", content: "Suivi en direct de la livraison de vos commandes." }, { property: "og:title", content: "Livraison — Amachia Seller" }, { property: "og:description", content: "Suivi en direct de la livraison de vos commandes." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: LivraisonPage,
});

/** Étapes communes aux 3 sites et à l'application livreur Prime. */
const STEPS = [
  { id: "pending", icon: Clock, color: "text-amber-400 bg-amber-500/10" },
  { id: "preparing", icon: Package, color: "text-blue-400 bg-blue-500/10" },
  { id: "shipped", icon: Truck, color: "text-violet-400 bg-violet-500/10" },
  { id: "delivered", icon: CheckCircle2, color: "text-emerald-400 bg-emerald-500/10" },
] as const;

type Order = { order_id: string; order_number: string; customer: string; area: string | null; status: string; created_at: string; items: number; first: SellerOrderLine };
const RANK: Record<string, number> = { cancelled: -1, pending: 0, preparing: 1, shipped: 2, delivered: 3 };

function LivraisonPage() {
  const [lines, setLines] = useState<SellerOrderLine[] | null>(null);
  const [open, setOpen] = useState<SellerOrderLine | null>(null);
  const [tab, setTab] = useState<string>("active");

  useEffect(() => {
    let alive = true;
    const load = () => (supabase as any).from("seller_orders").select(ORDER_FIELDS).order("created_at", { ascending: false }).limit(300)
      .then(({ data }: { data: SellerOrderLine[] | null }) => { if (alive) setLines(data ?? []); });
    void load();
    // le livreur récupère ou livre le colis : mise à jour en direct
    const ch = supabase.channel("seller-deliveries").on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, () => void load()).subscribe();
    const t = window.setInterval(load, 30_000);
    return () => { alive = false; void supabase.removeChannel(ch); window.clearInterval(t); };
  }, []);

  // une ligne par commande ; l'étape est celle de l'article le moins avancé
  const orders = useMemo<Order[]>(() => {
    const m = new Map<string, Order>();
    for (const l of lines ?? []) {
      const o = m.get(l.order_id);
      if (!o) m.set(l.order_id, { order_id: l.order_id, order_number: l.order_number, customer: l.customer_name, area: l.delivery_area, status: l.status, created_at: l.created_at, items: l.quantity, first: l });
      else {
        o.items += l.quantity;
        if (l.status !== "cancelled" && (o.status === "cancelled" || RANK[l.status] < RANK[o.status])) o.status = l.status;
      }
    }
    return [...m.values()];
  }, [lines]);

  const count = (s: string) => orders.filter((o) => o.status === s).length;
  const shown = orders.filter((o) => (tab === "active" ? ["pending", "preparing", "shipped"].includes(o.status) : o.status === tab));

  return (
    <DashboardLayout title="Livraison" subtitle="Suivi en direct de vos commandes, du vendeur jusqu'au client">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6">
        {STEPS.map((s) => {
          const Icon = s.icon;
          return (
            <button key={s.id} onClick={() => setTab(s.id)} className={`text-left bg-card border rounded-2xl p-4 sm:p-5 transition ${tab === s.id ? "border-primary" : "border-border hover:border-primary/50"}`}>
              <div className={`w-11 h-11 rounded-xl grid place-items-center mb-3 ${s.color}`}><Icon size={20} /></div>
              <p className="text-sm text-muted-foreground">{ORDER_STATUS[s.id].label}</p>
              <p className="text-2xl font-extrabold mt-1">{lines ? count(s.id) : "—"}</p>
            </button>
          );
        })}
      </div>

      <div className="bg-card border border-border rounded-2xl p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-bold">{tab === "active" ? "Commandes en cours" : ORDER_STATUS[tab]?.label}</h3>
          <div className="flex flex-wrap gap-2 text-xs">
            {[["active", "En cours"], ...STEPS.map((s) => [s.id, ORDER_STATUS[s.id].label]), ["cancelled", "Annulée"]].map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)} className={`rounded-full px-3 py-1.5 font-semibold ${tab === id ? "bg-primary text-black" : "bg-secondary text-muted-foreground"}`}>{label}</button>
            ))}
          </div>
        </div>
        {!lines ? (
          <div className="grid h-32 place-items-center"><Loader2 className="animate-spin text-primary" /></div>
        ) : shown.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground"><Inbox size={28} />Aucune commande à cette étape.</div>
        ) : (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
            {shown.map((o) => (
              <button key={o.order_id} onClick={() => setOpen(o.first)} className="w-full text-left border border-border rounded-2xl p-4 flex flex-col gap-3 sm:flex-row sm:items-center hover:border-primary/50 transition">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="truncate font-bold">#{o.order_number}</span>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${ORDER_STATUS[o.status]?.cls ?? ""}`}>{ORDER_STATUS[o.status]?.label ?? o.status}</span>
                  </div>
                  <p className="text-sm text-muted-foreground flex items-center gap-1.5 min-w-0"><MapPin size={12} className="shrink-0" /><span className="truncate">{o.customer} — {o.area || "Adresse non précisée"}</span></p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{o.items} article{o.items > 1 ? "s" : ""} · {new Date(o.created_at).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                </div>
                <OrderStatusTrack status={o.status} compact />
              </button>
            ))}
          </div>
        )}
        <p className="mt-4 text-xs text-muted-foreground">Le statut se met à jour tout seul quand le livreur Amachia récupère puis livre le colis.</p>
      </div>
      {open && <OrderDetailModal line={open} onClose={() => setOpen(null)} />}
    </DashboardLayout>
  );
}
