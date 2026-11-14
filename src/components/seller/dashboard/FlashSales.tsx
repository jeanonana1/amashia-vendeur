import { useEffect, useState } from "react";
import { Zap, Plus, X, Trash2, Clock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { money } from "@/lib/sellerStats";
import { imgProps } from "@/lib/img";
import { askConfirm } from "@/lib/dialog";

/** Ventes flash : prix réduit sur une période ; appliqué automatiquement sur le site et à la commande. */
type Flash = {
  id: string; product_id: string; product_title: string; product_image: string | null; price: number;
  kind: "percent" | "fixed"; value: number; starts_at: string; ends_at: string; is_active: boolean; flash_price: number; sold: number;
};
type MyProduct = { id: string; name: string; price: number };

const pad = (n: number) => String(n).padStart(2, "0");
const localInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

function state(f: Flash) {
  const now = Date.now();
  if (!f.is_active) return { label: "Arrêtée", cls: "bg-muted text-muted-foreground" };
  if (new Date(f.ends_at).getTime() <= now) return { label: "Terminée", cls: "bg-muted text-muted-foreground" };
  if (new Date(f.starts_at).getTime() > now) return { label: "Programmée", cls: "bg-blue-500/15 text-blue-400" };
  return { label: "En cours", cls: "bg-emerald-500/20 text-emerald-400" };
}
function left(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "terminée";
  const h = Math.floor(ms / 3_600_000), d = Math.floor(h / 24);
  return d >= 1 ? `${d} j ${h % 24} h restants` : `${h} h ${Math.floor((ms % 3_600_000) / 60_000)} min restantes`;
}

export function FlashSales() {
  const [list, setList] = useState<Flash[] | null>(null);
  const [products, setProducts] = useState<MyProduct[]>([]);
  const [form, setForm] = useState<{ productId: string; kind: "percent" | "fixed"; value: string; start: string; end: string } | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const { data } = await (supabase as any).rpc("seller_flash_list");
    setList((data as Flash[]) ?? []);
  }
  useEffect(() => {
    void load();
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await (supabase as any).from("seller_products").select("name, price, marketplace_product_id").eq("user_id", user.id).eq("status", "active").not("marketplace_product_id", "is", null);
      setProducts(((data ?? []) as any[]).map((p) => ({ id: p.marketplace_product_id, name: p.name, price: Number(p.price) || 0 })));
    })();
  }, []);

  function openNew() {
    const now = new Date(); const end = new Date(now.getTime() + 24 * 3_600_000);
    setForm({ productId: products[0]?.id ?? "", kind: "percent", value: "20", start: localInput(now), end: localInput(end) });
  }

  const product = products.find((p) => p.id === form?.productId);
  const value = Number(form?.value) || 0;
  const preview = product ? Math.max(1, form?.kind === "percent" ? Math.round(product.price * (100 - value) / 100) : product.price - value) : 0;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form || !product) return toast.error("Choisissez un produit");
    if (!value || value <= 0) return toast.error("Indiquez la réduction");
    if (form.kind === "percent" && value > 90) return toast.error("90 % au maximum");
    if (form.kind === "fixed" && value >= product.price) return toast.error("La réduction doit être inférieure au prix");
    if (new Date(form.end) <= new Date(form.start)) return toast.error("La fin doit être après le début");
    setSaving(true);
    const { error } = await (supabase as any).from("seller_flash_sales").insert({
      product_id: form.productId, kind: form.kind, value: Math.round(value),
      starts_at: new Date(form.start).toISOString(), ends_at: new Date(form.end).toISOString(),
    });
    setSaving(false);
    if (error) return toast.error(String(error.message || "Enregistrement impossible").replace(/^.*?ERROR:\s*/, ""));
    toast.success("Vente flash créée : le prix réduit s'affiche sur Amashia");
    setForm(null);
    void load();
  }

  async function stop(f: Flash) {
    if (!(await askConfirm({ title: "Arrêter cette vente flash ?", message: "Le produit revient tout de suite à son prix normal.", confirmLabel: "Arrêter" }))) return;
    const { error } = await (supabase as any).from("seller_flash_sales").update({ is_active: false }).eq("id", f.id);
    if (error) return toast.error("Modification impossible");
    toast.success("Vente flash arrêtée");
    void load();
  }
  async function remove(f: Flash) {
    if (!(await askConfirm({ title: "Supprimer cette vente flash ?", danger: true }))) return;
    await (supabase as any).from("seller_flash_sales").delete().eq("id", f.id);
    void load();
  }

  const inp = "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm";

  return (
    <div className="rounded-2xl border border-border bg-card p-4 sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-bold">Mes ventes flash</h3>
          <p className="text-xs text-muted-foreground">Un prix réduit pendant une durée limitée, avec un compte à rebours sur la page du produit.</p>
        </div>
        <button onClick={openNew} disabled={!products.length} className="flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-black disabled:opacity-50"><Plus size={14} /> Nouvelle vente flash</button>
      </div>
      {list === null ? (
        <div className="h-28 animate-pulse rounded-xl bg-secondary/40" />
      ) : list.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{products.length ? "Aucune vente flash. Créez-en une pour booster un produit pendant quelques heures ou quelques jours." : "Publiez d'abord un produit pour pouvoir le mettre en vente flash."}</p>
      ) : (
        <div className="space-y-3">
          {list.map((f) => {
            const st = state(f);
            return (
              <div key={f.id} className="flex flex-wrap items-center gap-4 rounded-2xl border border-border p-4">
                <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-white">{f.product_image ? <img {...imgProps(f.product_image, { width: 64 })} alt="" className="h-full w-full object-contain" /> : <Zap size={18} className="text-primary" />}</div>
                <div className="min-w-[200px] flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-400">⚡ {f.kind === "percent" ? `-${f.value} %` : `-${money(f.value)}`}</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${st.cls}`}>{st.label}</span>
                  </div>
                  <p className="mt-1 line-clamp-1 text-sm">{f.product_title}</p>
                  <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                    <span><s>{money(f.price)}</s> → <b className="text-foreground">{money(f.flash_price)}</b></span>
                    <span className="flex items-center gap-1"><Clock size={11} /> {st.label === "Programmée" ? `Début le ${new Date(f.starts_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}` : left(f.ends_at)}</span>
                    <span>{f.sold} vendu(s)</span>
                  </p>
                </div>
                <div className="flex gap-2">
                  {(st.label === "En cours" || st.label === "Programmée") && <button onClick={() => stop(f)} className="rounded-lg bg-secondary px-3 py-1.5 text-xs font-semibold">Arrêter</button>}
                  <button onClick={() => remove(f)} className="grid h-8 w-8 place-items-center rounded-lg bg-destructive/10 text-destructive" aria-label="Supprimer"><Trash2 size={14} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {form && (
        <div className="fixed inset-0 z-50 grid grid-cols-[minmax(0,1fr)] place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setForm(null)}>
          <form onSubmit={save} onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-2xl border border-border bg-card p-6">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-lg font-bold"><Zap size={18} className="text-primary" /> Nouvelle vente flash</h3>
              <button type="button" onClick={() => setForm(null)} aria-label="Fermer"><X size={18} /></button>
            </div>
            <div className="space-y-4">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-muted-foreground">Produit</span>
                <select value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })} className={inp}>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name} — {money(p.price)}</option>)}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-muted-foreground">Type de réduction</span>
                  <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as "percent" | "fixed" })} className={inp}>
                    <option value="percent">Pourcentage (%)</option>
                    <option value="fixed">Montant (FCFA)</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-muted-foreground">{form.kind === "percent" ? "Réduction (%)" : "Réduction (FCFA)"}</span>
                  <input type="number" inputMode="numeric" min={1} value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} className={inp} />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block"><span className="mb-1 block text-xs font-semibold text-muted-foreground">Début</span><input type="datetime-local" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} className={inp} /></label>
                <label className="block"><span className="mb-1 block text-xs font-semibold text-muted-foreground">Fin</span><input type="datetime-local" value={form.end} min={form.start} onChange={(e) => setForm({ ...form, end: e.target.value })} className={inp} /></label>
              </div>
              {product && (
                <div className="rounded-xl bg-secondary/50 p-3 text-sm">
                  Prix affiché sur Amashia : <s className="text-muted-foreground">{money(product.price)}</s> → <b className="text-primary">{money(preview)}</b>
                  <p className="mt-1 text-[11px] text-muted-foreground">Le prix revient automatiquement à la normale à la fin. 31 jours au maximum.</p>
                </div>
              )}
            </div>
            <div className="mt-6 flex gap-2">
              <button type="button" onClick={() => setForm(null)} className="flex-1 rounded-full border border-border py-2.5 text-sm font-semibold">Annuler</button>
              <button type="submit" disabled={saving} className="flex-1 rounded-full bg-primary py-2.5 text-sm font-semibold text-black disabled:opacity-60">{saving ? "Enregistrement…" : "Lancer la vente flash"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
