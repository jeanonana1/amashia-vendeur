import { createFileRoute } from "@tanstack/react-router";
import { imgProps } from "@/lib/img";
import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/seller/dashboard/DashboardLayout";
import { PackagePlus } from "lucide-react";
import { IconRecherche as Search } from "@/components/icons/AmachiaIcons";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/reapprovisionnement")({
  head: () => ({
    meta: [
      { title: "Réapprovisionnement — Amachia Seller" },
      { name: "description", content: "Suivez le stock de vos produits Amachia et ajoutez directement les quantités réapprovisionnées." },
      { property: "og:title", content: "Réapprovisionnement — Amachia Seller" },
      { property: "og:description", content: "Gérez le stock et les commandes de réassort de votre boutique Amachia." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReapproPage,
});

interface Row {
  id: string; name: string; category: string | null; price: number; stock: number;
  images: string[] | null; sku: string | null;
}

function level(stock: number) {
  if (stock === 0) return { label: "Rupture", cls: "bg-red-500/20 text-red-400" };
  if (stock < 10) return { label: "Stock faible", cls: "bg-amber-500/20 text-amber-400" };
  return { label: "Suffisant", cls: "bg-emerald-500/20 text-emerald-400" };
}

function ReapproPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [onlyLow, setOnlyLow] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !mounted) return;
      const { data } = await supabase.from("seller_products").select("id,name,category,price,stock,images,sku").eq("user_id", user.id).order("stock", { ascending: true });
      if (mounted && data) setRows(data as Row[]);
    })();
    return () => { mounted = false; };
  }, []);

  async function restock(r: Row) {
    const add = parseInt(qty[r.id] || "0", 10);
    if (!add || add <= 0) return toast.error("Indiquez une quantité valide");
    const next = r.stock + add;
    setSaving(r.id);
    const { error } = await supabase.from("seller_products").update({ stock: next }).eq("id", r.id);
    setSaving(null);
    if (error) return toast.error(error.message);
    setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, stock: next } : x)));
    setQty((q) => ({ ...q, [r.id]: "" }));
    toast.success(`+${add} ajouté — nouveau stock : ${next}`);
  }

  const filtered = rows.filter((r) =>
    r.name.toLowerCase().includes(search.toLowerCase()) && (!onlyLow || r.stock < 10),
  );

  const totalUnits = rows.reduce((s, r) => s + r.stock, 0);
  const lowCount = rows.filter((r) => r.stock < 10).length;

  return (
    <DashboardLayout title="Réapprovisionnement" subtitle="Suivez vos stocks et ajoutez vos quantités reçues">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 mb-6">
        {[
          { label: "Produits", value: rows.length },
          { label: "Unités en stock", value: totalUnits },
          { label: "À réapprovisionner", value: lowCount },
        ].map((s) => (
          <div key={s.label} className="bg-card border border-border rounded-2xl p-4 sm:p-5">
            <p className="text-xs sm:text-sm text-muted-foreground">{s.label}</p>
            <p className="text-xl sm:text-2xl font-extrabold mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-card border border-border rounded-2xl p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un produit…" className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-background border border-border text-sm focus:outline-none focus:border-primary" />
          </div>
          <button onClick={() => setOnlyLow((v) => !v)} className={`px-4 py-2.5 rounded-xl text-sm font-semibold ${onlyLow ? "bg-gradient-primary text-black" : "bg-secondary"}`}>
            Stock faible uniquement
          </button>
        </div>

        {filtered.length === 0 ? (
          <p className="py-14 text-center text-muted-foreground text-sm">Aucun produit à afficher.</p>
        ) : (
          <div className="space-y-3">
            {filtered.map((r) => {
              const l = level(r.stock);
              return (
                <div key={r.id} className="flex flex-col sm:flex-row sm:items-center gap-3 border border-border rounded-xl p-3">
                  <div className="w-14 h-14 rounded-xl overflow-hidden bg-secondary shrink-0">
                    {r.images?.[0] ? <img {...imgProps(r.images[0], { width: 128 })} alt={r.name} loading="lazy" className="w-full h-full object-cover" /> : <div className="w-full h-full bg-gradient-primary opacity-40" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm leading-snug line-clamp-2">{r.name}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{r.category || "Sans catégorie"}{r.sku ? ` · ${r.sku}` : ""} · {Number(r.price).toLocaleString("fr-FR")} FCFA</p>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                    <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${l.cls}`}>{l.label}</span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">Stock : <b className="text-foreground">{r.stock}</b></span>
                    <input
                      type="number"
                      min={1}
                      value={qty[r.id] || ""}
                      onChange={(e) => setQty((q) => ({ ...q, [r.id]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter") restock(r); }}
                      placeholder="Qté"
                      className="w-20 bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary"
                    />
                    <button onClick={() => restock(r)} disabled={saving === r.id} className="px-3 py-2 rounded-xl bg-gradient-primary text-black text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-60">
                      <PackagePlus size={13} /> {saving === r.id ? "…" : "Ajouter au stock"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
