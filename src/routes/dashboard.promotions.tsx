import { createFileRoute } from "@tanstack/react-router";
import { askConfirm } from "@/lib/dialog";
import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/seller/dashboard/DashboardLayout";
import { Tag, Plus, Calendar, X, Trash2, Ticket, Wallet, ShoppingBag, Pencil, Store, Copy } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { money } from "@/lib/sellerStats";
import { imgProps } from "@/lib/img";

export const Route = createFileRoute("/dashboard/promotions")({
  head: () => ({ meta: [{ title: "Promotions — Amashia Seller" }, { name: "description", content: "Créez des coupons de réduction pour vos produits Amashia." }] }),
  component: PromotionsPage,
});

/** Coupon tel que renvoyé par seller_coupons_list() (vraies données + résultats). */
type Coupon = {
  id: string; code: string; kind: "percent" | "fixed"; value: number;
  product_id: string | null; product_title: string | null; product_image: string | null;
  min_order_fcfa: number; max_uses: number | null; starts_at: string; ends_at: string | null;
  is_active: boolean; created_at: string; uses: number; discount_total: number; revenue: number;
};
type MyProduct = { id: string; name: string; images: string[] | null; price: number };

type Form = {
  id?: string; code: string; kind: "percent" | "fixed"; value: string; productId: string;
  minOrder: string; maxUses: string; startDate: string; endDate: string;
};
const today = () => new Date().toISOString().slice(0, 10);
const emptyForm = (): Form => ({ code: "", kind: "percent", value: "10", productId: "", minOrder: "", maxUses: "", startDate: today(), endDate: "" });

function status(c: Coupon): { label: string; cls: string } {
  const now = Date.now();
  if (!c.is_active) return { label: "Désactivé", cls: "bg-muted text-muted-foreground" };
  if (c.ends_at && new Date(c.ends_at).getTime() < now) return { label: "Expiré", cls: "bg-red-500/15 text-red-400" };
  if (c.max_uses != null && c.uses >= c.max_uses) return { label: "Épuisé", cls: "bg-amber-500/15 text-amber-400" };
  if (new Date(c.starts_at).getTime() > now) return { label: "Programmé", cls: "bg-blue-500/15 text-blue-400" };
  return { label: "Actif", cls: "bg-emerald-500/20 text-emerald-400" };
}
const fmtDiscount = (c: { kind: string; value: number }) => (c.kind === "percent" ? `-${c.value} %` : `-${money(c.value)}`);
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });

