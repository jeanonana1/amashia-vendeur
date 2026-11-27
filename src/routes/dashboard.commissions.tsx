import { Link, createFileRoute } from "@tanstack/react-router";
import { imgProps } from "@/lib/img";
import { SpecTable } from "@/components/seller/ui/SpecTable";
import { BalanceCard, primaryBtn } from "@/components/seller/ui/BalanceCard";
import { useEffect, useState } from "react";
import { IconVerifie as BadgeCheck, IconPourcentage as Percent, IconPortefeuille as Wallet, IconHorloge as Clock, IconSac as ShoppingBag, IconInfo as Info, IconSuivant as ArrowRight } from "@/components/icons/AmachiaIcons";
import { DashboardLayout } from "@/components/seller/dashboard/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { dateTime, money } from "@/lib/sellerStats";

import type { AnyIcon } from "@/components/icons/AmachiaIcons";
export const Route = createFileRoute("/dashboard/commissions")({
  head: () => ({ meta: [{ title: "Commissions — Amachia Seller" }, { name: "description", content: "Taux de commission Amachia, détail par vente et solde net du vendeur." }] }),
  component: CommissionsPage,
});

type Data = {
  balance: number;
  enabled?: boolean;
  rates: { category: string; pct: number }[];
  totals: { gross: number; delivered_net: number; pending_net: number };
  withdrawn: number;
  refunds: number;
  items: { order_number: string; title: string; qty: number; status: string; category: string; image: string | null; created_at: string; gross: number; pct: number; net: number }[];
};

const STATUS: Record<string, string> = { pending: "Commande reçue", preparing: "En préparation", shipped: "En cours de livraison", delivered: "Livrée" };

