import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { DashboardLayout } from "@/components/seller/dashboard/DashboardLayout";
import { TrendingUp, Eye, ShoppingCart, Users } from "lucide-react";

export const Route = createFileRoute("/dashboard/analytique")({
  head: () => ({
    meta: [
      { title: "Analytique — Amashia Seller" },
      { name: "description", content: "Suivez vues, conversions et évolution des ventes de votre boutique Amashia par jour, semaine, mois ou année." },
      { property: "og:title", content: "Analytique — Amashia Seller" },
      { property: "og:description", content: "Tableaux de bord et évolution des ventes de votre boutique Amashia." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AnalytiquePage,
});


function AnalytiquePage() {
  return (
    <DashboardLayout title="Analytique" subtitle="Analysez les performances de votre boutique">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
        {[
          { icon: Eye, label: "Vues totales", value: "245k", trend: "+12.5%", color: "text-blue-400 bg-blue-500/10" },
          { icon: Users, label: "Visiteurs uniques", value: "67k", trend: "+8.2%", color: "text-violet-400 bg-violet-500/10" },
          { icon: ShoppingCart, label: "Conversions", value: "3,245", trend: "+23.1%", color: "text-primary bg-primary/10" },
          { icon: TrendingUp, label: "Taux conversion", value: "4.8%", trend: "+1.2%", color: "text-emerald-400 bg-emerald-500/10" },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="bg-card border border-border rounded-2xl p-5">
              <div className="flex justify-between items-start mb-4">
                <div className={`w-11 h-11 rounded-xl grid place-items-center ${s.color}`}><Icon size={20} /></div>
                <span className="text-xs font-semibold text-emerald-400">{s.trend}</span>
              </div>
              <p className="text-sm text-muted-foreground">{s.label}</p>
              <p className="text-2xl font-extrabold mt-1">{s.value}</p>
            </div>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-2 gap-5 mb-6">
        <div className="bg-card border border-border rounded-2xl p-6">
          <SalesEvolution />
        </div>

        <div className="bg-card border border-border rounded-2xl p-6">
          <h3 className="font-bold mb-4">Sources de trafic</h3>
          <div className="space-y-4 mt-6">
            {[
              { label: "Recherche directe", pct: 45, color: "bg-primary" },
              { label: "Réseaux sociaux", pct: 28, color: "bg-blue-500" },
              { label: "Référents", pct: 18, color: "bg-violet-500" },
              { label: "Autres", pct: 9, color: "bg-emerald-500" },
            ].map((s) => (
              <div key={s.label}>
                <div className="flex justify-between text-sm mb-1.5">
                  <span>{s.label}</span><span className="font-semibold">{s.pct}%</span>
                </div>
                <div className="h-2 rounded-full bg-secondary overflow-hidden">
                  <div className={`h-full ${s.color}`} style={{ width: `${s.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl p-6">
        <h3 className="font-bold mb-4">Top produits</h3>
        <div className="space-y-3">
          {[
            { name: "Robe Wax Élégante", sales: 234, revenue: "8,190,000" },
            { name: "Chemise en Coton Bio", sales: 189, revenue: "2,835,000" },
            { name: "Boucles d'oreilles", sales: 156, revenue: "1,326,000" },
          ].map((p, i) => (
            <div key={p.name} className="flex items-center gap-4 p-3 rounded-xl hover:bg-secondary/30 transition">
              <span className="w-8 h-8 rounded-lg bg-primary/15 text-primary grid place-items-center font-bold">{i + 1}</span>
              <div className="flex-1">
                <p className="font-semibold">{p.name}</p>
                <p className="text-xs text-muted-foreground">{p.sales} ventes</p>
              </div>
              <p className="font-bold">{p.revenue} FCFA</p>
            </div>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}

type Grain = "day" | "week" | "month" | "year";

const DAY = 86400000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const fmt = (n: number) => n.toLocaleString("fr-FR");

/** Ventes pseudo-réelles déterministes par jour (stables entre les rendus). */
function dailySales(dateKey: string) {
  let h = 0;
  for (let i = 0; i < dateKey.length; i++) h = (h * 31 + dateKey.charCodeAt(i)) % 100000;
  const weekday = new Date(dateKey + "T00:00:00Z").getUTCDay();
  const weekendBoost = weekday === 0 || weekday === 6 ? 1.35 : 1;
  return Math.round((15000 + (h % 85000)) * weekendBoost);
}

function SalesEvolution() {
  const today = new Date();
  const [grain, setGrain] = useState<Grain>("month");
  const [from, setFrom] = useState(iso(new Date(today.getTime() - 364 * DAY)));
  const [to, setTo] = useState(iso(today));

  const { bars, total, avg } = useMemo(() => {
    const start = new Date(from + "T00:00:00Z");
    const end = new Date(to + "T00:00:00Z");
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return { bars: [], total: 0, avg: 0 };

    const buckets = new Map<string, { label: string; value: number }>();
    for (let t = start.getTime(); t <= end.getTime(); t += DAY) {
      const d = new Date(t);
      const key = iso(d);
      const v = dailySales(key);
      let bk = key;
      let label = d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", timeZone: "UTC" });
      if (grain === "week") {
        const monday = new Date(t - ((d.getUTCDay() + 6) % 7) * DAY);
        bk = iso(monday);
        label = `S. ${monday.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", timeZone: "UTC" })}`;
      } else if (grain === "month") {
        bk = key.slice(0, 7);
        label = d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit", timeZone: "UTC" });
      } else if (grain === "year") {
        bk = key.slice(0, 4);
        label = key.slice(0, 4);
      }
      const cur = buckets.get(bk);
      if (cur) cur.value += v;
      else buckets.set(bk, { label, value: v });
    }
    const bars = [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
    const total = bars.reduce((s, b) => s + b.value, 0);
    return { bars, total, avg: bars.length ? Math.round(total / bars.length) : 0 };
  }, [from, to, grain]);

  const max = Math.max(1, ...bars.map((b) => b.value));

  function applyPreset(g: Grain) {
    setGrain(g);
    const days = g === "day" ? 30 : g === "week" ? 84 : g === "month" ? 364 : 1095;
    setFrom(iso(new Date(today.getTime() - days * DAY)));
    setTo(iso(today));
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h3 className="font-bold">Évolution des ventes</h3>
        <div className="inline-flex rounded-full bg-secondary p-1 text-xs font-semibold">
          {([["day", "Jour"], ["week", "Semaine"], ["month", "Mois"], ["year", "Année"]] as [Grain, string][]).map(([g, l]) => (
            <button key={g} onClick={() => applyPreset(g)} className={`px-3 py-1.5 rounded-full transition ${grain === g ? "bg-gradient-primary text-white" : "text-muted-foreground hover:text-foreground"}`}>{l}</button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-5">
        <label className="text-xs">
          <span className="block text-muted-foreground mb-1">Du</span>
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="bg-secondary rounded-xl px-3 py-2 text-xs border border-border" />
        </label>
        <label className="text-xs">
          <span className="block text-muted-foreground mb-1">Au</span>
          <input type="date" value={to} min={from} max={iso(today)} onChange={(e) => setTo(e.target.value)} className="bg-secondary rounded-xl px-3 py-2 text-xs border border-border" />
        </label>
        <div className="ml-auto text-right">
          <p className="text-[11px] text-muted-foreground">Total période</p>
          <p className="font-extrabold">{fmt(total)} FCFA</p>
          <p className="text-[11px] text-muted-foreground">Moy. {fmt(avg)} FCFA</p>
        </div>
      </div>

      {bars.length === 0 ? (
        <p className="text-sm text-muted-foreground py-10 text-center">Sélectionnez une période valide.</p>
      ) : (
        <div className="overflow-x-auto">
          <div className="flex items-end gap-1.5 h-56 min-w-full" style={{ minWidth: bars.length > 24 ? bars.length * 14 : undefined }}>
            {bars.map((b, i) => (
              <div
                key={i}
                title={`${b.label} · ${fmt(b.value)} FCFA`}
                className="flex-1 min-w-[6px] bg-gradient-to-t from-primary to-primary-glow rounded-t-md hover:opacity-80 transition"
                style={{ height: `${Math.max(4, (b.value / max) * 100)}%` }}
              />
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground mt-2 gap-2">
            <span>{bars[0]!.label}</span>
            {bars.length > 2 && <span>{bars[Math.floor(bars.length / 2)]!.label}</span>}
            <span>{bars[bars.length - 1]!.label}</span>
          </div>
        </div>
      )}
    </div>
  );
}

