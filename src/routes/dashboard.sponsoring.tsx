import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/seller/dashboard/DashboardLayout";
import { Megaphone, Plus, X, Trash2, Eye, MousePointerClick, ShoppingCart, BadgeCheck, Wallet, Pause, Play } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { money, num } from "@/lib/sellerStats";
import { imgProps } from "@/lib/img";
import { askConfirm } from "@/lib/dialog";

export const Route = createFileRoute("/dashboard/sponsoring")({
  head: () => ({ meta: [{ title: "Sponsoring — Amashia Seller" }, { name: "description", content: "Mettez vos produits en avant sur Amashia et suivez les résultats." }] }),
  component: SponsoringPage,
});

type Campaign = {
  id: string; name: string; product_id: string; product_title: string | null; product_image: string | null;
  placement: "all" | "home" | "search" | "product"; daily_budget: number | null; starts_at: string; ends_at: string | null; status: "active" | "paused"; created_at: string;
  impressions: number; clicks: number; carts: number; purchases: number; revenue: number;
  daily: { day: string; clicks: number; carts: number; purchases: number }[];
};
type MyProduct = { id: string; name: string };

const PLACEMENT = { all: "Partout (accueil, recherche, pages produit)", home: "Page d'accueil", search: "Résultats de recherche", product: "Pages produit (« Produits liés à cet article »)" } as const;
const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1).replace(".", ",")} %` : "—");
const today = () => new Date().toISOString().slice(0, 10);

function status(c: Campaign) {
  if (c.status === "paused") return { label: "En pause", cls: "bg-muted text-muted-foreground" };
  if (c.ends_at && new Date(c.ends_at).getTime() < Date.now()) return { label: "Terminée", cls: "bg-muted text-muted-foreground" };
  if (new Date(c.starts_at).getTime() > Date.now()) return { label: "Programmée", cls: "bg-blue-500/15 text-blue-400" };
  return { label: "Active", cls: "bg-emerald-500/20 text-emerald-400" };
}

function SponsoringPage() {
  const [list, setList] = useState<Campaign[] | null>(null);
  const [products, setProducts] = useState<MyProduct[]>([]);
  const [form, setForm] = useState<{ name: string; productId: string; placement: Campaign["placement"]; start: string; end: string; budget: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  async function load() {
    const { data } = await (supabase as any).rpc("seller_campaigns_list");
    setList((data as Campaign[]) ?? []);
  }
  useEffect(() => {
    void load();
    const t = window.setInterval(load, 30_000);
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await (supabase as any).from("seller_products").select("name, marketplace_product_id").eq("user_id", user.id).eq("status", "active").not("marketplace_product_id", "is", null).order("created_at", { ascending: false });
      setProducts(((data ?? []) as any[]).map((p) => ({ id: p.marketplace_product_id, name: p.name })));
    })();
    return () => window.clearInterval(t);
  }, []);

  const totals = useMemo(() => {
    const l = list ?? [];
    const sum = (k: "impressions" | "clicks" | "carts" | "purchases" | "revenue") => l.reduce((s, c) => s + Number(c[k] || 0), 0);
    return { active: l.filter((c) => status(c).label === "Active").length, impressions: sum("impressions"), clicks: sum("clicks"), carts: sum("carts"), purchases: sum("purchases"), revenue: sum("revenue") };
  }, [list]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    if (form.name.trim().length < 2) return toast.error("Donnez un nom à la campagne");
    if (!form.productId) return toast.error("Choisissez un produit");
    if (form.end && form.end < form.start) return toast.error("La fin doit être après le début");
    setSaving(true);
    const { error } = await (supabase as any).from("seller_campaigns").insert({
      name: form.name.trim(), product_id: form.productId, placement: form.placement,
      starts_at: form.start === today() ? new Date().toISOString() : new Date(`${form.start}T00:00:00`).toISOString(),
      ends_at: form.end ? new Date(`${form.end}T23:59:59`).toISOString() : null,
      daily_budget: form.budget ? Math.max(0, Math.round(Number(form.budget))) : null,
    });
    setSaving(false);
    if (error) return toast.error(String(error.message || "Création impossible").replace(/^.*?ERROR:\s*/, ""));
    toast.success("Campagne lancée : votre produit est mis en avant sur Amashia");
    setForm(null);
    void load();
  }

  async function toggle(c: Campaign) {
    const { error } = await (supabase as any).from("seller_campaigns").update({ status: c.status === "active" ? "paused" : "active" }).eq("id", c.id);
    if (error) return toast.error("Modification impossible");
    toast.success(c.status === "active" ? "Campagne mise en pause" : "Campagne relancée");
    void load();
  }
  async function remove(c: Campaign) {
    if (!(await askConfirm({ title: `Supprimer « ${c.name} » ?`, message: "Ses statistiques seront supprimées aussi.", danger: true }))) return;
    await (supabase as any).from("seller_campaigns").delete().eq("id", c.id);
    void load();
  }

  const inp = "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm";

  return (
    <DashboardLayout title="Sponsoring" subtitle="Mettez vos produits en avant et suivez chaque résultat">
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {[
          { icon: Megaphone, label: "Campagnes actives", value: num(totals.active) },
          { icon: Eye, label: "Affichages", value: num(totals.impressions) },
          { icon: MousePointerClick, label: "Visites", value: num(totals.clicks) },
          { icon: ShoppingCart, label: "Ajouts au panier", value: num(totals.carts) },
          { icon: BadgeCheck, label: "Achats", value: num(totals.purchases) },
          { icon: Wallet, label: "Ventes générées", value: money(totals.revenue) },
        ].map((k) => (
          <div key={k.label} className="rounded-2xl border border-border bg-card p-4">
            <k.icon size={18} className="mb-2 text-primary" />
            <p className="text-xl font-extrabold">{k.value}</p>
            <p className="text-[11px] text-muted-foreground">{k.label}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 sm:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-bold">Mes campagnes</h3>
            <p className="text-xs text-muted-foreground">Le produit sponsorisé apparaît avec la mention « Sponsorisé » sur l'accueil et/ou en tête des recherches d'Amashia.</p>
          </div>
          <button onClick={() => setForm({ name: "", productId: products[0]?.id ?? "", placement: "all", start: today(), end: "", budget: "" })} disabled={!products.length} className="flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-black disabled:opacity-50"><Plus size={14} /> Nouvelle campagne</button>
        </div>

        {list === null ? (
          <div className="h-28 animate-pulse rounded-xl bg-secondary/40" />
        ) : list.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{products.length ? "Aucune campagne. Lancez-en une pour attirer plus de visiteurs sur un produit." : "Publiez d'abord un produit pour pouvoir le sponsoriser."}</p>
        ) : (
          <div className="space-y-3">
            {list.map((c) => {
              const st = status(c);
              const maxDay = Math.max(1, ...c.daily.map((d) => d.clicks));
              return (
                <div key={c.id} className="rounded-2xl border border-border p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-white">{c.product_image ? <img {...imgProps(c.product_image, { width: 64 })} alt="" className="h-full w-full object-contain" /> : <Megaphone size={18} className="text-primary" />}</div>
                    <div className="min-w-[180px] flex-1">
                      <div className="flex flex-wrap items-center gap-2"><p className="font-bold">{c.name}</p><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${st.cls}`}>{st.label}</span></div>
                      <p className="line-clamp-1 text-xs text-muted-foreground">{c.product_title} · {PLACEMENT[c.placement]}{c.ends_at ? ` · jusqu'au ${new Date(c.ends_at).toLocaleDateString("fr-FR")}` : ""}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setOpen(open === c.id ? null : c.id)} className="rounded-lg bg-secondary px-3 py-1.5 text-xs font-semibold">{open === c.id ? "Masquer" : "Données"}</button>
                      <button onClick={() => toggle(c)} className="grid h-8 w-8 place-items-center rounded-lg bg-secondary" aria-label={c.status === "active" ? "Pause" : "Relancer"}>{c.status === "active" ? <Pause size={14} /> : <Play size={14} />}</button>
                      <button onClick={() => remove(c)} className="grid h-8 w-8 place-items-center rounded-lg bg-destructive/10 text-destructive" aria-label="Supprimer"><Trash2 size={14} /></button>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-center sm:grid-cols-5">
                    {[["Affichages", num(c.impressions)], ["Visites", num(c.clicks)], ["Ajouts au panier", num(c.carts)], ["Achats", num(c.purchases)], ["Ventes", money(c.revenue)]].map(([l, v]) => (
                      <div key={l} className="rounded-xl bg-secondary/40 p-2"><p className="text-sm font-extrabold">{v}</p><p className="text-[10px] text-muted-foreground">{l}</p></div>
                    ))}
                  </div>
                  {open === c.id && (
                    <div className="mt-3 rounded-xl border border-border p-3">
                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div><p className="font-bold">{pct(c.clicks, c.impressions)}</p><p className="text-muted-foreground">Taux de clic</p></div>
                        <div><p className="font-bold">{pct(c.carts, c.clicks)}</p><p className="text-muted-foreground">Visite → panier</p></div>
                        <div><p className="font-bold">{pct(c.purchases, c.clicks)}</p><p className="text-muted-foreground">Conversion</p></div>
                      </div>
                      <p className="mb-1 mt-4 text-xs font-semibold text-muted-foreground">Visites par jour (30 derniers jours)</p>
                      {c.daily.length === 0 ? <p className="text-xs text-muted-foreground">Pas encore de visite.</p> : (
                        <div className="flex h-24 items-end gap-1">
                          {c.daily.map((d) => (
                            <div key={d.day} className="flex h-full flex-1 flex-col items-center justify-end" title={`${new Date(d.day).toLocaleDateString("fr-FR")} : ${d.clicks} visite(s), ${d.carts} panier(s), ${d.purchases} achat(s)`}>
                              <div className="w-full rounded-t bg-primary" style={{ height: `${Math.max(4, (d.clicks / maxDay) * 100)}%` }} />
                            </div>
                          ))}
                        </div>
                      )}
                      {c.daily_budget ? <p className="mt-3 text-[11px] text-muted-foreground">Budget indicatif : {money(c.daily_budget)} / jour (le sponsoring n'est pas facturé pour le moment).</p> : null}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {form && (
        <div className="fixed inset-0 z-50 grid grid-cols-[minmax(0,1fr)] place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setForm(null)}>
          <form onSubmit={save} onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-2xl border border-border bg-card p-6">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-lg font-bold">Nouvelle campagne</h3>
              <button type="button" onClick={() => setForm(null)} aria-label="Fermer"><X size={18} /></button>
            </div>
            <div className="space-y-4">
              <label className="block"><span className="mb-1 block text-xs font-semibold text-muted-foreground">Nom de la campagne</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={80} placeholder="Ex. Rentrée scolaire — montres" className={inp} /></label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-muted-foreground">Produit à sponsoriser</span>
                <select value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })} className={inp}>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-muted-foreground">Emplacement</span>
                <select value={form.placement} onChange={(e) => setForm({ ...form, placement: e.target.value as Campaign["placement"] })} className={inp}>
                  {Object.entries(PLACEMENT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block"><span className="mb-1 block text-xs font-semibold text-muted-foreground">Début</span><input type="date" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} className={inp} /></label>
                <label className="block"><span className="mb-1 block text-xs font-semibold text-muted-foreground">Fin (facultatif)</span><input type="date" value={form.end} min={form.start} onChange={(e) => setForm({ ...form, end: e.target.value })} className={inp} /></label>
              </div>
              <label className="block"><span className="mb-1 block text-xs font-semibold text-muted-foreground">Budget par jour (FCFA, facultatif)</span><input type="number" inputMode="numeric" min={0} value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} placeholder="Pour votre suivi" className={inp} /></label>
            </div>
            <div className="mt-6 flex gap-2">
              <button type="button" onClick={() => setForm(null)} className="flex-1 rounded-full border border-border py-2.5 text-sm font-semibold">Annuler</button>
              <button type="submit" disabled={saving} className="flex-1 rounded-full bg-primary py-2.5 text-sm font-semibold text-black disabled:opacity-60">{saving ? "Lancement…" : "Lancer la campagne"}</button>
            </div>
          </form>
        </div>
      )}
    </DashboardLayout>
  );
}
