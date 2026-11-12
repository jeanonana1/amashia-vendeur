import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/seller/dashboard/DashboardLayout";
import { ExternalLink, PackageCheck, Search, ShoppingBag, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { marketplaceProductUrl } from "@/lib/sellerProfile";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

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
type Order = { id: string; order_number: string; listing_id: string; customer_name: string; delivery_area: string | null; product_title: string; quantity: number; amount: number; status: string; paid: boolean; created_at: string };

const labels: Record<string, string> = { published: "Publiée", paused: "En pause", archived: "Archivée", pending: "En attente", preparing: "Préparation", shipped: "Expédiée", delivered: "Livrée", cancelled: "Annulée" };
const statusClass: Record<string, string> = { published: "bg-emerald-500/15 text-emerald-400", paused: "bg-amber-500/15 text-amber-400", archived: "bg-muted text-muted-foreground", pending: "bg-amber-500/15 text-amber-400", preparing: "bg-blue-500/15 text-blue-400", shipped: "bg-violet-500/15 text-violet-400", delivered: "bg-emerald-500/15 text-emerald-400", cancelled: "bg-destructive/15 text-destructive" };
const money = (value: number) => `${Number(value || 0).toLocaleString("fr-FR")} FCFA`;

function CommandesPage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const marketplace = supabase as any;
    const [{ data: listingData, error: listingError }, { data: orderData, error: orderError }] = await Promise.all([
      marketplace.from("seller_listings").select("id,product_id,title,price,status,published_at,images").eq("seller_id", user.id).order("published_at", { ascending: false }),
      marketplace.from("seller_orders").select("id,order_number,listing_id,customer_name,delivery_area,product_title,quantity,amount,status,paid,created_at").eq("seller_id", user.id).order("created_at", { ascending: false }),
    ]);
    if (listingError || orderError) toast.error(listingError?.message || orderError?.message || "Chargement impossible");
    setListings(listingData || []);
    setOrders(orderData || []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // Actualisation automatique toutes les 30 secondes pour voir les nouvelles commandes
    const timer = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  async function updateOrder(id: string, status: string) {
    const { error } = await (supabase as any).rpc("seller_set_order_status", { _item_id: id, _status: status });
    if (error) return toast.error(error.message);
    setOrders((current) => current.map((order) => order.id === id ? { ...order, status } : order));
    toast.success(`Commande ${labels[status].toLowerCase()}`);
  }

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

      <section className="rounded-xl border border-border bg-card p-4 sm:p-6"><h2 className="mb-5 font-bold">Ventes reçues</h2>{orders.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">Les commandes passées par les clients sur Amashia apparaîtront ici.</p> : <div className="grid gap-3">{orders.map((order) => <article key={order.id} className="flex flex-col gap-3 rounded-lg border border-border p-4 md:flex-row md:items-center"><div className="flex-1"><p className="font-bold">{order.order_number}</p><p className="text-sm font-medium">{order.product_title}</p><p className="text-xs text-muted-foreground">{order.customer_name}{order.delivery_area ? ` (${order.delivery_area})` : ""} · {order.quantity} article{order.quantity > 1 ? "s" : ""} · {new Date(order.created_at).toLocaleString("fr-FR")}</p></div><p className="font-bold text-primary">{money(order.amount)}</p><span className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass[order.status]}`}>{labels[order.status]}</span><select value={order.status} onChange={(e) => void updateOrder(order.id, e.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-xs"><option value="pending">En attente</option><option value="preparing">Préparation</option><option value="shipped">Expédiée</option><option value="delivered">Livrée</option><option value="cancelled">Annulée</option></select></article>)}</div>}</section>
    </DashboardLayout>
  );
}