function PromotionsPage() {
  const [coupons, setCoupons] = useState<Coupon[] | null>(null);
  const [products, setProducts] = useState<MyProduct[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const { data, error } = await (supabase as any).rpc("seller_coupons_list");
      if (error) throw error;
      setCoupons((data as Coupon[]) ?? []);
    } catch {
      setCoupons((c) => c ?? []);
    }
  }

  useEffect(() => {
    void load();
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      // seuls les produits publiés sur Amashia peuvent recevoir un coupon
      const { data } = await (supabase as any).from("seller_products").select("name, images, price, marketplace_product_id")
        .eq("user_id", user.id).not("marketplace_product_id", "is", null).order("created_at", { ascending: false });
      setProducts(((data ?? []) as any[]).map((p) => ({ id: p.marketplace_product_id, name: p.name, images: p.images, price: Number(p.price) || 0 })));
    })();
  }, []);

  const stats = useMemo(() => {
    const c = coupons ?? [];
    return {
      active: c.filter((x) => status(x).label === "Actif").length,
      uses: c.reduce((s, x) => s + x.uses, 0),
      discount: c.reduce((s, x) => s + x.discount_total, 0),
      revenue: c.reduce((s, x) => s + x.revenue, 0),
    };
  }, [coupons]);

  function edit(c: Coupon) {
    setForm({
      id: c.id, code: c.code, kind: c.kind, value: String(c.value), productId: c.product_id ?? "",
      minOrder: c.min_order_fcfa ? String(c.min_order_fcfa) : "", maxUses: c.max_uses ? String(c.max_uses) : "",
      startDate: c.starts_at.slice(0, 10), endDate: c.ends_at ? c.ends_at.slice(0, 10) : "",
    });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    const value = Number(form.value);
    const code = form.code.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,20}$/.test(code)) return toast.error("Le code doit contenir 3 à 20 lettres ou chiffres, sans espace.");
    if (!value || value <= 0) return toast.error("Indiquez le montant de la réduction.");
    if (form.kind === "percent" && value > 90) return toast.error("La réduction ne peut pas dépasser 90 %.");
    if (form.endDate && form.endDate < form.startDate) return toast.error("La date de fin doit être après la date de début.");
    const row = {
      code, kind: form.kind, value: Math.round(value), product_id: form.productId || null,
      min_order_fcfa: Math.max(0, Math.round(Number(form.minOrder) || 0)),
      max_uses: form.maxUses ? Math.max(1, Math.round(Number(form.maxUses))) : null,
      // début : minuit (heure locale) ; fin : 23 h 59 le jour choisi
      starts_at: form.startDate === today() && !form.id ? new Date().toISOString() : new Date(`${form.startDate}T00:00:00`).toISOString(),
      ends_at: form.endDate ? new Date(`${form.endDate}T23:59:59`).toISOString() : null,
    };
    setSaving(true);
    try {
      const q = (supabase as any).from("seller_coupons");
      const { error } = form.id ? await q.update(row).eq("id", form.id) : await q.insert(row);
      if (error) {
        const m = String(error.message || "");
        if (error.code === "23505" || m.includes("seller_coupons_code_key")) throw new Error("Ce code est déjà utilisé. Choisissez-en un autre.");
        throw new Error(m.length < 140 ? m : "Enregistrement impossible. Réessayez.");
      }
      toast.success(form.id ? "Coupon modifié" : "Coupon créé : il est visible sur vos produits");
      setForm(null);
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function toggle(c: Coupon) {
    const { error } = await (supabase as any).from("seller_coupons").update({ is_active: !c.is_active }).eq("id", c.id);
    if (error) return toast.error("Modification impossible. Réessayez.");
    toast.success(c.is_active ? "Coupon désactivé" : "Coupon réactivé");
    void load();
  }

  async function remove(c: Coupon) {
    if (!(await askConfirm({ title: `Supprimer le coupon ${c.code} ?`, message: "Les commandes déjà passées gardent leur réduction.", danger: true }))) return;
    const { error } = await (supabase as any).from("seller_coupons").delete().eq("id", c.id);
    if (error) return toast.error("Suppression impossible. Réessayez.");
    toast.success("Coupon supprimé");
    void load();
  }

  const input = "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm";

  return (
    <DashboardLayout title="Promotions" subtitle="Coupons de réduction pour vos produits">
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Coupons actifs", value: String(stats.active), icon: Ticket },
          { label: "Utilisations", value: String(stats.uses), icon: Tag },
          { label: "Réductions accordées", value: money(stats.discount), icon: Wallet },
          { label: "Ventes avec coupon", value: money(stats.revenue), icon: ShoppingBag },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="rounded-2xl border border-border bg-card p-4">
              <div className="mb-2 grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><Icon size={18} /></div>
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="mt-0.5 text-xl font-extrabold">{s.value}</p>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 sm:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-bold">Mes coupons</h3>
            <p className="text-xs text-muted-foreground">Chaque coupon s'affiche sur la page du produit concerné. Le client l'applique d'un clic ou saisit le code au paiement.</p>
          </div>
          <button onClick={() => setForm(emptyForm())} className="flex items-center gap-2 rounded-full bg-gradient-primary px-5 py-2.5 text-sm font-semibold text-black"><Plus size={14} /> Créer un coupon</button>
        </div>

        {coupons === null ? (
          <div className="h-32 animate-pulse rounded-xl bg-secondary/40" />
        ) : coupons.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Aucun coupon pour le moment. Créez votre première réduction pour attirer plus d'acheteurs.</div>
        ) : (
          <div className="space-y-3">
            {coupons.map((c) => {
              const st = status(c);
              return (
                <div key={c.id} className="flex flex-wrap items-center gap-4 rounded-2xl border border-border p-4 transition hover:border-primary/50">
                  <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-white">
                    {c.product_image ? <img {...imgProps(c.product_image, { width: 64 })} alt="" className="h-full w-full object-cover" /> : <Store size={20} className="text-primary" />}
                  </div>
                  <div className="min-w-[200px] flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <button onClick={() => { void navigator.clipboard?.writeText(c.code); toast.success("Code copié"); }} className="flex items-center gap-1 rounded-lg border border-dashed border-primary/60 px-2 py-0.5 font-mono text-sm font-bold text-primary" title="Copier le code">
                        {c.code} <Copy size={11} />
                      </button>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${st.cls}`}>{st.label}</span>
                    </div>
                    <p className="mt-1 line-clamp-1 text-sm">{c.product_title ? c.product_title : "Toute la boutique"}</p>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Calendar size={12} /> {fmtDate(c.starts_at)} → {c.ends_at ? fmtDate(c.ends_at) : "sans fin"}</span>
                      <span>Utilisations : {c.uses}{c.max_uses ? ` / ${c.max_uses}` : ""}</span>
                      {c.min_order_fcfa > 0 && <span>Dès {money(c.min_order_fcfa)}</span>}
                      {c.uses > 0 && <span>Remises : {money(c.discount_total)}</span>}
                    </div>
                  </div>
                  <p className="text-xl font-extrabold text-primary">{fmtDiscount(c)}</p>
                  <div className="flex gap-2">
                    <button onClick={() => edit(c)} className="grid h-8 w-8 place-items-center rounded-lg bg-secondary" aria-label="Modifier"><Pencil size={14} /></button>
                    <button onClick={() => toggle(c)} className="rounded-lg bg-secondary px-3 py-1.5 text-xs font-semibold">{c.is_active ? "Désactiver" : "Activer"}</button>
                    <button onClick={() => remove(c)} className="grid h-8 w-8 place-items-center rounded-lg bg-destructive/10 text-destructive" aria-label="Supprimer"><Trash2 size={14} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {form && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setForm(null)}>
          <form onSubmit={save} onClick={(e) => e.stopPropagation()} className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-6">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-lg font-bold">{form.id ? "Modifier le coupon" : "Nouveau coupon"}</h3>
              <button type="button" onClick={() => setForm(null)} aria-label="Fermer"><X size={18} /></button>
            </div>

            <div className="space-y-4">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-muted-foreground">Produit concerné</span>
                <select value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })} className={input}>
                  <option value="">Toute la boutique (tous mes produits)</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-muted-foreground">Code du coupon</span>
                <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase().replace(/\s/g, "") })} placeholder="EX. RENTREE10" maxLength={20} className={`${input} font-mono uppercase`} />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-muted-foreground">Type de réduction</span>
                  <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as Form["kind"] })} className={input}>
                    <option value="percent">Pourcentage (%)</option>
                    <option value="fixed">Montant (FCFA)</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-muted-foreground">{form.kind === "percent" ? "Réduction (%)" : "Réduction (FCFA)"}</span>
                  <input type="number" inputMode="numeric" min={1} max={form.kind === "percent" ? 90 : undefined} value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} className={input} />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-muted-foreground">Début</span>
                  <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className={input} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-muted-foreground">Fin (facultatif)</span>
                  <input type="date" value={form.endDate} min={form.startDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className={input} />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-muted-foreground">Achat minimum (FCFA)</span>
                  <input type="number" inputMode="numeric" min={0} placeholder="Aucun" value={form.minOrder} onChange={(e) => setForm({ ...form, minOrder: e.target.value })} className={input} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-muted-foreground">Utilisations max.</span>
                  <input type="number" inputMode="numeric" min={1} placeholder="Illimité" value={form.maxUses} onChange={(e) => setForm({ ...form, maxUses: e.target.value })} className={input} />
                </label>
              </div>

              <p className="rounded-xl bg-secondary/50 p-3 text-xs text-muted-foreground">
                La réduction est déduite uniquement de vos articles et de votre montant de vente. Chaque client peut utiliser un coupon une seule fois.
              </p>
            </div>

            <div className="mt-6 flex gap-2">
              <button type="button" onClick={() => setForm(null)} className="flex-1 rounded-full border border-border py-2.5 text-sm font-semibold">Annuler</button>
              <button type="submit" disabled={saving} className="flex-1 rounded-full bg-gradient-primary py-2.5 text-sm font-semibold text-black disabled:opacity-60">{saving ? "Enregistrement…" : form.id ? "Enregistrer" : "Créer le coupon"}</button>
            </div>
          </form>
        </div>
      )}
    </DashboardLayout>
  );
}
