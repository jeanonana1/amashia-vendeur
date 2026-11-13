import { useEffect, useMemo, useState } from "react";
import { imgProps } from "@/lib/img";
import { createFileRoute, Link } from "@tanstack/react-router";
import { DashboardLayout, useSellerName } from "@/components/seller/dashboard/DashboardLayout";
import {
  Wallet, Package, ShoppingCart, Users, TrendingUp, TrendingDown, ArrowUpRight, Eye, Radio, MousePointerClick, ExternalLink, Minus,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { MARKETPLACE_URL, dateTime, money, num, trend, useLiveVisitors, useSellerStats, type SellerStats } from "@/lib/sellerStats";
import { ORDER_FIELDS, OrderDetailModal, type SellerOrderLine } from "@/components/seller/dashboard/OrderDetailModal";

export const Route = createFileRoute("/dashboard/")({
  head: () => ({ meta: [{ title: "Tableau de bord — Amashia Seller" }, { name: "description", content: "Tableau de bord : votre espace vendeur Amashia pour gérer votre activité." }, { property: "og:title", content: "Tableau de bord — Amashia Seller" }, { property: "og:description", content: "Tableau de bord : votre espace vendeur Amashia pour gérer votre activité." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: DashboardOverview,
});

const PERIODS = [
  { days: 1, label: "Jour", sub: "Aujourd'hui", prev: "hier" },
  { days: 7, label: "Semaine", sub: "7 derniers jours", prev: "les 7 jours précédents" },
  { days: 30, label: "Mois", sub: "30 derniers jours", prev: "les 30 jours précédents" },
  { days: 365, label: "Année", sub: "12 derniers mois", prev: "l'année précédente" },
] as const;

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "En attente", cls: "bg-amber-500/20 text-amber-400" },
  preparing: { label: "Préparation", cls: "bg-blue-500/20 text-blue-400" },
  shipped: { label: "Expédiée", cls: "bg-violet-500/20 text-violet-400" },
  delivered: { label: "Livrée", cls: "bg-emerald-500/20 text-emerald-400" },
  cancelled: { label: "Annulée", cls: "bg-red-500/20 text-red-400" },
};



function DashboardOverview() {
  const name = useSellerName();
  const [days, setDays] = useState<number>(30);
  const period = PERIODS.find((p) => p.days === days)!;
  const { stats, loading, error } = useSellerStats(days);
  const live = useLiveVisitors(stats?.shop?.id);

  const [orders, setOrders] = useState<SellerOrderLine[] | null>(null);
  const [openOrder, setOpenOrder] = useState<SellerOrderLine | null>(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { data } = await (supabase as any).from("seller_orders")
        .select(ORDER_FIELDS)
        .order("created_at", { ascending: false }).limit(6);
      if (alive) setOrders((data as SellerOrderLine[]) || []);
    };
    void load();
    const t = window.setInterval(load, 30_000);
    return () => { alive = false; window.clearInterval(t); };
  }, []);

  const cards = stats ? [
    { icon: Wallet, color: "text-emerald-400 bg-emerald-500/10", label: "Chiffre d'affaires", value: money(stats.revenue), t: trend(stats.revenue, stats.revenue_prev) },
    { icon: ShoppingCart, color: "text-blue-400 bg-blue-500/10", label: "Commandes", value: num(stats.orders), t: trend(stats.orders, stats.orders_prev) },
    { icon: Users, color: "text-primary bg-primary/10", label: "Clients", value: num(stats.customers), t: trend(stats.customers, stats.customers_prev) },
    { icon: Package, color: "text-violet-400 bg-violet-500/10", label: "Produits en ligne", value: `${num(stats.products_online)} / ${num(stats.products)}`, t: undefined },
  ] : [];

  return (
    <DashboardLayout title={`Bonjour, ${name}! 👋`} subtitle="Voici l'activité réelle de votre boutique">
      {/* Période */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-full bg-secondary p-1 text-xs">
          {PERIODS.map((p) => (
            <button key={p.days} onClick={() => setDays(p.days)} className={`rounded-full px-3.5 py-1.5 transition ${days === p.days ? "bg-primary font-semibold text-white" : "text-muted-foreground hover:text-foreground"}`}>
              {p.label}
            </button>
          ))}
        </div>
        {stats?.shop && (
          <a href={`${MARKETPLACE_URL}/seller/${stats.shop.slug}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs text-primary hover:underline">
            Voir ma boutique sur Amashia <ExternalLink size={12} />
          </a>
        )}
      </div>

      {error && !stats && <p className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">Connexion impossible pour le moment. Nouvel essai automatique dans une minute…</p>}

      {/* Indicateurs */}
      <div className="mb-6 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
        {(loading && !stats ? Array.from({ length: 4 }) : cards).map((s, i) => {
          if (!s) return <div key={i} className="h-[138px] animate-pulse rounded-2xl border border-border bg-card" />;
          const c = s as (typeof cards)[number];
          const Icon = c.icon;
          return (
            <div key={c.label} className="rounded-2xl border border-border bg-card p-5">
              <div className="mb-4 flex items-start justify-between">
                <div className={`grid h-11 w-11 place-items-center rounded-xl ${c.color}`}><Icon size={20} /></div>
                {c.t !== undefined && <Trend value={c.t} />}
              </div>
              <p className="text-sm text-muted-foreground">{c.label}</p>
              <p className="mt-1 text-2xl font-extrabold">{c.value}</p>
              <p className="mt-2 text-[11px] text-muted-foreground">{period.sub}{c.t !== undefined ? ` · comparé à ${period.prev}` : ""}</p>
            </div>
          );
        })}
      </div>

      {/* Visites + en direct */}
      {stats && <VisitsSection stats={stats} live={live} period={period.sub} />}

      <div className="mb-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-6 lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-bold">Performance</h3>
              <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-primary" /> Visites</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Ajouts au panier</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-sky-400" /> Commandes</span>
              </div>
            </div>
            <div className="flex rounded-full bg-secondary p-1 text-xs">
              {PERIODS.map((p) => (
                <button key={p.days} onClick={() => setDays(p.days)} className={`rounded-full px-3 py-1.5 ${days === p.days ? "bg-primary font-semibold text-white" : ""}`}>{p.label}</button>
              ))}
            </div>
          </div>
          {stats ? <Chart stats={stats} /> : <div className="h-64 animate-pulse rounded-xl bg-secondary/40" />}
        </div>
        {stats ? <Conversions stats={stats} period={period.sub} /> : <div className="h-[380px] animate-pulse rounded-2xl border border-border bg-card" />}
      </div>

      {/* Commandes récentes */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="font-bold">Commandes récentes</h3>
          <Link to="/dashboard/commandes" className="flex items-center gap-1 text-xs text-primary">Voir tout <ArrowUpRight size={12} /></Link>
        </div>
        {orders === null ? (
          <div className="h-32 animate-pulse rounded-xl bg-secondary/40" />
        ) : orders.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Aucune commande pour le moment. Vos ventes sur Amashia apparaîtront ici.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase text-muted-foreground">
                  <th className="py-3 text-left font-semibold">Commande</th>
                  <th className="py-3 text-left font-semibold">Client</th>
                  <th className="py-3 text-left font-semibold">Produit</th>
                  <th className="py-3 text-left font-semibold">Montant</th>
                  <th className="py-3 text-left font-semibold">Statut</th>
                  <th className="py-3 text-left font-semibold">Date et heure</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const st = STATUS[o.status] ?? STATUS.pending;
                  return (
                    <tr key={o.id} onClick={() => setOpenOrder(o)} className="cursor-pointer border-b border-border/50 transition hover:bg-secondary/30" title="Voir le détail de la commande">
                      <td className="py-4 font-semibold">
                        <span className="flex items-center gap-2">
                          {o.product_image && <img {...imgProps(o.product_image, { width: 64 })} loading="lazy" alt="" className="h-8 w-8 rounded-md object-cover" />}
                          {o.order_number}
                        </span>
                      </td>
                      <td>{o.customer_name}</td>
                      <td className="max-w-[220px] text-muted-foreground">
                        <span className="line-clamp-1">{o.product_title}</span>
                        {(o.options || o.color) && <span className="block text-[11px]">{[o.color?.replace(/\s*#[0-9a-f]{3,8}$/i, ""), o.options].filter(Boolean).join(" · ")}</span>}
                      </td>
                      <td className="font-semibold">{money(Number(o.amount))}</td>
                      <td><span className={`rounded-full px-3 py-1 text-xs font-semibold ${st.cls}`}>{st.label}</span></td>
                      <td className="whitespace-nowrap text-muted-foreground">{dateTime(o.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {openOrder && <OrderDetailModal line={openOrder} onClose={() => setOpenOrder(null)} />}
    </DashboardLayout>
  );
}

function Trend({ value }: { value: number | null }) {
  if (value === null) return <span className="flex items-center gap-1 text-xs font-semibold text-emerald-400"><TrendingUp size={12} /> Nouveau</span>;
  if (Math.abs(value) < 0.05) return <span className="flex items-center gap-1 text-xs font-semibold text-muted-foreground"><Minus size={12} /> 0 %</span>;
  const up = value > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={`flex items-center gap-1 text-xs font-semibold ${up ? "text-emerald-400" : "text-red-400"}`}>
      <Icon size={12} /> {up ? "+" : ""}{value.toFixed(1).replace(".", ",")} %
    </span>
  );
}

function VisitsSection({ stats, live, period }: { stats: SellerStats; live: number; period: string }) {
  const t = trend(stats.visits, stats.visits_prev);
  return (
    <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div className="col-span-2 flex items-center gap-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5 lg:col-span-1">
        <span className="relative grid h-12 w-12 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-emerald-400">
          <Radio size={20} />
          {live > 0 && <span className="absolute right-1 top-1 h-2.5 w-2.5 animate-ping rounded-full bg-emerald-400" />}
        </span>
        <div>
          <p className="text-3xl font-extrabold">{live}</p>
          <p className="text-xs text-muted-foreground">{live > 1 ? "personnes sur votre boutique" : "personne sur votre boutique"} en ce moment</p>
        </div>
      </div>
      <Mini icon={Eye} label={`Visites · ${period}`} value={num(stats.visits)} extra={<Trend value={t} />} />
      <Mini icon={Users} label={`Visiteurs uniques · ${period}`} value={num(stats.visitors)} />
      <Mini icon={MousePointerClick} label="Visites aujourd'hui" value={num(stats.visits_today)} />
    </div>
  );
}

function Mini({ icon: Icon, label, value, extra }: { icon: typeof Eye; label: string; value: string; extra?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-2 flex items-center justify-between"><Icon size={16} className="text-primary" />{extra}</div>
      <p className="text-xl font-extrabold">{value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

function bucketLabel(iso: string, days: number) {
  const d = new Date(iso);
  if (days === 1) return `${d.getHours()}h`;
  if (days === 365) return d.toLocaleDateString("fr-FR", { month: "short" }).replace(".", "");
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

function Chart({ stats }: { stats: SellerStats }) {
  const [hover, setHover] = useState<number | null>(null);
  const s = stats.series;
  const max = Math.max(1, ...s.map((p) => Math.max(p.views, p.carts, p.orders)));
  const w = 100, h = 60;
  const x = (i: number) => (s.length <= 1 ? w / 2 : (i / (s.length - 1)) * w);
  const y = (v: number) => h - (v / max) * (h - 4);
  const path = (k: "views" | "carts" | "orders") => s.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p[k])}`).join(" ");
  const empty = s.every((p) => !p.views && !p.carts && !p.orders);
  const labelStep = Math.max(1, Math.ceil(s.length / 8));
  const hp = hover !== null ? s[hover] : null;

  return (
    <div className="relative h-64">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="h-[85%] w-full"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const i = Math.round(((e.clientX - r.left) / r.width) * (s.length - 1));
          setHover(Math.max(0, Math.min(s.length - 1, i)));
        }}
      >
        <defs>
          <linearGradient id="gv" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="oklch(0.7 0.2 45)" stopOpacity="0.35" /><stop offset="100%" stopColor="oklch(0.7 0.2 45)" stopOpacity="0" /></linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((g) => <line key={g} x1="0" x2={w} y1={h * g} y2={h * g} stroke="currentColor" strokeWidth="0.15" className="text-border" />)}
        <path d={`${path("views")} L${x(s.length - 1)},${h} L${x(0)},${h} Z`} fill="url(#gv)" />
        <path d={path("views")} stroke="oklch(0.7 0.2 45)" strokeWidth="0.7" fill="none" vectorEffect="non-scaling-stroke" />
        <path d={path("carts")} stroke="oklch(0.7 0.18 150)" strokeWidth="0.7" fill="none" vectorEffect="non-scaling-stroke" />
        <path d={path("orders")} stroke="oklch(0.75 0.13 230)" strokeWidth="0.7" fill="none" strokeDasharray="1.5 1" vectorEffect="non-scaling-stroke" />
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1="0" y2={h} stroke="currentColor" strokeWidth="0.2" className="text-muted-foreground" />}
      </svg>
      <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
        {s.map((p, i) => (i % labelStep === 0 || i === s.length - 1 ? <span key={p.at}>{bucketLabel(p.at, stats.days)}</span> : null))}
      </div>
      {empty && <p className="absolute inset-x-0 top-1/3 text-center text-sm text-muted-foreground">Pas encore d'activité sur cette période.</p>}
      {hp && (
        <div className="pointer-events-none absolute right-2 top-0 rounded-xl border border-border bg-background/95 px-3 py-2 text-xs shadow-lg">
          <p className="mb-1 font-semibold">{bucketLabel(hp.at, stats.days)}</p>
          <p>Visites : <b>{hp.views}</b></p>
          <p>Ajouts au panier : <b>{hp.carts}</b></p>
          <p>Commandes : <b>{hp.orders}</b> · {money(hp.revenue)}</p>
        </div>
      )}
    </div>
  );
}

function Conversions({ stats, period }: { stats: SellerStats; period: string }) {
  const f = stats.funnel;
  const rate = f.visitors > 0 ? Math.min(100, (f.buyers / f.visitors) * 100) : 0;
  const steps = useMemo(() => [
    { label: "Visiteurs", value: f.visitors },
    { label: "Ont vu un produit", value: f.product_viewers },
    { label: "Ont ajouté au panier", value: f.cart_adders },
    { label: "Ont commandé", value: f.buyers },
  ], [f]);
  const top = Math.max(1, ...steps.map((s) => s.value));
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <h3 className="font-bold">Conversions</h3>
      <p className="mb-2 text-[11px] text-muted-foreground">{period} · mis à jour chaque minute</p>
      <div className="grid place-items-center py-2">
        <div className="relative h-36 w-36">
          <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
            <circle cx="50" cy="50" r="42" stroke="currentColor" strokeWidth="8" fill="none" className="text-secondary" />
            <circle cx="50" cy="50" r="42" stroke="currentColor" strokeWidth="8" fill="none" strokeLinecap="round" strokeDasharray={`${rate * 2.64} 264`} className="text-primary transition-all" />
          </svg>
          <div className="absolute inset-0 grid place-items-center text-center">
            <div>
              <p className="text-2xl font-extrabold">{rate.toFixed(1).replace(".", ",")} %</p>
              <p className="text-[10px] text-muted-foreground">visiteurs → acheteurs</p>
            </div>
          </div>
        </div>
      </div>
      <div className="space-y-2.5 border-t border-border pt-4">
        {steps.map((s) => (
          <div key={s.label}>
            <div className="mb-1 flex justify-between text-xs"><span className="text-muted-foreground">{s.label}</span><span className="font-bold">{num(s.value)}</span></div>
            <div className="h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(s.value / top) * 100}%` }} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}