function CommissionsPage() {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    void (supabase as unknown as { rpc: (f: string) => Promise<{ data: unknown; error: { message: string } | null }> })
      .rpc("seller_commissions").then(({ data, error }) => (error ? setErr(error.message) : setD(data as Data)));
  }, []);
  const n = (v: unknown) => Number(v) || 0;

  return (
    <DashboardLayout title="Commissions" subtitle="Ce qu'Amachia prélève sur vos ventes, et ce qui vous revient">
      {err && <p className="mb-4 rounded-xl bg-destructive/10 p-4 text-sm text-destructive">{err}</p>}
      {!d && !err && <p className="text-sm text-muted-foreground">Chargement…</p>}
      {d && (
        <div className="space-y-6">
          <BalanceCard
            amount={n(d.balance)}
            subtitle="Gains des ventes livrées, moins les retraits et les remboursements."
            actions={<Link to="/dashboard/paiements" className={primaryBtn}>Retirer mon argent <ArrowRight size={16} /></Link>}
            lines={[
              { icon: BadgeCheck, tone: "text-emerald-400 bg-emerald-500/12", label: "Vos gains (ventes livrées)", hint: "Après commission Amachia", value: n(d.totals.delivered_net) },
              { icon: Clock, tone: "text-amber-400 bg-amber-500/12", label: "Gains à venir", hint: "Ventes en préparation ou en livraison", value: n(d.totals.pending_net) },
            ]}
            note="Ce solde est le vôtre : les commissions Amachia ont déjà été prélevées. Vous pouvez le retirer en totalité depuis la page Paiements."
          />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Kpi icon={ShoppingBag} label="Ventes (prix payé par les clients)" value={money(n(d.totals.gross))} />
            <Kpi icon={BadgeCheck} label="Vos gains (ventes livrées)" value={money(n(d.totals.delivered_net))} />
            <Kpi icon={Clock} label="Gains à venir (en livraison)" value={money(n(d.totals.pending_net))} />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="rounded-2xl border border-border bg-card p-5">
              <h2 className="mb-1 font-bold">Taux de commission</h2>
              <p className="mb-4 text-xs text-muted-foreground">Fixé par Amachia pour chaque catégorie, appliqué au prix de vente (après réduction éventuelle).</p>
              {d.enabled === false && <p className="mb-3 rounded-lg bg-green-50 p-2.5 text-xs font-medium text-green-700">Commissions suspendues par Amachia : vos nouvelles commandes n'ont aucune commission pour le moment.</p>}
              <SpecTable head={["Catégorie", "Taux"]} minWidth={240} rows={d.rates.map((r) => ({ label: r.category, value: <span className="text-primary">{n(r.pct)} %</span> }))} />
            </div>
            <div className="min-w-0 rounded-2xl border border-border bg-card p-4 sm:p-5 lg:col-span-2">
              <h2 className="mb-3 font-bold">Comment votre solde est calculé</h2>
              <SpecTable ops minWidth={320} rows={[
                { label: "Gains des ventes livrées (après commission)", op: "+", value: money(n(d.totals.delivered_net)) },
                { label: "Retraits demandés ou déjà versés", op: "−", value: money(n(d.withdrawn)) },
                ...(n(d.refunds) > 0 ? [{ label: "Remboursements clients", op: "−" as const, value: money(n(d.refunds)) }] : []),
              ]} total={{ label: "Solde disponible", value: money(n(d.balance)) }} />
              <p className="mt-4 flex items-start gap-2 rounded-xl bg-secondary p-3 text-xs text-muted-foreground"><Info size={14} className="mt-px shrink-0" />Les ventes encore en préparation ou en livraison s'ajoutent à votre solde dès qu'elles sont livrées. Les commandes passées avant la mise en place des commissions ne sont pas concernées (0 %).</p>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card">
            <div className="border-b border-border p-5"><h2 className="font-bold">Détail par vente</h2></div>
            {d.items.length === 0 ? <p className="p-5 text-sm text-muted-foreground">Aucune vente pour le moment.</p> : (
              <>
              <div className="max-h-[520px] overflow-auto p-3 [scrollbar-width:thin] sm:p-4">
                <table className="amx-table min-w-[720px] text-sm">
                  <thead className="text-left text-xs text-muted-foreground"><tr className="border-b border-border">
                    <th className="p-3">Vente</th><th className="p-3">Catégorie</th><th className="p-3 text-right">Prix de vente</th><th className="p-3 text-right">Taux de commission</th><th className="p-3 text-right">Vous recevez</th><th className="p-3">Statut</th>
                  </tr></thead>
                  <tbody>{d.items.map((it, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      <td className="p-3"><div className="flex items-center gap-3">{it.image ? <img {...imgProps(it.image, { width: 64 })} loading="lazy" alt="" className="h-10 w-10 shrink-0 rounded-lg border border-border bg-white object-cover" /> : <div className="h-10 w-10 rounded-lg bg-secondary" />}<div className="min-w-0"><p className="max-w-[240px] truncate font-medium">{it.qty} × {it.title}</p><p className="text-xs text-muted-foreground">{it.order_number} · {dateTime(it.created_at)}</p></div></div></td>
                      <td className="p-3 text-xs">{it.category}</td>
                      <td className="p-3 whitespace-nowrap text-right">{money(n(it.gross))}</td>
                      <td className="whitespace-nowrap p-3 text-right text-muted-foreground">{n(it.pct)} %</td>
                      <td className="p-3 whitespace-nowrap text-right font-bold">{money(n(it.net))}</td>
                      <td className="p-3 text-xs">{STATUS[it.status] ?? it.status}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              </>
            )}
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

function Kpi({ icon: Icon, label, value }: { icon: AnyIcon; label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-border bg-card p-3.5 sm:p-4">
      <div className="mb-2 flex items-start gap-2 text-[11px] leading-snug text-muted-foreground sm:text-xs"><Icon size={14} className="mt-px shrink-0" />{label}</div>
      <p className="break-words text-base font-extrabold tabular-nums sm:text-xl">{value}</p>
    </div>
  );
}
