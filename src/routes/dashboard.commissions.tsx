import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BadgeCheck, Percent, Wallet, Clock, ShoppingBag, Info, ArrowRight } from "lucide-react";
import { DashboardLayout } from "@/components/seller/dashboard/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { dateTime, money } from "@/lib/sellerStats";

export const Route = createFileRoute("/dashboard/commissions")({
  head: () => ({ meta: [{ title: "Commissions — Amashia Seller" }, { name: "description", content: "Taux de commission Amashia, détail par vente et solde net du vendeur." }] }),
  component: CommissionsPage,
});

type Data = {
  balance: number;
  enabled?: boolean;
  rates: { category: string; pct: number }[];
  totals: { gross: number; commission: number; delivered_net: number; pending_net: number };
  withdrawn: number;
  refunds: number;
  items: { order_number: string; title: string; qty: number; status: string; category: string; image: string | null; created_at: string; gross: number; pct: number; commission: number; net: number }[];
};

const STATUS: Record<string, string> = { pending: "En attente", preparing: "En préparation", shipped: "Expédiée", delivered: "Livrée" };

function CommissionsPage() {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    void (supabase as unknown as { rpc: (f: string) => Promise<{ data: unknown; error: { message: string } | null }> })
      .rpc("seller_commissions").then(({ data, error }) => (error ? setErr(error.message) : setD(data as Data)));
  }, []);
  const n = (v: unknown) => Number(v) || 0;

  return (
    <DashboardLayout title="Commissions" subtitle="Ce qu'Amashia prélève sur vos ventes, et ce qui vous revient">
      {err && <p className="mb-4 rounded-xl bg-destructive/10 p-4 text-sm text-destructive">{err}</p>}
      {!d && !err && <p className="text-sm text-muted-foreground">Chargement…</p>}
      {d && (
        <div className="space-y-6">
          <div className="rounded-2xl bg-gradient-primary p-6 text-black">
            <div className="flex items-center gap-2 text-sm font-semibold opacity-90"><Wallet size={18} /> Votre solde disponible</div>
            <p className="mt-1 text-4xl font-extrabold">{money(n(d.balance))}</p>
            <p className="mt-3 flex max-w-2xl items-start gap-2 rounded-xl bg-black/10 px-3 py-2 text-sm font-medium">
              <BadgeCheck size={18} className="mt-px shrink-0" />
              Ce solde est le vôtre : les commissions Amashia ont déjà été prélevées. Vous pouvez le retirer en totalité depuis la page Paiements.
            </p>
            <Link to="/dashboard/paiements" className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-black">Retirer mon argent <ArrowRight size={16} /></Link>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi icon={ShoppingBag} label="Ventes (prix payé par les clients)" value={money(n(d.totals.gross))} />
            <Kpi icon={Percent} label="Commissions Amashia" value={`− ${money(n(d.totals.commission))}`} />
            <Kpi icon={BadgeCheck} label="Vos gains (ventes livrées)" value={money(n(d.totals.delivered_net))} />
            <Kpi icon={Clock} label="Gains à venir (en livraison)" value={money(n(d.totals.pending_net))} />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="rounded-2xl border border-border bg-card p-5">
              <h2 className="mb-1 font-bold">Taux de commission</h2>
              <p className="mb-4 text-xs text-muted-foreground">Fixé par Amashia pour chaque catégorie, appliqué au prix de vente (après réduction éventuelle).</p>
              {d.enabled === false && <p className="mb-3 rounded-lg bg-green-50 p-2.5 text-xs font-medium text-green-700">Commissions suspendues par Amashia : vos nouvelles commandes n'ont aucune commission pour le moment.</p>}
              <ul className="divide-y divide-border">
                {d.rates.map((r) => <li key={r.category} className="flex items-center justify-between py-2.5 text-sm"><span>{r.category}</span><b className="text-primary">{n(r.pct)} %</b></li>)}
              </ul>
            </div>
            <div className="rounded-2xl border border-border bg-card p-5 lg:col-span-2">
              <h2 className="mb-3 font-bold">Comment votre solde est calculé</h2>
              <div className="space-y-2 text-sm">
                <Row l="Gains des ventes livrées (après commission)" v={money(n(d.totals.delivered_net))} />
                <Row l="Retraits demandés ou déjà versés" v={`− ${money(n(d.withdrawn))}`} />
                {n(d.refunds) > 0 && <Row l="Remboursements clients" v={`− ${money(n(d.refunds))}`} />}
                <div className="flex items-center justify-between border-t border-border pt-2 font-bold"><span>Solde disponible</span><span>{money(n(d.balance))}</span></div>
              </div>
              <p className="mt-4 flex items-start gap-2 rounded-xl bg-secondary p-3 text-xs text-muted-foreground"><Info size={14} className="mt-px shrink-0" />Les ventes encore en préparation ou en livraison s'ajoutent à votre solde dès qu'elles sont livrées. Les commandes passées avant la mise en place des commissions ne sont pas concernées (0 %).</p>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card">
            <div className="border-b border-border p-5"><h2 className="font-bold">Détail par vente</h2></div>
            {d.items.length === 0 ? <p className="p-5 text-sm text-muted-foreground">Aucune vente pour le moment.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground"><tr className="border-b border-border">
                    <th className="p-3">Vente</th><th className="p-3">Catégorie</th><th className="p-3 text-right">Prix de vente</th><th className="p-3 text-right">Commission</th><th className="p-3 text-right">Vous recevez</th><th className="p-3">Statut</th>
                  </tr></thead>
                  <tbody>{d.items.map((it, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      <td className="p-3"><div className="flex items-center gap-3">{it.image ? <img src={it.image} alt="" className="h-10 w-10 rounded-lg border border-border object-cover" /> : <div className="h-10 w-10 rounded-lg bg-secondary" />}<div className="min-w-0"><p className="line-clamp-1 font-medium">{it.qty} × {it.title}</p><p className="text-xs text-muted-foreground">{it.order_number} · {dateTime(it.created_at)}</p></div></div></td>
                      <td className="p-3 text-xs">{it.category}</td>
                      <td className="p-3 text-right">{money(n(it.gross))}</td>
                      <td className="p-3 text-right text-muted-foreground">− {money(n(it.commission))} <span className="text-[11px]">({n(it.pct)} %)</span></td>
                      <td className="p-3 text-right font-bold">{money(n(it.net))}</td>
                      <td className="p-3 text-xs">{STATUS[it.status] ?? it.status}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

function Kpi({ icon: Icon, label, value }: { icon: typeof Wallet; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground"><Icon size={14} />{label}</div>
      <p className="text-xl font-extrabold">{value}</p>
    </div>
  );
}
function Row({ l, v }: { l: string; v: string }) {
  return <div className="flex items-center justify-between"><span className="text-muted-foreground">{l}</span><span className="font-semibold">{v}</span></div>;
}
