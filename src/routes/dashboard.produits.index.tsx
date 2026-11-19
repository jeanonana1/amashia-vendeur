import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { askConfirm } from "@/lib/dialog";
import { imgProps } from "@/lib/img";
import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/seller/dashboard/DashboardLayout";
import { Plus, Search, Filter, Edit, Trash2, Eye, Check, Pause, Boxes, X, Rocket } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { marketplaceProductUrl } from "@/lib/sellerProfile";
import { toast } from "sonner";
import { PublishAmashiaModal, type PublishProduct } from "@/components/seller/dashboard/PublishAmashiaModal";
import { Select } from "@/components/ui/app-select";

export const Route = createFileRoute("/dashboard/produits/")({
  head: () => ({
    meta: [
      { title: "Mes produits — Amashia Seller" },
      { name: "description", content: "Gérez votre catalogue Amashia en temps réel : stock, prix, statut et visibilité de chaque produit." },
      { property: "og:title", content: "Mes produits — Amashia Seller" },
      { property: "og:description", content: "Catalogue vendeur Amashia : stock, prix et statut en temps réel." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProduitsPage,
});

interface Product {
  id: string; name: string; category: string | null; price: number; stock: number;
  status: string; sku: string | null; description: string | null; images: string[] | null;
  compare_at_price?: number | null; purchase_price?: number | null;
  marketplace_product_id?: string | null;
  specifications?: any; attributes?: any; variant_images?: any;
}

function statusBadge(p: Product) {
  if (p.status === "draft") return { label: "Brouillon", cls: "bg-muted text-muted-foreground" };
  if (p.stock === 0) return { label: "Rupture", cls: "bg-red-500/20 text-red-400" };
  if (p.stock < 10) return { label: "Stock faible", cls: "bg-amber-500/20 text-amber-400" };
  return { label: "Actif", cls: "bg-emerald-500/20 text-emerald-400" };
}

function truncate(s: string, n = 42) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n).trimEnd() + "…" : s;
}

function ProduitsPage() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "draft" | "rupture">("all");
  const [showFilter, setShowFilter] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [stockEdit, setStockEdit] = useState<{ product: Product; value: string } | null>(null);
  const [savingStock, setSavingStock] = useState(false);
  const [publishTarget, setPublishTarget] = useState<Product | null>(null);

  useEffect(() => {
    let mounted = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !mounted) return;
      const { data } = await supabase.from("seller_products").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
      if (mounted && data) setProducts(data as Product[]);
      if (!mounted) return;

      channel = supabase
        .channel(`products-realtime-${user.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "products", filter: `user_id=eq.${user.id}` }, (payload) => {
          setProducts((prev) => {
            if (payload.eventType === "INSERT") {
              const np = payload.new as Product;
              if (prev.some((x) => x.id === np.id)) return prev;
              return [np, ...prev];
            }
            if (payload.eventType === "UPDATE") return prev.map((p) => p.id === (payload.new as Product).id ? payload.new as Product : p);
            if (payload.eventType === "DELETE") return prev.filter((p) => p.id !== (payload.old as Product).id);
            return prev;
          });
        });
      channel.subscribe();
    })();
    return () => { mounted = false; if (channel) supabase.removeChannel(channel); };
  }, []);

  async function deleteProduct(id: string) {
    if (!(await askConfirm({ title: "Supprimer ce produit ?", message: "Il disparaîtra aussi du site Amashia. Cette action est définitive.", danger: true }))) return;
    const prev = products;
    setProducts((p) => p.filter((x) => x.id !== id));
    const { error } = await supabase.from("seller_products").delete().eq("id", id);
    if (error) {
      setProducts(prev);
      return toast.error(error.message);
    }
    toast.success("Produit supprimé");
  }

  async function toggleStatus(p: Product) {
    const next = p.status === "active" ? "draft" : "active";
    setProducts((prev) => prev.map((x) => x.id === p.id ? { ...x, status: next } : x));
    const { error } = await supabase.from("seller_products").update({ status: next }).eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success(next === "active" ? "Produit publié" : "Produit désactivé");
  }

  async function saveStock() {
    if (!stockEdit) return;
    const value = Math.max(0, parseInt(stockEdit.value || "0", 10) || 0);
    setSavingStock(true);
    const target = stockEdit.product;
    const prev = products;
    setProducts((list) => list.map((x) => x.id === target.id ? { ...x, stock: value } : x));
    const { error } = await supabase.from("seller_products").update({ stock: value }).eq("id", target.id);
    setSavingStock(false);
    if (error) {
      setProducts(prev);
      return toast.error(error.message);
    }
    setStockEdit(null);
    toast.success(`Stock mis à jour : ${value}`);
  }

  function viewOnMarketplace(p: Product) {
    if (!p.marketplace_product_id || p.status !== "active") {
      toast.error("Ce produit n'est pas encore en ligne. Activez-le avec un titre, un prix et au moins une photo.");
      return;
    }
    window.open(marketplaceProductUrl(p.marketplace_product_id), "_blank", "noopener");
  }

  const categories = Array.from(new Set(products.map((p) => p.category).filter(Boolean))) as string[];

  const filtered = products.filter((p) => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) || (p.sku || "").toLowerCase().includes(search.toLowerCase());
    const matchCat = !categoryFilter || p.category === categoryFilter;
    const matchStatus =
      filter === "all" ||
      (filter === "active" && p.status === "active" && p.stock > 0) ||
      (filter === "draft" && p.status === "draft") ||
      (filter === "rupture" && p.stock === 0);
    return matchSearch && matchCat && matchStatus;
  });

  const stats = {
    total: products.length,
    actifs: products.filter((p) => p.stock > 0 && p.status === "active").length,
    rupture: products.filter((p) => p.stock === 0).length,
    brouillon: products.filter((p) => p.status === "draft").length,
  };

  return (
    <DashboardLayout title="Mes Produits" subtitle="Gérez votre catalogue en temps réel">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6">
        {[
          { label: "Total", value: stats.total, k: "all" as const },
          { label: "Actifs", value: stats.actifs, k: "active" as const },
          { label: "Rupture", value: stats.rupture, k: "rupture" as const },
          { label: "Brouillons", value: stats.brouillon, k: "draft" as const },
        ].map((s) => (
          <button key={s.label} onClick={() => setFilter(s.k)} className={`bg-card border rounded-2xl p-4 sm:p-5 text-left transition ${filter === s.k ? "border-primary" : "border-border"}`}>
            <p className="text-xs sm:text-sm text-muted-foreground">{s.label}</p>
            <p className="text-xl sm:text-2xl font-extrabold mt-1">{s.value}</p>
          </button>
        ))}
      </div>

      <div className="bg-card border border-border rounded-2xl p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-[220px]">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher…" className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-background border border-border text-sm focus:outline-none focus:border-primary" />
            </div>
            <div className="relative">
              <button onClick={() => setShowFilter((v) => !v)} className="px-3 sm:px-4 py-2.5 rounded-xl bg-secondary text-sm flex items-center gap-2"><Filter size={14} /><span className="hidden sm:inline">Filtres</span>{categoryFilter && " (1)"}</button>
              {showFilter && (
                <div className="absolute right-0 top-full mt-2 z-20 bg-card border border-border rounded-xl shadow-elegant p-3 w-64">
                  <p className="text-xs font-semibold mb-2">Catégorie</p>
                  <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm mb-2">
                    <option value="">Toutes</option>
                    {categories.map((c) => <option key={c}>{c}</option>)}
                  </Select>
                  <button onClick={() => { setCategoryFilter(""); setFilter("all"); setShowFilter(false); }} className="w-full py-2 rounded-lg bg-secondary text-xs font-semibold">Réinitialiser</button>
                </div>
              )}
            </div>
          </div>
          <Link to="/dashboard/produits/ajouter" className="px-4 sm:px-5 py-2.5 rounded-full bg-gradient-primary text-black text-sm font-semibold flex items-center gap-2 whitespace-nowrap"><Plus size={14} /><span className="hidden sm:inline">Ajouter un produit</span><span className="sm:hidden">Ajouter</span></Link>
        </div>

        {filtered.length === 0 ? (
          <div className="py-14 text-center text-muted-foreground text-sm">
            {products.length === 0
              ? <>Aucun produit. <Link to="/dashboard/produits/ajouter" className="text-primary font-semibold">Ajoutez votre premier produit →</Link></>
              : "Aucun résultat."}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
            {filtered.map((p) => {
              const b = statusBadge(p);
              const isActive = p.status === "active";
              return (
                <article key={p.id} className="group min-w-0 bg-background/40 border border-border rounded-2xl overflow-hidden flex flex-col hover:border-primary/50 transition">
                  <div className="relative w-full aspect-square overflow-hidden bg-white">
                    {p.images && p.images[0] ? (
                      // image entière, sans zoom (comme sur le site client)
                      <img {...imgProps(p.images[0], { width: 384, sizes: "(max-width: 768px) 50vw, 240px" })} alt={p.name} loading="lazy" className="absolute inset-0 w-full h-full object-contain p-2" />
                    ) : (
                      <div className="absolute inset-0 bg-gradient-primary opacity-40" />
                    )}
                  </div>

                  <div className="p-3.5 flex flex-col gap-2.5 flex-1">
                    <div className="min-w-0">
                      <h3 className="line-clamp-2 break-words font-semibold text-sm leading-snug" title={p.name}>{p.name}</h3>
                      <p className="truncate text-[11px] text-muted-foreground mt-1">{p.category || "Sans catégorie"}</p>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 mt-auto">
                      <span className="font-extrabold text-primary text-sm whitespace-nowrap">{Number(p.price).toLocaleString("fr-FR")} FCFA</span>
                      <button
                        onClick={() => setStockEdit({ product: p, value: String(p.stock) })}
                        title="Modifier le stock"
                        className="px-2.5 py-1 rounded-lg bg-secondary text-[11px] font-semibold inline-flex items-center gap-1 hover:bg-secondary/70"
                      >
                        <Boxes size={11} /> Stock : <span className="text-foreground font-bold">{p.stock}</span>
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border">
                      <button
                        onClick={() => toggleStatus(p)}
                        title={isActive ? "Cliquer pour désactiver" : "Cliquer pour publier"}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-semibold inline-flex items-center gap-1 ${b.cls}`}
                      >
                        {isActive ? <Check size={10} /> : <Pause size={10} />} {b.label}
                      </button>
                      <div className="flex items-center gap-1">
                        <button title="Voir sur la marketplace" onClick={() => viewOnMarketplace(p)} className="w-8 h-8 grid place-items-center rounded-lg hover:bg-secondary"><Eye size={14} /></button>
                        <button title="Modifier" onClick={() => navigate({ to: "/dashboard/produits/ajouter", search: { id: p.id } })} className="w-8 h-8 grid place-items-center rounded-lg hover:bg-secondary"><Edit size={14} /></button>
                        <button title="Supprimer" onClick={() => deleteProduct(p.id)} className="w-8 h-8 grid place-items-center rounded-lg hover:bg-destructive/20 text-destructive"><Trash2 size={14} /></button>
                      </div>
                    </div>

                    <button
                      onClick={() => setPublishTarget(p)}
                      className="w-full py-2 rounded-full bg-gradient-primary text-black text-[11px] font-semibold inline-flex items-center justify-center gap-1.5"
                    >
                      <Rocket size={12} /> Publier sur Amashia
                    </button>

                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {stockEdit && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm grid place-items-center z-[100] p-4" onClick={() => setStockEdit(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-card border border-border rounded-2xl w-full max-w-sm p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="min-w-0">
                <h3 className="font-bold">Réapprovisionner</h3>
                <p className="text-xs text-muted-foreground truncate">{stockEdit.product.name}</p>
              </div>
              <button onClick={() => setStockEdit(null)} className="w-8 h-8 shrink-0 grid place-items-center rounded-lg hover:bg-secondary"><X size={16} /></button>
            </div>
            <label className="block text-xs font-semibold mb-1.5">Quantité en stock</label>
            <input
              type="number"
              min={0}
              autoFocus
              value={stockEdit.value}
              onChange={(e) => setStockEdit({ ...stockEdit, value: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter") saveStock(); }}
              className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary"
            />
            <p className="text-[11px] text-muted-foreground mt-1.5">Stock actuel : {stockEdit.product.stock}</p>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setStockEdit(null)} className="flex-1 py-2.5 rounded-full bg-secondary text-sm font-semibold">Annuler</button>
              <button onClick={saveStock} disabled={savingStock} className="flex-1 py-2.5 rounded-full bg-gradient-primary text-black text-sm font-semibold disabled:opacity-60">{savingStock ? "…" : "Enregistrer"}</button>
            </div>
          </div>
        </div>
      )}

      {publishTarget && (
        <PublishAmashiaModal
          product={publishTarget as unknown as PublishProduct}
          onClose={() => setPublishTarget(null)}
          onPublished={(id) => setProducts((prev) => prev.map((x) => (x.id === id ? { ...x, status: "active" } : x)))}
        />
      )}
    </DashboardLayout>
  );
}
