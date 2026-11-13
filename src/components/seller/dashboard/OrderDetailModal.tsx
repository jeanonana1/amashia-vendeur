import { useEffect, useState } from "react";
import { X, MapPin, CreditCard, Clock, User, Package } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { dateTime, money } from "@/lib/sellerStats";

/** Ligne de commande telle que le vendeur la voit (vue seller_orders, sans téléphone du client). */
export interface SellerOrderLine {
  id: string;
  order_id: string;
  order_number: string;
  customer_name: string;
  delivery_area: string | null;
  product_title: string;
  product_image: string | null;
  color: string | null;
  options: string | null;
  quantity: number;
  unit_price: number;
  amount: number;
  payment_method: string;
  status: string;
  created_at: string;
}

export const ORDER_FIELDS = "id,order_id,order_number,customer_name,delivery_area,product_title,product_image,color,options,quantity,unit_price,amount,payment_method,status,created_at";

export const ORDER_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "En attente", cls: "bg-amber-500/15 text-amber-400" },
  preparing: { label: "Préparation", cls: "bg-blue-500/15 text-blue-400" },
  shipped: { label: "Expédiée", cls: "bg-violet-500/15 text-violet-400" },
  delivered: { label: "Livrée", cls: "bg-emerald-500/15 text-emerald-400" },
  cancelled: { label: "Annulée", cls: "bg-red-500/15 text-red-400" },
};

export const colorName = (c: string | null) => (c ? c.replace(/\s*#[0-9a-f]{3,8}$/i, "") : "");

/**
 * Détail d'une commande pour le vendeur : tous ses articles de cette commande,
 * client (nom et quartier uniquement), paiement, date et heure, statut modifiable.
 */
export function OrderDetailModal({ line, onClose, onChanged }: { line: SellerOrderLine; onClose: () => void; onChanged?: () => void }) {
  const [lines, setLines] = useState<SellerOrderLine[]>([line]);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (supabase as any).from("seller_orders").select(ORDER_FIELDS).eq("order_id", line.order_id).order("created_at")
      .then(({ data }: { data: SellerOrderLine[] | null }) => { if (alive && data?.length) setLines(data); });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => { alive = false; window.removeEventListener("keydown", onKey); };
  }, [line.order_id, onClose]);

  async function setStatus(id: string, status: string) {
    setSaving(id);
    const { error } = await (supabase as any).rpc("seller_set_order_status", { _item_id: id, _status: status });
    setSaving(null);
    if (error) { toast.error(error.message); return; }
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, status } : l)));
    toast.success(`Article ${ORDER_STATUS[status]?.label.toLowerCase() ?? "mis à jour"}`);
    onChanged?.();
  }

  const total = lines.filter((l) => l.status !== "cancelled").reduce((s, l) => s + Number(l.amount), 0);

  return (
    <div className="fixed inset-0 z-[120] grid place-items-end bg-black/60 backdrop-blur-sm sm:place-items-center sm:p-4" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-2xl border border-border bg-card sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-border bg-card p-5">
          <div>
            <p className="text-xs text-muted-foreground">Commande</p>
            <h3 className="text-lg font-bold">{line.order_number}</h3>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full hover:bg-secondary" aria-label="Fermer"><X size={16} /></button>
        </div>

        <div className="grid gap-3 p-5 text-sm sm:grid-cols-2">
          <Info icon={Clock} label="Passée le" value={dateTime(line.created_at)} />
          <Info icon={User} label="Client" value={line.customer_name} />
          <Info icon={MapPin} label="Livraison" value={line.delivery_area || "Non précisée"} />
          <Info icon={CreditCard} label="Paiement" value={line.payment_method} />
        </div>

        <div className="space-y-3 px-5 pb-2">
          <p className="flex items-center gap-2 text-sm font-bold"><Package size={15} className="text-primary" /> Article{lines.length > 1 ? "s" : ""} de votre boutique</p>
          {lines.map((l) => {
            const st = ORDER_STATUS[l.status] ?? ORDER_STATUS.pending;
            return (
              <div key={l.id} className="flex gap-3 rounded-xl border border-border p-3">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-white">
                  {l.product_image ? <img src={l.product_image} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full w-full place-items-center text-muted-foreground"><Package size={18} /></div>}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-semibold">{l.product_title}</p>
                  {(l.color || l.options) && <p className="text-xs text-primary">{[l.color ? `Couleur : ${colorName(l.color)}` : "", l.options ?? ""].filter(Boolean).join(" · ")}</p>}
                  <p className="mt-0.5 text-xs text-muted-foreground">{l.quantity} × {money(Number(l.unit_price))} = <b className="text-foreground">{money(Number(l.amount))}</b></p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${st.cls}`}>{st.label}</span>
                    <select
                      value={l.status}
                      disabled={saving === l.id || l.status === "cancelled"}
                      onChange={(e) => void setStatus(l.id, e.target.value)}
                      className="rounded-lg border border-border bg-background px-2 py-1 text-xs"
                      aria-label="Changer le statut"
                    >
                      {Object.entries(ORDER_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between border-t border-border p-5">
          <span className="text-sm text-muted-foreground">Total pour votre boutique</span>
          <span className="text-lg font-extrabold text-primary">{money(total)}</span>
        </div>
        <p className="px-5 pb-5 text-[11px] text-muted-foreground">
          Les coordonnées téléphoniques du client ne sont pas communiquées : la livraison est organisée par Amashia.
        </p>
      </div>
    </div>
  );
}

function Info({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl bg-secondary/40 p-3">
      <Icon size={15} className="mt-0.5 shrink-0 text-primary" />
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="break-words font-medium">{value}</p>
      </div>
    </div>
  );
}
