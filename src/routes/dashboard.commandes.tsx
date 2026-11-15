import { createFileRoute } from "@tanstack/react-router";
import { imgProps } from "@/lib/img";
import { useEffect, useMemo, useRef, useState } from "react";
import { DashboardLayout } from "@/components/seller/dashboard/DashboardLayout";
import { ExternalLink, PackageCheck, Search, ShoppingBag, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { marketplaceProductUrl } from "@/lib/sellerProfile";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ORDER_FIELDS, ORDER_STATUS, OrderDetailModal, OrderStatusTrack, colorName, type SellerOrderLine } from "@/components/seller/dashboard/OrderDetailModal";
import { ORDERS_SEEN_EVENT, dateTime } from "@/lib/sellerStats";
import { X } from "lucide-react";

export const Route = createFileRoute("/dashboard/commandes")({
  head: () => ({ meta: [
    { title: "Commandes Marketplace — Amashia Seller" },
    { name: "description", content: "Suivez les fiches Amashia publiées, leurs commandes et leurs ventes réelles." },
    { property: "og:title", content: "Commandes Marketplace — Amashia Seller" },
    { property: "og:description", content: "Suivi des publications et ventes réelles Amashia." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: CommandesPage,
});

type Listing = { id: string; product_id: string; title: string; price: number; status: string; published_at: string; images: string[] };
type Order = SellerOrderLine & { listing_id: string };

const labels: Record<string, string> = { published: "Publiée", paused: "En pause", archived: "Archivée", pending: "En attente", preparing: "Préparation", shipped: "Expédiée", delivered: "Livrée", cancelled: "Annulée" };
const statusClass: Record<string, string> = { published: "bg-emerald-500/15 text-emerald-400", paused: "bg-amber-500/15 text-amber-400", archived: "bg-muted text-muted-foreground", pending: "bg-amber-500/15 text-amber-400", preparing: "bg-blue-500/15 text-blue-400", shipped: "bg-violet-500/15 text-violet-400", delivered: "bg-emerald-500/15 text-emerald-400", cancelled: "bg-destructive/15 text-destructive" };
const money = (value: number) => `${Number(value || 0).toLocaleString("fr-FR")} FCFA`;

function CommandesPage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [openOrder, setOpenOrder] = useState<Order | null>(null);
  // récapitulatif affiché à l'arrivée sur la page
  const [summaryOpen, setSummaryOpen] = useState(false);
  const summaryShown = useRef(false);
  // date de la visite précédente : les commandes reçues depuis sont marquées « Nouveau »
  const [seenBefore, setSeenBefore] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    void (async () => {
      const { data } = await (supabase as any).rpc("mark_orders_seen");
      setSeenBefore((data as string | null) ?? null);
      window.dispatchEvent(new Event(ORDERS_SEEN_EVENT)); // le compteur du menu disparaît
    })();
  }, []);
  const isNew = (o: SellerOrderLine) => seenBefore !== undefined && (seenBefore === null || o.created_at > seenBefore);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const marketplace = supabase as any;
    const [{ data: listingData, error: listingError }, { data: orderData, error: orderError }] = await Promise.all([
      marketplace.from("seller_listings").select("id,product_id,title,price,status,published_at,images").eq("seller_id", user.id).order("published_at", { ascending: false }),
      marketplace.from("seller_orders").select(`${ORDER_FIELDS},listing_id`).eq("seller_id", user.id).order("created_at", { ascending: false }),
    ]);
    if (listingError || orderError) toast.error(listingError?.message || orderError?.message || "Chargement impossible");
    setListings(listingData || []);
    setOrders(orderData || []);
    setLoading(false);
    if (!summaryShown.current && !listingError && !orderError) { summaryShown.current = true; setSummaryOpen(true); }
  }

  useEffect(() => {
    void load();
    // Actualisation automatique toutes les 30 secondes pour voir les nouvelles commandes
    const timer = window.setInterval(() => void load(), 30_000);
    // statut changé par Amashia (admin) ou nouvelle commande : actualisation immédiate
    const ch = supabase.channel("seller-order-items")
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, () => void load())
      .subscribe();
    return () => { window.clearInterval(timer); void supabase.removeChannel(ch); };
  }, []);

  const rows = useMemo(() => listings.filter((listing) => listing.title.toLowerCase().includes(query.toLowerCase())).map((listing) => {
    const sales = orders.filter((order) => order.listing_id === listing.id && order.status !== "cancelled");
    return { listing, count: sales.length, amount: sales.reduce((sum, order) => sum + Number(order.amount), 0) };
  }), [listings, orders, query]);
  const revenue = orders.filter((order) => order.status !== "cancelled").reduce((sum, order) => sum + Number(order.amount), 0);

  return (
    <DashboardLayout title="Commandes" subtitle="Publications Amashia et ventes enregistrées en temps réel">
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4"><ShoppingBag className="mb-3 text-primary" /><p className="text-xs text-muted-foreground">Fiches publiées</p><p className="text-2xl font-bold">{listings.length}</p></div>
        <div className="rounded-xl border border-border bg-card p-4"><PackageCheck className="mb-3 text-emerald-400" /><p className="text-xs text-muted-foreground">Commandes réelles</p><p className="text-2xl font-bold">{orders.length}</p></div>
        <div className="col-span-2 rounded-xl border border-border bg-card p-4 md:col-span-1"><TrendingUp className="mb-3 text-blue-400" /><p className="text-xs text-muted-foreground">Montant des ventes</p><p className="text-2xl font-bold">{money(revenue)}</p></div>
      </div>

      <section className="mb-6 rounded-xl border border-border bg-card p-4 sm:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold">Fiches publiées</h2><p className="text-xs text-muted-foreground">Chaque lien ouvre la fiche réellement achetable.</p></div><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher une fiche" className="rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm" /></div></div>
        {loading ? <p className="py-10 text-center text-sm text-muted-foreground">Chargement…</p> : rows.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">Aucune fiche publiée pour le moment.</p> : <div className="grid gap-3">{rows.map(({ listing, count, amount }) => <article key={listing.id} className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-[52px_1fr_auto] sm:items-center"><div className="h-13 w-13 overflow-hidden rounded-md bg-secondary">{listing.images?.[0] && <img src={listing.images[0]} alt="" className="h-full w-full object-cover" />}</div><div className="min-w-0"><h3 className="truncate font-semibold">{listing.title}</h3><div className="mt-1 flex flex-wrap items-center gap-2 text-xs"><span className={`rounded-full px-2 py-0.5 font-semibold ${statusClass[listing.status]}`}>{labels[listing.status]}</span><span className="text-muted-foreground">{count} commande{count === 1 ? "" : "s"}</span><span className="font-semibold text-primary">{money(amount)}</span></div></div><Button asChild variant="outline" size="sm"><a href={marketplaceProductUrl(listing.id)} target="_blank" rel="noreferrer"><ExternalLink /> Voir la fiche</a></Button></article>)}</div>}
      </section>

      <section className="rounded-xl border border-border bg-card p-4 sm:p-6">
        <h2 className="mb-1 font-bold">Ventes reçues</h2>
        <p className="mb-5 text-xs text-muted-foreground">Touchez une commande pour voir son détail. Le statut est géré par Amashia et s'actualise ici en direct.</p>
        {orders.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Les commandes passées par les clients sur Amashia apparaîtront ici.</p>
        ) : (
          <div className="grid gap-3">
            {orders.map((order) => (
              <article
                key={order.id}
                onClick={() => setOpenOrder(order)}
                className="flex cursor-pointer flex-col gap-3 rounded-lg border border-border p-3 transition hover:border-primary/50 hover:bg-secondary/20 md:flex-row md:items-center md:p-4"
              >
                <div className="flex min-w-0 flex-1 gap-3">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-white">
                    {order.product_image ? <img {...imgProps(order.product_image, { width: 64 })} loading="lazy" alt="" className="h-full w-full object-cover" /> : <div className="grid h-full w-full place-items-center bg-secondary"><ShoppingBag size={18} className="text-muted-foreground" /></div>}
                  </div>
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-bold">
                      {order.order_number}
                      {isNew(order) && <span className="new-order-badge rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-black">Nouveau</span>}
                    </p>
                    <p className="line-clamp-1 text-sm font-medium">{order.product_title}</p>
                    {(order.color || order.options) && <p className="text-xs text-primary">{[order.color ? `Couleur : ${colorName(order.color)}` : "", order.options ?? ""].filter(Boolean).join(" · ")}</p>}
                    <p className="text-xs text-muted-foreground">{order.customer_name}{order.delivery_area ? ` (${order.delivery_area})` : ""} · {order.quantity} article{order.quantity > 1 ? "s" : ""}</p>
                    <p className="text-xs text-muted-foreground">{dateTime(order.created_at)}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 md:justify-end" onClick={(e) => e.stopPropagation()}>
                  <p className="font-bold text-primary">{money(order.amount)}</p>
                  <OrderStatusTrack status={order.status} compact />
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {openOrder && <OrderDetailModal line={openOrder} onClose={() => setOpenOrder(null)} onChanged={() => void load()} />}

      {summaryOpen && seenBefore !== undefined && (
        <OrdersSummary orders={orders} newOrders={new Set(orders.filter(isNew).map((o) => o.order_id)).size} onClose={() => setSummaryOpen(false)} />
      )}
    </DashboardLayout>
  );
}

/** Récapitulatif affiché à l'arrivée : nombre de commandes reçues et leur état. */
/** Nombre qui monte doucement de 0 à la valeur (≈ 0,9 s, ralenti à la fin). */
function useCountUp(target: number, ms = 900) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (target <= 0) { setV(0); return; }
    let raf = 0; const start = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      setV(Math.round(target * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

function OrdersSummary({ orders, newOrders, onClose }: { orders: SellerOrderLine[]; newOrders: number; onClose: () => void }) {
  // uniquement les commandes reçues aujourd'hui (pas le total depuis l'ouverture de la boutique)
  const today = orders.filter((o) => new Date(o.created_at).toDateString() === new Date().toDateString());
  const total = new Set(today.map((o) => o.order_id)).size;
  const count = (st: string) => today.filter((o) => o.status === st).length;
  const rows = [
    ["pending", "À traiter"], ["preparing", "En préparation"], ["shipped", "Expédiés"], ["delivered", "Livrés"], ["cancelled", "Annulés"],
  ] as const;
  const shownTotal = useCountUp(total);
  const shownNew = useCountUp(newOrders, 1100);
  return (
    <div className="summary-backdrop fixed inset-0 z-[110] grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className={`summary-card w-full max-w-sm rounded-2xl border bg-card p-6 text-center ${newOrders > 0 ? "summary-card--new border-primary/40" : "border-border"}`} onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="float-right -mr-2 -mt-2 grid h-8 w-8 place-items-center rounded-full hover:bg-secondary" aria-label="Fermer"><X size={16} /></button>
        <div className={`mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-primary/15 text-primary ${newOrders > 0 ? "summary-bag" : ""}`}><ShoppingBag size={26} /></div>
        <p className="text-sm text-muted-foreground">Vous avez reçu</p>
        <p className="text-5xl font-extrabold tabular-nums">{shownTotal}</p>
        <p className="mb-4 text-sm font-semibold">{total === 0 ? "commande aujourd'hui pour le moment" : `commande${total > 1 ? "s" : ""} aujourd'hui`}</p>
        {newOrders > 0 && (
          <p className="summary-new mb-3 rounded-full bg-primary/15 px-3 py-1.5 text-sm font-bold text-primary">
            ✨ {shownNew} nouvelle{newOrders > 1 ? "s" : ""} commande{newOrders > 1 ? "s" : ""} depuis votre dernière visite
          </p>
        )}
        <p className="mb-2 text-left text-xs font-medium text-muted-foreground">Articles du jour par statut</p>
        <div className="grid grid-cols-2 gap-2 text-left text-sm">
          {rows.map(([k, label]) => (
            <div key={k} className="flex items-center justify-between rounded-xl bg-secondary/50 px-3 py-2">
              <span className="text-muted-foreground">{label}</span>
              <span className={`font-bold ${k === "pending" && count(k) > 0 ? "text-amber-400" : ""}`}>{count(k)}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">Nombre d'articles par état</p>
        <button onClick={onClose} className="mt-5 w-full rounded-full bg-gradient-primary py-2.5 text-sm font-semibold text-black">Voir mes commandes</button>
      </div>
    </div>
  );
}
