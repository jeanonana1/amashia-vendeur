import { createFileRoute } from "@tanstack/react-router";
import { imgProps } from "@/lib/img";
import { useEffect, useMemo, useRef, useState } from "react";
import { DashboardLayout } from "@/components/seller/dashboard/DashboardLayout";
import { CalendarDays, ExternalLink, Filter, PackageCheck, Search, ShoppingBag, TrendingUp } from "lucide-react";
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

const labels: Record<string, string> = { published: "Publiée", paused: "En pause", archived: "Archivée", pending: "Commande reçue", preparing: "En préparation", shipped: "En cours de livraison", delivered: "Livrée", cancelled: "Annulée" };
const statusClass: Record<string, string> = { published: "bg-emerald-500/15 text-emerald-400", paused: "bg-amber-500/15 text-amber-400", archived: "bg-muted text-muted-foreground", pending: "bg-amber-500/15 text-amber-400", preparing: "bg-blue-500/15 text-blue-400", shipped: "bg-violet-500/15 text-violet-400", delivered: "bg-emerald-500/15 text-emerald-400", cancelled: "bg-destructive/15 text-destructive" };
const money = (value: number) => `${Number(value || 0).toLocaleString("fr-FR")} FCFA`;

function CommandesPage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [openOrder, setOpenOrder] = useState<Order | null>(null);
  // filtres des ventes : statut, période, recherche
  const [stFilter, setStFilter] = useState<string>("all");
  const [period, setPeriod] = useState<"all" | "today" | "7" | "30" | "custom">("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [orderQuery, setOrderQuery] = useState("");
  // récapitulatif affiché à l'arrivée sur la page
  const [summaryOpen, setSummaryOpen] = useState(false);
  const shownCount = useRef(0);
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
  // la fenêtre récapitulative ne s'ouvre que s'il y a de nouvelles commandes depuis la dernière visite
  // (et de nouveau si une autre commande arrive pendant que la page est ouverte)
  const newCount = useMemo(() => new Set(orders.filter(isNew).map((o) => o.order_id)).size, [orders, seenBefore]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (loading || seenBefore === undefined) return;
    if (newCount > shownCount.current) { shownCount.current = newCount; setSummaryOpen(true); }
  }, [newCount, loading, seenBefore]);

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
  }

  useEffect(() => {
    void load();
    // Actualisation automatique toutes les 30 secondes pour voir les nouvelles commandes
    const timer = window.setInterval(() => void load(), 10_000);
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
  const inPeriod = (iso: string) => {
    const d = new Date(iso); const now = new Date();
    if (period === "today") return d.toDateString() === now.toDateString();
    if (period === "7" || period === "30") { const start = new Date(now); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - (Number(period) - 1)); return d >= start; }
    if (period === "custom") {
      if (from && d < new Date(`${from}T00:00:00`)) return false;
      if (to && d > new Date(`${to}T23:59:59`)) return false;
    }
    return true;
  };
  const periodOrders = orders.filter((o) => inPeriod(o.created_at));
  const filtered = periodOrders.filter((o) => {
    if (stFilter !== "all" && o.status !== stFilter) return false;
    const q = orderQuery.trim().toLowerCase();
    return !q || [o.order_number, o.product_title, o.customer_name, o.delivery_area].some((v) => String(v ?? "").toLowerCase().includes(q));
  });
  const revenue = periodOrders.filter((order) => order.status !== "cancelled").reduce((sum, order) => sum + Number(order.amount), 0);
  const countBy = (st: string) => periodOrders.filter((o) => st === "all" || o.status === st).length;
  const PERIODS = [["all", "Tout"], ["today", "Aujourd'hui"], ["7", "7 jours"], ["30", "30 jours"], ["custom", "Dates"]] as const;
  const STATUSES = [["all", "Toutes"], ["pending", "Reçues"], ["preparing", "En préparation"], ["shipped", "En livraison"], ["delivered", "Livrées"], ["cancelled", "Annulées"]] as const;
  const periodLabel = period === "all" ? "depuis le début" : period === "today" ? "aujourd'hui" : period === "custom" ? (from || to ? `du ${from ? new Date(from).toLocaleDateString("fr-FR") : "début"} au ${to ? new Date(to).toLocaleDateString("fr-FR") : "aujourd'hui"}` : "sur les dates choisies") : `sur ${period} jours`;

  return (
    <DashboardLayout title="Commandes" subtitle="Publications Amashia et ventes enregistrées en temps réel">
      {/* Chiffre d'affaires en premier (surtout sur mobile), puis les deux autres indicateurs */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <div className="relative col-span-2 overflow-hidden rounded-2xl border border-primary/30 bg-card p-4 md:order-3 md:col-span-1">
          <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-primary/20 blur-2xl" />
          <TrendingUp className="relative mb-3 text-primary" />
          <p className="relative text-xs text-muted-foreground">Montant des ventes · {periodLabel}</p>
          <p className="relative mt-0.5 flex items-start gap-1 font-extrabold tabular-nums leading-none"><span className="text-3xl">{Math.round(revenue).toLocaleString("fr-FR")}</span><span className="mt-0.5 text-[10px] font-bold text-primary">FCFA</span></p>
        </div>
        <div className="min-w-0 rounded-2xl border border-border bg-card p-4 md:order-1"><ShoppingBag className="mb-3 text-primary" /><p className="text-xs text-muted-foreground">Fiches publiées</p><p className="text-2xl font-bold">{listings.length}</p></div>
        <div className="min-w-0 rounded-2xl border border-border bg-card p-4 md:order-2"><PackageCheck className="mb-3 text-emerald-400" /><p className="text-xs text-muted-foreground">Commandes réelles</p><p className="text-2xl font-bold">{new Set(periodOrders.map((o) => o.order_id)).size}</p></div>
      </div>

      {/* Filtres : période (avec sélecteur de dates), statut, recherche */}
      <section className="mb-6 rounded-2xl border border-border bg-card p-3 sm:p-4">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          <CalendarDays size={16} className="shrink-0 text-muted-foreground" />
          {PERIODS.map(([k, l]) => (
            <button key={k} onClick={() => setPeriod(k)} className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${period === k ? "bg-primary text-black" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>{l}</button>
          ))}
        </div>
        {period === "custom" && (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:max-w-md">
            <label className="min-w-0 text-[11px] text-muted-foreground">Du<input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="mt-1 block h-10 w-full min-w-0 rounded-xl border border-border bg-background px-3 text-sm text-foreground" /></label>
            <label className="min-w-0 text-[11px] text-muted-foreground">Au<input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="mt-1 block h-10 w-full min-w-0 rounded-xl border border-border bg-background px-3 text-sm text-foreground" /></label>
          </div>
        )}
        <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          <Filter size={16} className="shrink-0 text-muted-foreground" />
          {STATUSES.map(([k, l]) => (
            <button key={k} onClick={() => setStFilter(k)} className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${stFilter === k ? "border-primary bg-primary/12 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
              {l}<span className={`rounded-full px-1.5 text-[10px] ${stFilter === k ? "bg-primary text-black" : "bg-secondary"}`}>{countBy(k)}</span>
            </button>
          ))}
        </div>
        <div className="relative mt-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
          <input value={orderQuery} onChange={(e) => setOrderQuery(e.target.value)} placeholder="N° de commande, produit, client ou quartier" className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm" />
        </div>
      </section>

      <section className="mb-6 rounded-xl border border-border bg-card p-4 sm:p-6">
        <h2 className="mb-1 font-bold">Ventes reçues <span className="text-sm font-semibold text-muted-foreground">({filtered.length})</span></h2>
        <p className="mb-5 text-xs text-muted-foreground">Touchez une commande pour voir son détail. Le statut est géré par Amashia et s'actualise ici en direct.</p>
        {orders.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Les commandes passées par les clients sur Amashia apparaîtront ici.</p>
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Aucune commande ne correspond à ces filtres.
            <button onClick={() => { setStFilter("all"); setPeriod("all"); setOrderQuery(""); setFrom(""); setTo(""); }} className="mt-3 block w-full text-xs font-semibold text-primary">Réinitialiser les filtres</button>
          </div>
        ) : (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
            {filtered.map((order) => (
              <article
                key={order.id}
                onClick={() => setOpenOrder(order)}
                className="flex min-w-0 cursor-pointer flex-col gap-3 rounded-lg border border-border p-3 transition hover:border-primary/50 hover:bg-secondary/20 md:flex-row md:items-center md:p-4"
              >
                <div className="flex min-w-0 flex-1 gap-3">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-white">
                    {order.product_image ? <img {...imgProps(order.product_image, { width: 64 })} loading="lazy" alt="" className="h-full w-full object-cover" /> : <div className="grid h-full w-full place-items-center bg-secondary"><ShoppingBag size={18} className="text-muted-foreground" /></div>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-bold">
                      {order.order_number}
                      {isNew(order) && <span className="new-order-badge rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-black">Nouveau</span>}
                    </p>
                    <p className="line-clamp-1 text-sm font-medium">{order.product_title}</p>
                    {(order.color || order.options) && <p className="truncate text-xs text-primary">{[order.color ? `Couleur : ${colorName(order.color)}` : "", order.options ?? ""].filter(Boolean).join(" · ")}</p>}
                    <p className="truncate text-xs text-muted-foreground">{order.customer_name}{order.delivery_area ? ` (${order.delivery_area})` : ""} · {order.quantity} article{order.quantity > 1 ? "s" : ""}</p>
                    <p className="text-xs text-muted-foreground">{dateTime(order.created_at)}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3 md:border-0 md:pt-0 md:justify-end" onClick={(e) => e.stopPropagation()}>
                  <p className="font-bold text-primary">{money(order.amount)}</p>
                  <OrderStatusTrack status={order.status} compact />
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card p-4 sm:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold">Fiches publiées</h2><p className="text-xs text-muted-foreground">Chaque lien ouvre la fiche réellement achetable.</p></div><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher une fiche" className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm" /></div></div>
        {loading ? <p className="py-10 text-center text-sm text-muted-foreground">Chargement…</p> : rows.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">Aucune fiche publiée pour le moment.</p> : <div className="grid grid-cols-[minmax(0,1fr)] gap-3">{rows.map(({ listing, count, amount }) => <article key={listing.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3 sm:flex-nowrap"><div className="aspect-square h-14 w-14 shrink-0 overflow-hidden rounded-md bg-white">{listing.images?.[0] && <img {...imgProps(listing.images[0], { width: 64 })} loading="lazy" alt="" className="h-full w-full object-cover" />}</div><div className="min-w-0 flex-1"><h3 className="truncate font-semibold">{listing.title}</h3><div className="mt-1 flex flex-wrap items-center gap-2 text-xs"><span className={`rounded-full px-2 py-0.5 font-semibold ${statusClass[listing.status]}`}>{labels[listing.status]}</span><span className="text-muted-foreground">{count} commande{count === 1 ? "" : "s"}</span><span className="font-semibold text-primary">{money(amount)}</span></div></div><Button asChild variant="outline" size="sm" className="w-full sm:w-auto"><a href={marketplaceProductUrl(listing.id)} target="_blank" rel="noreferrer"><ExternalLink /> Voir la fiche</a></Button></article>)}</div>}
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
    ["pending", "Commande reçue"], ["preparing", "En préparation"], ["shipped", "En cours de livraison"], ["delivered", "Livrée"], ["cancelled", "Annulée"],
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
