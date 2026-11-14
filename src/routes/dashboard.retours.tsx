import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/seller/dashboard/DashboardLayout";
import { RotateCcw, Clock, CheckCircle2, XCircle, PackageCheck, Wallet, X, MapPin } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { dateTime, money } from "@/lib/sellerStats";
import { imgProps } from "@/lib/img";
import { askConfirm, askText } from "@/lib/dialog";

export const Route = createFileRoute("/dashboard/retours")({
  head: () => ({ meta: [{ title: "Retours — Amashia Seller" }, { name: "description", content: "Demandes de retour de vos clients Amashia." }] }),
  component: ReturnsPage,
});

type Ret = {
  id: string; ref: string; status: "requested" | "accepted" | "refused" | "received" | "refunded"; product_title: string; quantity: number; amount: number;
  reason: string; reason_label: string | null; details: string | null; solution: string; photos: string[]; seller_note: string | null;
  created_at: string; updated_at: string; order_number: string; customer_name: string; delivery_area: string; image: string | null;
};

const STATUS: Record<Ret["status"], { label: string; cls: string }> = {
  requested: { label: "À traiter", cls: "bg-amber-500/15 text-amber-400" },
  accepted: { label: "Accepté — en attente de l'article", cls: "bg-sky-500/15 text-sky-400" },
  received: { label: "Article reçu", cls: "bg-violet-500/15 text-violet-400" },
  refunded: { label: "Remboursé / réglé", cls: "bg-emerald-500/15 text-emerald-400" },
  refused: { label: "Refusé", cls: "bg-red-500/15 text-red-400" },
};
const SOLUTION: Record<string, string> = { refund: "Remboursement", exchange: "Échange", credit: "Avoir Amashia" };
const FILTERS = [["all", "Tous"], ["requested", "À traiter"], ["accepted", "Acceptés"], ["received", "Reçus"], ["refunded", "Réglés"], ["refused", "Refusés"]] as const;

