import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/seller/dashboard/DashboardLayout";
import { Megaphone, Tag, Plus, Calendar, X, Zap, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/promotions")({
  head: () => ({ meta: [{ title: "Promotions — Amashia Seller" }, { name: "description", content: "Promotions : votre espace vendeur Amashia pour gérer votre activité." }, { property: "og:title", content: "Promotions — Amashia Seller" }, { property: "og:description", content: "Promotions : votre espace vendeur Amashia pour gérer votre activité." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: PromotionsPage,
});

type Promo = {
  id: string; name: string; type: "code" | "flash"; code: string; discountType: "percent" | "amount" | "shipping";
  discount: number; usageLimit: number | null; uses: number; startDate: string; endDate: string; status: "active" | "expired";
};

const empty: { name: string; type: "code" | "flash"; code: string; discountType: "percent" | "amount" | "shipping"; discount: number; usageLimit: string; startDate: string; endDate: string } = { name: "", type: "code", code: "", discountType: "percent", discount: 10, usageLimit: "", startDate: new Date().toISOString().slice(0, 10), endDate: "" };

function PromotionsPage() {
  const [promos, setPromos] = useState<Promo[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);

  useEffect(() => { setPromos(JSON.parse(localStorage.getItem("promos") || "[]")); }, []);
  function save(next: Promo[]) { setPromos(next); localStorage.setItem("promos", JSON.stringify(next)); }

  function create() {
    if (!form.name || (form.type === "code" && !form.code) || !form.endDate) return toast.error("Champs requis manquants");
    const p: Promo = {
      id: crypto.randomUUID(), name: form.name, type: form.type, code: form.code.toUpperCase() || `FLASH-${Date.now()}`,
      discountType: form.discountType, discount: Number(form.discount),
      usageLimit: form.usageLimit ? Number(form.usageLimit) : null, uses: 0,
      startDate: form.startDate, endDate: form.endDate, status: "active",
    };
    save([p, ...promos]);
    toast.success("Promotion créée");
    setOpen(false); setForm(empty);
  }
  function del(id: string) { if (confirm("Supprimer ?")) save(promos.filter((p) => p.id !== id)); }
  function toggle(id: string) { save(promos.map((p) => p.id === id ? { ...p, status: p.status === "active" ? "expired" : "active" } : p)); }

  const stats = { active: promos.filter((p) => p.status === "active").length, uses: promos.reduce((a, p) => a + p.uses, 0) };
  const fmtDiscount = (p: Promo) => p.discountType === "shipping" ? "Livraison" : p.discountType === "percent" ? `-${p.discount}%` : `-${p.discount.toLocaleString()} FCFA`;

  return (
    <DashboardLayout title="Promotions" subtitle="Créez des codes promo et ventes flash">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Promotions actives", value: stats.active, icon: Megaphone },
          { label: "Codes utilisés", value: stats.uses, icon: Tag },
          { label: "Total promotions", value: promos.length, icon: Tag },
          { label: "Conversion estimée", value: "+24%", icon: Megaphone },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="bg-card border border-border rounded-2xl p-5">
              <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary grid place-items-center mb-3"><Icon size={20} /></div>
              <p className="text-sm text-muted-foreground">{s.label}</p>
              <p className="text-2xl font-extrabold mt-1">{s.value}</p>
            </div>
          );
        })}
      </div>

      <div className="bg-card border border-border rounded-2xl p-6">
        <div className="flex justify-between items-center mb-5 flex-wrap gap-3">
          <h3 className="font-bold">Mes promotions</h3>
          <button onClick={() => setOpen(true)} className="px-5 py-2.5 rounded-full bg-gradient-primary text-white text-sm font-semibold flex items-center gap-2"><Plus size={14} /> Créer une promotion</button>
        </div>

        {promos.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground text-sm">Aucune promotion. Créez votre première offre pour booster vos ventes.</div>
        ) : (
          <div className="space-y-3">
            {promos.map((p) => (
              <div key={p.id} className="border border-border rounded-2xl p-5 flex flex-wrap items-center gap-4 hover:border-primary/50 transition">
                <div className={`w-12 h-12 rounded-xl text-white grid place-items-center ${p.type === "flash" ? "bg-amber-500" : "bg-gradient-primary"}`}>
                  {p.type === "flash" ? <Zap size={20} /> : <Megaphone size={20} />}
                </div>
                <div className="flex-1 min-w-[200px]">
                  <div className="flex items-center gap-3 flex-wrap">
                    <p className="font-bold">{p.name}</p>
                    <span className={`px-3 py-0.5 rounded-full text-xs font-semibold ${p.status === "active" ? "bg-emerald-500/20 text-emerald-400" : "bg-muted text-muted-foreground"}`}>{p.status === "active" ? "Active" : "Expirée"}</span>
                    {p.type === "flash" && <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-500 text-xs font-semibold">⚡ Vente flash</span>}
                  </div>
                  <div className="flex flex-wrap gap-4 text-xs text-muted-foreground mt-1">
                    <span>Code: <span className="font-mono font-bold text-foreground">{p.code}</span></span>
                    <span className="flex items-center gap-1"><Calendar size={12} /> Fin {p.endDate}</span>
                    <span>Utilisations: {p.uses}{p.usageLimit ? ` / ${p.usageLimit}` : " / ∞"}</span>
                  </div>
                </div>
                <p className="text-2xl font-extrabold text-primary">{fmtDiscount(p)}</p>
                <div className="flex gap-2">
                  <button onClick={() => toggle(p.id)} className="px-3 py-1.5 rounded-lg bg-secondary text-xs font-semibold">{p.status === "active" ? "Désactiver" : "Activer"}</button>
                  <button onClick={() => del(p.id)} className="w-8 h-8 grid place-items-center rounded-lg bg-destructive/10 text-destructive"><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 bg-black/60 grid place-items-center z-50 p-4 overflow-y-auto" onClick={() => setOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg space-y-4 my-8">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold">Créer une promotion</h3>
              <button onClick={() => setOpen(false)} className="w-8 h-8 grid place-items-center rounded-lg hover:bg-secondary"><X size={16} /></button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(["code", "flash"] as const).map((t) => (
                <button key={t} onClick={() => setForm({ ...form, type: t })} className={`py-3 rounded-xl text-sm font-semibold border ${form.type === t ? "border-primary bg-primary/10 text-primary" : "border-border"}`}>
                  {t === "code" ? "🎟️ Code promo" : "⚡ Vente flash"}
                </button>
              ))}
            </div>
            <F label="Nom *"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inp} /></F>
            {form.type === "code" && <F label="Code *"><input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="SOLDES25" className={inp + " font-mono uppercase"} /></F>}
            <div className="grid grid-cols-2 gap-3">
              <F label="Type de remise">
                <select value={form.discountType} onChange={(e) => setForm({ ...form, discountType: e.target.value as any })} className={inp}>
                  <option value="percent">Pourcentage</option>
                  <option value="amount">Montant fixe</option>
                  <option value="shipping">Livraison gratuite</option>
                </select>
              </F>
              {form.discountType !== "shipping" && <F label="Valeur"><input type="number" value={form.discount} onChange={(e) => setForm({ ...form, discount: Number(e.target.value) })} className={inp} /></F>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <F label="Début"><input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className={inp} /></F>
              <F label="Fin *"><input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className={inp} /></F>
            </div>
            <F label="Limite d'utilisation (vide = illimité)"><input type="number" value={form.usageLimit} onChange={(e) => setForm({ ...form, usageLimit: e.target.value })} className={inp} /></F>
            <button onClick={create} className="w-full py-3 rounded-full bg-gradient-primary text-white font-semibold">Créer la promotion</button>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
const inp = "w-full bg-background border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary";
function F({ label, children }: { label: string; children: React.ReactNode }) { return <div><label className="block text-sm mb-2 font-medium">{label}</label>{children}</div>; }
