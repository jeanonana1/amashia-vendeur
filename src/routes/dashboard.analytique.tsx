import { createFileRoute } from "@tanstack/react-router";
import { imgProps } from "@/lib/img";
import { useEffect, useMemo, useRef, useState } from "react";
import { DashboardLayout } from "@/components/seller/dashboard/DashboardLayout";
import { TrendingUp, Eye, ShoppingCart, Users, Package, Wallet, Percent, MousePointerClick, ArrowUpRight, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { money, num } from "@/lib/sellerStats";
import { Select } from "@/components/ui/app-select";

export const Route = createFileRoute("/dashboard/analytique")({
  head: () => ({
    meta: [
      { title: "Analytique — Amachia Seller" },
      { name: "description", content: "Suivez vues, conversions et évolution des ventes de votre boutique Amachia par jour, semaine, mois ou année." },
      { property: "og:title", content: "Analytique — Amachia Seller" },
      { property: "og:description", content: "Tableaux de bord et évolution des ventes de votre boutique Amachia." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AnalytiquePage,
});

type Grain = "day" | "week" | "month";
type Analytics = {
  revenue: number; orders: number; items: number; customers: number; avg_order: number;
  visits: number; visitors: number; cart_adds: number; grain: Grain;
  series: { at: string; revenue: number; orders: number; visits: number }[];
  sources: { source: string; visits: number }[];
  categories: { category: string; revenue: number; items: number }[];
  top_products: { title: string; image: string | null; views: number; carts: number; items: number; revenue: number }[];
};

const SOURCES: Record<string, string> = {
  search: "Recherche Amachia", category: "Pages catégories", home: "Page d'accueil", shop: "Votre boutique",
  product: "Autres fiches produit", external: "Autres sites (réseaux sociaux, liens…)", direct: "Accès direct", other: "Autres pages Amachia",
};
const CATEGORIES: Record<string, string> = { electronics: "Électronique", fashion: "Mode", "home-garden": "Maison & Jardin", beauty: "Beauté", "kitchen-home": "Cuisine & Maison", autre: "Autre" };
const PRESETS = [
  { id: "7", label: "7 jours", days: 7, grain: "day" as Grain },
  { id: "30", label: "30 jours", days: 30, grain: "day" as Grain },
  { id: "90", label: "3 mois", days: 90, grain: "week" as Grain },
  { id: "365", label: "12 mois", days: 365, grain: "month" as Grain },
];

const iso = (d: Date) => d.toISOString().slice(0, 10);
const DAY = 86_400_000;

function AnalytiquePage() {
  const today = useMemo(() => new Date(), []);
  const [preset, setPreset] = useState<string>("30");
  const [from, setFrom] = useState(iso(new Date(today.getTime() - 29 * DAY)));
  const [to, setTo] = useState(iso(today));
  const [grain, setGrain] = useState<Grain>("day");
  const [topAll, setTopAll] = useState(false);
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function applyPreset(id: string) {
    const p = PRESETS.find((x) => x.id === id);
    setPreset(id);
    if (!p) return;
    setFrom(iso(new Date(today.getTime() - (p.days - 1) * DAY)));
    setTo(iso(today));
    setGrain(p.grain);
  }

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const load = async () => {
      const { data, error } = await (supabase as any).rpc("seller_analytics", { _from: from, _to: to, _grain: grain });
      if (!alive) return;
      if (error) setError(error.message); else { setData(data as Analytics); setError(null); }
      setLoading(false);
    };
    void load();
    const t = window.setInterval(load, 60_000);
    return () => { alive = false; window.clearInterval(t); };
  }, [from, to, grain]);

  // les commandes passées avant le début du suivi des visites peuvent dépasser les visiteurs : plafond à 100 %
  const conv = data && data.visitors > 0 ? Math.min(100, (data.customers / data.visitors) * 100) : 0;
  const kpis = data ? [
    { icon: Wallet, label: "Chiffre d'affaires", value: money(data.revenue) },
    { icon: ShoppingCart, label: "Commandes", value: num(data.orders) },
    { icon: Package, label: "Articles vendus", value: num(data.items) },
    { icon: TrendingUp, label: "Panier moyen", value: money(data.avg_order) },
    { icon: Eye, label: "Visites", value: num(data.visits) },
    { icon: Users, label: "Visiteurs uniques", value: num(data.visitors) },
    { icon: MousePointerClick, label: "Ajouts au panier", value: num(data.cart_adds) },
    { icon: Percent, label: "Taux de conversion", value: `${conv.toFixed(1).replace(".", ",")} %` },
  ] : [];

  return (
    <DashboardLayout title="Analytique" subtitle="Les vraies performances de votre boutique sur Amachia">
      {/* Filtres */}
      <div className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-wrap rounded-full bg-secondary p-1 text-xs">
          {PRESETS.map((p) => (
            <button key={p.id} onClick={() => applyPreset(p.id)} className={`rounded-full px-3 py-1.5 ${preset === p.id ? "bg-primary font-semibold text-black" : "text-muted-foreground"}`}>{p.label}</button>
          ))}
        </div>
        <label className="text-xs text-muted-foreground">Du
          <input type="date" value={from} max={to} onChange={(e) => { setFrom(e.target.value); setPreset("custom"); }} className="mt-1 block rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground" />
        </label>
        <label className="text-xs text-muted-foreground">Au
          <input type="date" value={to} min={from} max={iso(today)} onChange={(e) => { setTo(e.target.value); setPreset("custom"); }} className="mt-1 block rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground" />
        </label>
        <label className="text-xs text-muted-foreground">Regrouper par
          <Select value={grain} onChange={(e) => setGrain(e.target.value as Grain)} className="mt-1 block rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground">
            <option value="day">Jour</option><option value="week">Semaine</option><option value="month">Mois</option>
          </Select>
        </label>
        {loading && <span className="text-xs text-muted-foreground">Mise à jour…</span>}
      </div>

      {error && !data && <p className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">Connexion impossible pour le moment. Nouvel essai automatique dans une minute…</p>}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(data ? kpis : Array.from({ length: 8 })).map((k, i) =>
          k ? (
            <div key={(k as (typeof kpis)[number]).label} className="rounded-2xl border border-border bg-card p-4">
              {(() => { const K = k as (typeof kpis)[number]; return <><K.icon size={17} className="mb-2 text-primary" /><p className="text-xl font-extrabold">{K.value}</p><p className="text-[11px] text-muted-foreground">{K.label}</p></>; })()}
            </div>
          ) : <div key={i} className="h-[98px] animate-pulse rounded-2xl border border-border bg-card" />,
        )}
      </div>

      <div className="mb-6 rounded-2xl border border-border bg-card p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-bold">Évolution des ventes</h3>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-primary" /> Chiffre d'affaires</span>
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-3 bg-sky-400" /> Visites</span>
          </div>
        </div>
        {data ? (
          <>
            <DataScroller data={data}><SalesChart data={data} /></DataScroller>
            <p className="mt-1 text-right text-[10px] text-muted-foreground sm:hidden">Faites glisser pour voir toute la période →</p>
          </>
        ) : <div className="h-64 animate-pulse rounded-xl bg-secondary/40" />}
      </div>

      <div className="mb-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-6">
          <h3 className="mb-4 font-bold">Sources de trafic</h3>
          {data && data.sources.length > 0 ? (
            <Bars rows={data.sources.map((s) => ({ label: SOURCES[s.source] ?? s.source, value: s.visits, text: `${num(s.visits)} visite${s.visits > 1 ? "s" : ""}` }))} />
          ) : <Empty text="Les origines de vos visiteurs apparaîtront ici." />}
        </div>
        <div className="rounded-2xl border border-border bg-card p-6">
          <h3 className="mb-4 font-bold">Ventes par catégorie</h3>
          {data && data.categories.length > 0 ? (
            <Bars rows={data.categories.map((c) => ({ label: CATEGORIES[c.category] ?? c.category, value: c.revenue, text: `${money(c.revenue)} · ${num(c.items)} art.` }))} />
          ) : <Empty text="Aucune vente sur cette période." />}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="font-bold">Top produits</h3>
          {data && data.top_products.length > 0 && <button type="button" onClick={() => setTopAll(true)} className="flex items-center gap-1 text-xs font-semibold text-primary sm:hidden">Tout voir <ArrowUpRight size={12} /></button>}
        </div>
        {data && data.top_products.length > 0 ? (
          <>
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:hidden">
            {data.top_products.slice(0, 5).map((p, i) => (
              <li key={i} className="flex items-center gap-3 rounded-xl border border-border/70 p-2.5">
                <div className="aspect-square h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-white">{p.image && <img {...imgProps(p.image, { width: 64 })} loading="lazy" alt="" className="h-full w-full object-cover" />}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold">{p.title}</p>
                    <p className="shrink-0 text-sm font-bold">{money(p.revenue)}</p>
                  </div>
                  <p className="truncate text-[11px] text-muted-foreground">{num(p.views)} vues · {num(p.carts)} paniers · {num(p.items)} vendus · {p.views ? `${Math.min(100, (p.items / p.views) * 100).toFixed(1).replace(".", ",")} %` : "—"}</p>
                </div>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto sm:block">
            <table className="amx-table min-w-[620px] text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase text-muted-foreground">
                  <th className="py-3 text-left font-semibold">Produit</th>
                  <th className="py-3 text-right font-semibold">Vues</th>
                  <th className="py-3 text-right font-semibold">Ajouts panier</th>
                  <th className="py-3 text-right font-semibold">Vendus</th>
                  <th className="py-3 text-right font-semibold">Conversion</th>
                  <th className="py-3 text-right font-semibold">Revenu</th>
                </tr>
              </thead>
              <tbody>
                {data.top_products.map((p, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-white">{p.image && <img {...imgProps(p.image, { width: 64 })} loading="lazy" alt="" className="h-full w-full object-cover" />}</div>
                        <span className="line-clamp-2 max-w-[260px]">{p.title}</span>
                      </div>
                    </td>
                    <td className="text-right">{num(p.views)}</td>
                    <td className="text-right">{num(p.carts)}</td>
                    <td className="text-right">{num(p.items)}</td>
                    <td className="text-right">{p.views ? `${Math.min(100, (p.items / p.views) * 100).toFixed(1).replace(".", ",")} %` : "—"}</td>
                    <td className="text-right font-semibold">{money(p.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        ) : <Empty text="Vos produits en ligne apparaîtront ici avec leurs statistiques." />}
      </div>
      {topAll && data && <TopProductsModal rows={data.top_products} onClose={() => setTopAll(false)} />}
    </DashboardLayout>
  );
}

function TopProductsModal({ rows, onClose }: { rows: Analytics["top_products"]; onClose: () => void }) {
  useEffect(() => { const o = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = o; }; }, []);
  const pct = (a: number, b: number) => (b ? `${Math.min(100, (a / b) * 100).toFixed(1).replace(".", ",")} %` : "—");
  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div className="app-select-sheet flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-border bg-card sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div><p className="font-bold">Tous les produits</p><p className="text-[11px] text-muted-foreground">{rows.length} produit{rows.length > 1 ? "s" : ""} · sur la période choisie</p></div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full bg-secondary" aria-label="Fermer"><X size={16} /></button>
        </div>
        <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto overscroll-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {rows.map((p, i) => (
            <li key={i} className="py-4">
              <div className="flex items-center gap-3">
                <span className="w-5 shrink-0 text-center text-xs font-bold text-muted-foreground">{i + 1}</span>
                <div className="aspect-square h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-white">{p.image && <img {...imgProps(p.image, { width: 64 })} loading="lazy" alt="" className="h-full w-full object-cover" />}</div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-semibold leading-snug">{p.title}</p>
                  <p className="mt-0.5 text-sm font-bold text-primary">{money(p.revenue)}</p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 divide-x divide-border overflow-hidden rounded-xl border border-border text-center">
                {[["Vues", num(p.views)], ["Ajouts panier", num(p.carts)], ["Vendus", num(p.items)], ["Taux d'ajout", pct(p.carts, p.views)], ["Conversion", pct(p.items, p.views)], ["Revenu / vente", p.items ? money(Math.round(p.revenue / p.items)) : "—"]].map(([l, v], k) => (
                  <div key={l} className={`min-w-0 px-1.5 py-2 ${k >= 3 ? "border-t border-border" : ""}`}>
                    <p className="truncate text-[10px] text-muted-foreground">{l}</p>
                    <p className="truncate text-xs font-bold tabular-nums">{v}</p>
                  </div>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">{text}</p>;
}

function Bars({ rows }: { rows: { label: string; value: number; text: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="mb-1 flex justify-between gap-3 text-xs"><span className="text-muted-foreground">{r.label}</span><span className="whitespace-nowrap font-semibold">{r.text}</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary" style={{ width: `${(r.value / max) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

function label(at: string, grain: Grain) {
  const d = new Date(at);
  if (grain === "month") return d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" }).replace(".", "");
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

/** Arrondit vers le haut à une valeur « ronde » (1, 2, 2,5, 5 × 10ⁿ) pour l'axe. */
function niceMax(v: number) {
  if (v <= 0) return 1000;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}
/** 100 000 -> « 100K », 1 500 000 -> « 1,5M ». */
function compact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0).replace(".", ",")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 ? 1 : 0).replace(".", ",")}K`;
  return String(Math.round(n));
}

/** Sur mobile, le graphique défile : on l'ouvre directement sur la période qui contient des données. */
function DataScroller({ data, children }: { data: Analytics; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || el.scrollWidth <= el.clientWidth + 4) return;
    const s = data.series;
    let i = -1;
    for (let k = s.length - 1; k >= 0; k--) if (s[k].revenue || s[k].visits || s[k].orders) { i = k; break; }
    if (i < 0) { el.scrollLeft = el.scrollWidth; return; }
    const axis = 52, inner = el.scrollWidth - axis;
    const xPx = axis + ((i + 0.5) / s.length) * inner;
    requestAnimationFrame(() => el.scrollTo({ left: Math.max(0, xPx - el.clientWidth * 0.6), behavior: "smooth" }));
  }, [data]);
  return (
    <div ref={ref} className="-mx-1 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]"><div className="min-w-[640px] sm:min-w-0">{children}</div></div>
  );
}

function SalesChart({ data }: { data: Analytics }) {
  const [hover, setHover] = useState<number | null>(null);
  const s = data.series;
  // 4 intervalles « ronds » : 0, 2K, 4K, 6K, 8K… (au moins 1 000 FCFA par graduation)
  const stepR = Math.max(1000, niceMax(Math.max(0, ...s.map((p) => p.revenue)) / 4));
  const maxR = stepR * 4;
  const maxV = Math.max(1, ...s.map((p) => p.visits));
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const w = 100, h = 60, bw = (w / Math.max(1, s.length)) * 0.6;
  const x = (i: number) => (i + 0.5) * (w / Math.max(1, s.length));
  const y = (v: number) => h - (v / maxR) * h;
  const empty = s.every((p) => !p.revenue && !p.visits);
  const step = Math.max(1, Math.ceil(s.length / 10));
  const hp = hover !== null ? s[hover] : null;
  return (
    <div className="relative h-72">
      <div className="flex h-[85%] gap-2">
        {/* Axe vertical : montants des ventes (FCFA) */}
        <div className="relative w-11 shrink-0 text-right text-[10px] text-muted-foreground">
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2 tabular-nums" style={{ top: `${(1 - t) * 100}%` }}>{compact(maxR * t)}</span>
          ))}
          <span className="absolute -left-1 top-1/2 -translate-y-1/2 -rotate-90 whitespace-nowrap text-[9px] uppercase tracking-wide opacity-70">FCFA</span>
        </div>
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-full min-w-0 flex-1 overflow-visible border-b border-l border-border"
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => { const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect(); setHover(Math.max(0, Math.min(s.length - 1, Math.floor(((e.clientX - r.left) / r.width) * s.length)))); }}>
          {ticks.slice(1).map((t) => <line key={t} x1="0" x2={w} y1={h * (1 - t)} y2={h * (1 - t)} stroke="currentColor" strokeWidth="0.15" strokeDasharray="0.8 0.8" className="text-border" />)}
          {s.map((p, i) => (
            <rect key={p.at} x={x(i) - bw / 2} y={y(p.revenue)} width={bw} height={h - y(p.revenue)} rx="0.6" className={hover === i ? "fill-primary" : "fill-primary/70"} />
          ))}
          <path d={s.map((p, i) => `${i ? "L" : "M"}${x(i)},${h - (p.visits / maxV) * (h - 4)}`).join(" ")} stroke="oklch(0.75 0.13 230)" strokeWidth="0.7" fill="none" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
      <div className="ml-[3.25rem] mt-2 flex justify-between text-[10px] text-muted-foreground">
        {s.map((p, i) => (i % step === 0 || i === s.length - 1 ? <span key={p.at}>{label(p.at, data.grain)}</span> : null))}
      </div>
      {empty && <p className="absolute inset-x-0 top-1/3 text-center text-sm text-muted-foreground">Pas encore d'activité sur cette période.</p>}
      {hp && (
        <div className="pointer-events-none absolute right-2 top-0 rounded-xl border border-border bg-background/95 px-3 py-2 text-xs shadow-lg">
          <p className="mb-1 font-semibold">{label(hp.at, data.grain)}</p>
          <p>Chiffre d'affaires : <b>{money(hp.revenue)}</b></p>
          <p>Commandes : <b>{hp.orders}</b></p>
          <p>Visites : <b>{hp.visits}</b></p>
        </div>
      )}
    </div>
  );
}