function ReturnsPage() {
  const [list, setList] = useState<Ret[] | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [open, setOpen] = useState<Ret | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data } = await (supabase as any).rpc("seller_returns");
    const rows = (data as Ret[]) ?? [];
    setList(rows);
    setOpen((o) => (o ? rows.find((r) => r.id === o.id) ?? null : null));
  }
  useEffect(() => { void load(); const t = window.setInterval(load, 30_000); return () => window.clearInterval(t); }, []);

  const shown = useMemo(() => (list ?? []).filter((r) => filter === "all" || r.status === filter), [list, filter]);
  const k = useMemo(() => {
    const l = list ?? [];
    return {
      todo: l.filter((r) => r.status === "requested").length,
      ongoing: l.filter((r) => r.status === "accepted" || r.status === "received").length,
      refunded: l.filter((r) => r.status === "refunded").reduce((s, r) => s + r.amount, 0),
      total: l.length,
    };
  }, [list]);

  async function act(r: Ret, status: "accepted" | "refused" | "received" | "refunded") {
    let note: string | null = null;
    if (status === "refused") {
      note = await askText({ title: "Refuser le retour", message: "Expliquez au client pourquoi (il verra ce message).", placeholder: "Ex. l'article a été utilisé", confirmLabel: "Refuser" });
      if (!note) return;
    } else if (status === "accepted") {
      note = await askText({ title: "Accepter le retour", message: "Message facultatif au client (ex. comment l'article sera récupéré).", placeholder: "Notre livreur passera le récupérer", confirmLabel: "Accepter" });
    } else if (status === "refunded") {
      if (!(await askConfirm({ title: `Marquer ${r.ref} comme réglé ?`, message: `Confirmez que le client a été remboursé (${money(r.amount)}) ou que l'échange / l'avoir a été fait.`, confirmLabel: "Confirmer" }))) return;
    }
    setBusy(true);
    const { error } = await (supabase as any).rpc("seller_update_return", { _id: r.id, _status: status, _note: note });
    setBusy(false);
    if (error) return toast.error(error.message.replace(/^.*?ERROR:\s*/, ""));
    toast.success(status === "accepted" ? "Retour accepté" : status === "refused" ? "Retour refusé" : status === "received" ? "Article marqué comme reçu" : "Retour réglé");
    void load();
  }

  return (
    <DashboardLayout title="Retours" subtitle="Les demandes de retour de vos clients">
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { icon: Clock, label: "À traiter", value: String(k.todo) },
          { icon: RotateCcw, label: "En cours", value: String(k.ongoing) },
          { icon: Wallet, label: "Montant remboursé", value: money(k.refunded) },
          { icon: PackageCheck, label: "Total des demandes", value: String(k.total) },
        ].map((c) => (
          <div key={c.label} className="rounded-2xl border border-border bg-card p-4">
            <c.icon size={18} className="mb-2 text-primary" />
            <p className="text-xl font-extrabold">{c.value}</p>
            <p className="text-[11px] text-muted-foreground">{c.label}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 sm:p-6">
        <div className="mb-4 flex max-w-full gap-1 overflow-x-auto rounded-full bg-secondary p-1 text-xs">
          {FILTERS.map(([key, label]) => (
            <button key={key} onClick={() => setFilter(key)} className={`shrink-0 rounded-full px-4 py-1.5 ${filter === key ? "bg-primary font-semibold text-black" : ""}`}>{label}</button>
          ))}
        </div>
        {list === null ? (
          <div className="h-32 animate-pulse rounded-xl bg-secondary/40" />
        ) : shown.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{list.length === 0 ? "Aucune demande de retour. Les clients peuvent retourner un article dans les 15 jours après sa livraison." : "Aucun retour dans cette catégorie."}</p>
        ) : (
          <div className="space-y-2">
            {shown.map((r) => (
              <button key={r.id} onClick={() => setOpen(r)} className="flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left transition hover:border-primary/50">
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-white">{r.image && <img {...imgProps(r.image, { width: 64 })} alt="" className="h-full w-full object-contain" />}</div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-1 text-sm font-semibold">{r.product_title}</p>
                  <p className="text-xs text-muted-foreground">{r.ref} · {r.order_number} · {dateTime(r.created_at)}</p>
                  <p className="line-clamp-1 text-xs text-muted-foreground">{r.reason_label}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold">{money(r.amount)}</p>
                  <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 grid grid-cols-[minmax(0,1fr)] place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setOpen(null)}>
          <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{open.ref} · commande {open.order_number}</p>
                <h3 className="font-bold leading-snug">{open.product_title}</h3>
                <span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS[open.status].cls}`}>{STATUS[open.status].label}</span>
              </div>
              <button onClick={() => setOpen(null)} className="grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-secondary" aria-label="Fermer"><X size={16} /></button>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <Info label="Client" value={open.customer_name} />
              <Info label="Zone" value={open.delivery_area || "—"} icon />
              <Info label="Montant" value={money(open.amount)} />
              <Info label="Solution demandée" value={SOLUTION[open.solution] ?? open.solution} />
            </div>
            <div className="mt-3 rounded-xl bg-secondary/50 p-3 text-sm">
              <p className="text-xs text-muted-foreground">Motif</p>
              <p className="font-semibold">{open.reason_label}</p>
              {open.details && <p className="mt-1 whitespace-pre-line text-muted-foreground">{open.details}</p>}
            </div>
            {open.photos.length > 0 && (
              <div className="mt-3 flex gap-2">
                {open.photos.map((p, i) => <a key={i} href={p} target="_blank" rel="noreferrer"><img {...imgProps(p, { width: 128 })} alt={`Photo ${i + 1}`} className="h-20 w-20 rounded-lg border border-border object-cover" /></a>)}
              </div>
            )}
            {open.seller_note && <p className="mt-3 text-xs text-muted-foreground">Votre message : {open.seller_note}</p>}
            <p className="mt-3 text-[11px] text-muted-foreground">Demandé le {dateTime(open.created_at)} · mis à jour le {dateTime(open.updated_at)}</p>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              {open.status === "requested" && (
                <>
                  <button disabled={busy} onClick={() => act(open, "refused")} className="flex-1 rounded-full bg-red-500/15 py-2.5 text-sm font-semibold text-red-400"><XCircle size={14} className="mr-1 inline" /> Refuser</button>
                  <button disabled={busy} onClick={() => act(open, "accepted")} className="flex-1 rounded-full bg-primary py-2.5 text-sm font-semibold text-black"><CheckCircle2 size={14} className="mr-1 inline" /> Accepter</button>
                </>
              )}
              {open.status === "accepted" && <button disabled={busy} onClick={() => act(open, "received")} className="flex-1 rounded-full bg-primary py-2.5 text-sm font-semibold text-black"><PackageCheck size={14} className="mr-1 inline" /> J'ai reçu l'article</button>}
              {open.status === "received" && <button disabled={busy} onClick={() => act(open, "refunded")} className="flex-1 rounded-full bg-primary py-2.5 text-sm font-semibold text-black"><Wallet size={14} className="mr-1 inline" /> Client remboursé / réglé</button>}
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

function Info({ label, value, icon }: { label: string; value: string; icon?: boolean }) {
  return (
    <div className="rounded-xl bg-secondary/40 p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="flex items-center gap-1 font-semibold">{icon && <MapPin size={12} />}{value}</p>
    </div>
  );
}
