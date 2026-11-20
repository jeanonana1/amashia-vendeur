import { createFileRoute } from "@tanstack/react-router";
import { imgProps } from "@/lib/img";
import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/seller/dashboard/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, X, Check, Trash2, Package } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/signalements")({
  head: () => ({
    meta: [
      { title: "Produits signalés — Amachia Seller" },
      { name: "description", content: "Consultez les signalements laissés par les clients sur vos produits et traitez-les." },
      { property: "og:title", content: "Produits signalés — Amachia Seller" },
      { property: "og:description", content: "Consultez les signalements laissés par les clients sur vos produits." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReportsPage,
});

type Report = {
  id: string;
  product_id: string;
  reporter_name: string | null;
  reporter_contact: string | null;
  reason: string;
  message: string | null;
  status: string;
  created_at: string;
  products?: { name: string; images: string[] | null } | null;
};

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "En attente", cls: "bg-amber-500/10 text-amber-400" },
  reviewed: { label: "Traité", cls: "bg-emerald-500/10 text-emerald-400" },
  rejected: { label: "Rejeté", cls: "bg-destructive/10 text-destructive" },
};

function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "reviewed" | "rejected">("all");
  const [open, setOpen] = useState<Report | null>(null);

  async function load() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data, error } = await supabase
      .from("product_reports")
      .select("*, products:seller_products(name, images)")
      .eq("seller_id", user.id)
      .order("created_at", { ascending: false });
    if (error) toast.error("Impossible de charger les signalements");
    setReports((data as unknown as Report[]) || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function setStatus(id: string, status: string) {
    const { error } = await supabase.from("product_reports").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    setReports((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    setOpen((o) => (o && o.id === id ? { ...o, status } : o));
    toast.success("Signalement mis à jour");
  }

  async function remove(id: string) {
    const { error } = await supabase.from("product_reports").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setReports((prev) => prev.filter((r) => r.id !== id));
    setOpen(null);
    toast.success("Signalement supprimé");
  }

  const visible = filter === "all" ? reports : reports.filter((r) => r.status === filter);
  const pending = reports.filter((r) => r.status === "pending").length;

  return (
    <DashboardLayout title="Produits signalés" subtitle="Signalements laissés par les clients sur vos produits">
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {(["all", "pending", "reviewed", "rejected"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-full text-sm font-semibold transition ${filter === f ? "bg-gradient-primary text-black" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
          >
            {f === "all" ? `Tous (${reports.length})` : `${STATUS[f]!.label}${f === "pending" ? ` (${pending})` : ""}`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="bg-card border border-border rounded-2xl p-10 text-center text-sm text-muted-foreground">Chargement…</div>
      ) : visible.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-12 text-center">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-500/10 text-emerald-400 grid place-items-center"><Check size={24} /></div>
          <h3 className="font-bold mt-4">Aucun signalement</h3>
          <p className="text-sm text-muted-foreground mt-1">Vos produits n'ont reçu aucun signalement pour l'instant.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {visible.map((r) => {
            const st = STATUS[r.status] || STATUS["pending"]!;
            const img = r.products?.images?.[0];
            return (
              <button
                key={r.id}
                onClick={() => setOpen(r)}
                className="text-left bg-card border border-border rounded-2xl p-4 flex gap-4 hover:border-primary/50 transition"
              >
                <div className="w-16 h-16 shrink-0 rounded-xl overflow-hidden bg-secondary grid place-items-center">
                  {img ? <img {...imgProps(img, { width: 64 })} loading="lazy" alt={r.products?.name || "Produit"} className="w-full h-full object-cover" /> : <Package size={20} className="text-muted-foreground" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-sm truncate">{r.products?.name || "Produit supprimé"}</p>
                    <span className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold ${st.cls}`}>{st.label}</span>
                  </div>
                  <p className="text-xs text-primary font-semibold mt-1 flex items-center gap-1"><AlertTriangle size={12} /> {r.reason}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{r.message || "Aucun commentaire"}</p>
                  <p className="text-[11px] text-muted-foreground mt-2">
                    {r.reporter_name || "Client"} · {new Date(r.created_at).toLocaleDateString("fr-FR")}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={() => setOpen(null)}>
          <div className="bg-card border border-border rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="font-bold text-lg">Détail du signalement</h3>
                <p className="text-xs text-muted-foreground">{new Date(open.created_at).toLocaleString("fr-FR")}</p>
              </div>
              <button onClick={() => setOpen(null)} className="w-8 h-8 grid place-items-center rounded-full bg-secondary"><X size={14} /></button>
            </div>

            <div className="space-y-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Produit</p>
                <p className="font-semibold">{open.products?.name || "Produit supprimé"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Motif du signalement</p>
                <p className="font-semibold text-primary flex items-center gap-1.5"><AlertTriangle size={14} /> {open.reason}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Ce que dit le client</p>
                <p className="bg-background border border-border rounded-xl p-3 whitespace-pre-wrap">{open.message || "Aucun commentaire laissé."}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Client</p>
                  <p className="font-semibold">{open.reporter_name || "Anonyme"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Contact</p>
                  <p className="font-semibold break-all">{open.reporter_contact || "—"}</p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mt-6">
              <button onClick={() => setStatus(open.id, "reviewed")} className="flex-1 min-w-[120px] py-2.5 rounded-xl bg-gradient-primary text-black text-sm font-semibold">Marquer comme traité</button>
              <button onClick={() => setStatus(open.id, "rejected")} className="flex-1 min-w-[120px] py-2.5 rounded-xl bg-secondary text-sm font-semibold">Rejeter</button>
              <button onClick={() => remove(open.id)} className="px-4 py-2.5 rounded-xl bg-destructive/10 text-destructive text-sm font-semibold flex items-center gap-1"><Trash2 size={14} /></button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
