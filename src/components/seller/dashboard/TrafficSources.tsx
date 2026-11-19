import { useEffect, useMemo, useState } from "react";
import { Link2, Copy, Check, Megaphone, Info } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { MARKETPLACE_URL, money, num } from "@/lib/sellerStats";
import { Select } from "@/components/ui/app-select";

/**
 * Sources de trafic et campagnes publicitaires (Facebook / Instagram / TikTok Ads…).
 * Données réelles : chaque visite, ajout au panier et commande est rattaché à la
 * provenance du visiteur (liens utm, identifiants de clic des régies, site d'origine).
 */

type Row = { channel: string; visitors: number; visits: number; carts: number; orders: number; units: number; revenue: number; paid_visitors: number; paid_orders: number };
type Camp = { channel: string; campaign: string; visitors: number; visits: number; carts: number; orders: number; revenue: number };
type Data = { channels: Row[]; campaigns: Camp[] };

const CH: Record<string, { label: string; color: string; icon: string }> = {
  facebook: { label: "Facebook", color: "#1877F2", icon: "f" },
  instagram: { label: "Instagram", color: "#E1306C", icon: "◎" },
  tiktok: { label: "TikTok", color: "#25F4EE", icon: "♪" },
  google: { label: "Google", color: "#34A853", icon: "G" },
  whatsapp: { label: "WhatsApp", color: "#25D366", icon: "✆" },
  youtube: { label: "YouTube", color: "#FF0000", icon: "▶" },
  x: { label: "X (Twitter)", color: "#A1A1AA", icon: "𝕏" },
  snapchat: { label: "Snapchat", color: "#FFFC00", icon: "👻" },
  email: { label: "E-mail", color: "#60A5FA", icon: "@" },
  sms: { label: "SMS", color: "#A78BFA", icon: "✉" },
  autre_site: { label: "Autres sites", color: "#94A3B8", icon: "↗" },
  direct: { label: "Direct / Amashia", color: "#FF6800", icon: "A" },
};
const ch = (c: string) => CH[c] ?? CH.autre_site;
const rate = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %` : "—");

const EMPTY: Row = { channel: "", visitors: 0, visits: 0, carts: 0, orders: 0, units: 0, revenue: 0, paid_visitors: 0, paid_orders: 0 };
function sum(rows: Row[]): Row {
  return rows.reduce((t, r) => ({ ...t, visitors: t.visitors + r.visitors, visits: t.visits + r.visits, carts: t.carts + r.carts, orders: t.orders + r.orders, units: t.units + r.units, revenue: t.revenue + Number(r.revenue), paid_visitors: t.paid_visitors + r.paid_visitors, paid_orders: t.paid_orders + r.paid_orders }), { ...EMPTY });
}

export function TrafficSources({ days, period }: { days: number; period: string }) {
  const [data, setData] = useState<Data | null>(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { data } = await (supabase as any).rpc("seller_traffic_sources", { _days: days });
      if (alive) setData((data as Data) ?? { channels: [], campaigns: [] });
    };
    setData(null);
    void load();
    const t = window.setInterval(load, 60_000);
    return () => { alive = false; window.clearInterval(t); };
  }, [days]);

  const rows = data?.channels ?? [];
  const meta = sum(rows.filter((r) => r.channel === "facebook" || r.channel === "instagram"));
  const tiktok = sum(rows.filter((r) => r.channel === "tiktok"));
  const total = sum(rows);

  return (
    <div className="mb-6 space-y-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <AdsCard title="Facebook & Instagram Ads" color="#1877F2" badge="Meta" r={meta} period={period} loading={!data} />
        <AdsCard title="TikTok Ads" color="#25F4EE" badge="TikTok" r={tiktok} period={period} loading={!data} />
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 sm:p-6">
        <div className="mb-4">
          <h3 className="font-bold">Sources de trafic</h3>
          <p className="text-xs text-muted-foreground">D'où viennent vos visiteurs et lesquels achètent · {period}</p>
        </div>
        {!data ? (
          <div className="h-40 animate-pulse rounded-xl bg-secondary/40" />
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Aucune visite sur cette période.</p>
        ) : (
          <>
          {/* Mobile : une carte par source, chiffres séparés par des traits */}
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:hidden">
            {rows.map((r) => {
              const c = ch(r.channel);
              const share = total.visitors ? (r.visitors / total.visitors) * 100 : 0;
              return (
                <li key={r.channel} className="overflow-hidden rounded-xl border border-border">
                  <div className="flex items-center gap-2.5 px-3 py-2.5">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-bold text-black" style={{ background: c.color }}>{c.icon}</span>
                    <div className="min-w-0 flex-1">
                      <p className="flex min-w-0 items-center gap-1.5 text-sm font-semibold"><span className="truncate">{c.label}</span>{r.paid_visitors > 0 && <span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">Pub</span>}</p>
                      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full" style={{ width: `${share}%`, background: c.color }} /></div>
                    </div>
                    <span className="shrink-0 text-xs font-bold text-emerald-400">{rate(r.orders, r.visitors)}</span>
                  </div>
                  <div className="grid grid-cols-3 divide-x divide-border border-t border-border text-center">
                    {[["Visiteurs", num(r.visitors)], ["Visites", num(r.visits)], ["Ajouts panier", num(r.carts)]].map(([l, v]) => (
                      <div key={l} className="min-w-0 px-1.5 py-2"><p className="truncate text-[10px] text-muted-foreground">{l}</p><p className="truncate text-sm font-bold tabular-nums">{v}</p></div>
                    ))}
                  </div>
                  <div className="grid grid-cols-[1fr_2fr] divide-x divide-border border-t border-border text-center">
                    <div className="min-w-0 px-1.5 py-2"><p className="truncate text-[10px] text-muted-foreground">Commandes</p><p className="truncate text-sm font-bold tabular-nums">{num(r.orders)}</p></div>
                    <div className="min-w-0 px-1.5 py-2"><p className="truncate text-[10px] text-muted-foreground">Ventes</p><p className="truncate text-sm font-bold tabular-nums">{money(Number(r.revenue))}</p></div>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="hidden overflow-x-auto sm:block">
            <table className="amx-table min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="pb-3 font-medium">Source</th>
                  <th className="pb-3 text-right font-medium">Visiteurs</th>
                  <th className="pb-3 text-right font-medium">Visites</th>
                  <th className="pb-3 text-right font-medium">Ajouts panier</th>
                  <th className="pb-3 text-right font-medium">Commandes</th>
                  <th className="pb-3 text-right font-medium">Conversion</th>
                  <th className="pb-3 text-right font-medium">Ventes</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const c = ch(r.channel);
                  const share = total.visitors ? (r.visitors / total.visitors) * 100 : 0;
                  return (
                    <tr key={r.channel} className="border-t border-border">
                      <td className="py-3">
                        <div className="flex items-center gap-2.5">
                          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-bold text-black" style={{ background: c.color }}>{c.icon}</span>
                          <div className="min-w-0">
                            <p className="font-medium">{c.label}{r.paid_visitors > 0 && <span className="ml-1.5 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">Pub</span>}</p>
                            <div className="mt-1 h-1 w-28 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full" style={{ width: `${share}%`, background: c.color }} /></div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 text-right font-semibold">{num(r.visitors)}</td>
                      <td className="py-3 text-right">{num(r.visits)}</td>
                      <td className="py-3 text-right">{num(r.carts)}</td>
                      <td className="py-3 text-right">{num(r.orders)}</td>
                      <td className="py-3 text-right font-semibold text-emerald-400">{rate(r.orders, r.visitors)}</td>
                      <td className="py-3 text-right">{money(Number(r.revenue))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        <div className="rounded-2xl border border-border bg-card p-6 lg:col-span-3">
          <h3 className="flex items-center gap-2 font-bold"><Megaphone size={16} className="text-primary" /> Mes campagnes</h3>
          <p className="mb-4 text-xs text-muted-foreground">Résultats de chaque campagne suivie avec un lien de campagne · {period}</p>
          {!data ? (
            <div className="h-28 animate-pulse rounded-xl bg-secondary/40" />
          ) : data.campaigns.length === 0 ? (
            <p className="rounded-xl bg-secondary/40 p-4 text-sm text-muted-foreground">Aucune campagne suivie sur cette période. Créez un lien de campagne (à droite) et utilisez-le comme lien de destination de votre publicité Facebook, Instagram ou TikTok : ses visites, paniers et ventes apparaîtront ici.</p>
          ) : (
            <div className="space-y-2.5">
              {data.campaigns.map((c) => (
                <div key={`${c.channel}-${c.campaign}`} className="rounded-xl border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="min-w-0 truncate text-sm font-semibold">{c.campaign}</p>
                    <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold text-black" style={{ background: ch(c.channel).color }}>{ch(c.channel).label}</span>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-center text-[11px] text-muted-foreground sm:grid-cols-5">
                    <div><p className="text-sm font-bold text-foreground">{num(c.visitors)}</p>visiteurs</div>
                    <div><p className="text-sm font-bold text-foreground">{num(c.carts)}</p>paniers</div>
                    <div><p className="text-sm font-bold text-foreground">{num(c.orders)}</p>achats</div>
                    <div><p className="text-sm font-bold text-emerald-400">{rate(c.orders, c.visitors)}</p>conversion</div>
                    <div><p className="whitespace-nowrap text-sm font-bold text-foreground">{money(Number(c.revenue))}</p>ventes</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <CampaignLink />
      </div>
    </div>
  );
}

function AdsCard({ title, color, badge, r, period, loading }: { title: string; color: string; badge: string; r: Row; period: string; loading: boolean }) {
  if (loading) return <div className="h-[196px] animate-pulse rounded-2xl border border-border bg-card" />;
  const stats = [
    { label: "Visiteurs", value: num(r.visitors) },
    { label: "Visites", value: num(r.visits) },
    { label: "Ajouts au panier", value: num(r.carts) },
    { label: "Achats", value: num(r.orders) },
    { label: "Conversion", value: rate(r.orders, r.visitors), hi: true },
    { label: "Ventes", value: money(r.revenue) },
  ];
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-5">
      <div className="absolute inset-x-0 top-0 h-1" style={{ background: color }} />
      <div className="mb-4 flex items-start justify-between gap-2">
        <div>
          <h3 className="font-bold">{title}</h3>
          <p className="text-[11px] text-muted-foreground">{period}{r.visitors > 0 ? ` · dont ${num(r.paid_visitors)} visiteur${r.paid_visitors > 1 ? "s" : ""} via publicité` : ""}</p>
        </div>
        <span className="rounded-full px-2.5 py-0.5 text-[10px] font-bold text-black" style={{ background: color }}>{badge}</span>
      </div>
      {r.visitors === 0 && r.orders === 0 ? (
        <p className="rounded-xl bg-secondary/40 p-3 text-xs text-muted-foreground">Aucune visite venue de {badge === "Meta" ? "Facebook ou Instagram" : "TikTok"} sur cette période. Les visites de vos publicités apparaissent ici automatiquement ; pour suivre chaque campagne séparément, utilisez un lien de campagne.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 min-[400px]:grid-cols-3 sm:gap-3">
          {stats.map((s) => (
            <div key={s.label} className="rounded-xl bg-secondary/40 p-2.5">
              <p className={`whitespace-nowrap text-[15px] font-extrabold leading-tight sm:text-lg ${s.hi ? "text-emerald-400" : ""}`}>{s.value}</p>
              <p className="text-[10px] text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const PLATFORMS = [
  { id: "fb-ads", label: "Facebook Ads", source: "facebook", medium: "paid" },
  { id: "ig-ads", label: "Instagram Ads", source: "instagram", medium: "paid" },
  { id: "tt-ads", label: "TikTok Ads", source: "tiktok", medium: "paid" },
  { id: "fb-post", label: "Publication Facebook (gratuite)", source: "facebook", medium: "social" },
  { id: "tt-post", label: "Vidéo TikTok (gratuite)", source: "tiktok", medium: "social" },
  { id: "wa", label: "WhatsApp (statut, groupe)", source: "whatsapp", medium: "social" },
] as const;

function CampaignLink() {
  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);
  const [shopSlug, setShopSlug] = useState<string | null>(null);
  const [target, setTarget] = useState("shop");
  const [platform, setPlatform] = useState<string>("fb-ads");
  const [name, setName] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const db = supabase as any;
      const [{ data: seller }, { data: prods }] = await Promise.all([
        db.from("sellers").select("id, slug").eq("owner_id", user.id).maybeSingle(),
        db.from("seller_products").select("name, marketplace_product_id").eq("user_id", user.id).eq("status", "active").not("marketplace_product_id", "is", null),
      ]);
      setShopSlug(seller?.slug ?? null);
      const ids = ((prods ?? []) as any[]).map((p) => p.marketplace_product_id);
      const { data: slugs } = ids.length ? await db.from("products").select("id, slug").in("id", ids) : { data: [] };
      const slugOf = new Map(((slugs ?? []) as any[]).map((s) => [s.id, s.slug ?? s.id]));
      setProducts(((prods ?? []) as any[]).map((p) => ({ id: slugOf.get(p.marketplace_product_id) ?? p.marketplace_product_id, name: p.name })));
    })();
  }, []);

  const url = useMemo(() => {
    const p = PLATFORMS.find((x) => x.id === platform)!;
    const path = target === "shop" ? (shopSlug ? `/seller/${shopSlug}` : "") : `/product/${target}`;
    if (!path) return "";
    const q = new URLSearchParams({ utm_source: p.source, utm_medium: p.medium });
    if (name.trim()) q.set("utm_campaign", name.trim().slice(0, 80));
    return `${MARKETPLACE_URL}${path}?${q.toString()}`;
  }, [target, platform, name, shopSlug]);

  const copy = async () => {
    if (!url) return;
    if (!name.trim()) return toast.error("Donnez un nom à votre campagne");
    try { await navigator.clipboard.writeText(url); setCopied(true); toast.success("Lien copié"); window.setTimeout(() => setCopied(false), 2000); }
    catch { toast.error("Copie impossible : sélectionnez le lien à la main"); }
  };

  const inp = "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm";
  return (
    <div className="rounded-2xl border border-border bg-card p-6 lg:col-span-2">
      <h3 className="flex items-center gap-2 font-bold"><Link2 size={16} className="text-primary" /> Lien de campagne</h3>
      <p className="mb-4 text-xs text-muted-foreground">À coller comme lien de destination de votre publicité pour en suivre les résultats ici.</p>
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted-foreground">Page à promouvoir</span>
          <Select value={target} onChange={(e) => setTarget(e.target.value)} className={inp}>
            <option value="shop">Ma boutique</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted-foreground">Plateforme</span>
          <Select value={platform} onChange={(e) => setPlatform(e.target.value)} className={inp}>
            {PLATFORMS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </Select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted-foreground">Nom de la campagne</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="ex. Promo rentrée Douala" className={inp} />
        </label>
        <div className="break-all rounded-xl bg-secondary/50 p-3 font-mono text-[11px] text-muted-foreground">{url || "…"}</div>
        <button onClick={copy} disabled={!url} className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-2.5 text-sm font-semibold text-black disabled:opacity-50">
          {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "Copié" : "Copier le lien"}
        </button>
        <p className="flex gap-1.5 text-[11px] text-muted-foreground"><Info size={12} className="mt-0.5 shrink-0" /> Sans lien de campagne, les visites venues de Facebook, Instagram ou TikTok sont quand même comptées dans leur source.</p>
      </div>
    </div>
  );
}
