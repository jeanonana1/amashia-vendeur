import { Link, createFileRoute } from "@tanstack/react-router";
import { imgProps } from "@/lib/img";
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
    <DashboardLayout title="Commissions" subtitle="Ce qu'Amashia prélève sur vos ventes, et ce qui vous revient">
      {err && <p className="mb-4 rounded-xl bg-destructive/10 p-4 text-sm text-destructive">{err}</p>}
      {!d && !err && <p className="text-sm text-muted-foreground">Chargement…</p>}
      {d && (
        <div className="space-y-6">
          <div className="rounded-2xl bg-gradient-primary p-6 text-black">
            <div className="flex items-center gap-2 text-sm font-semibold opacity-90"><Wallet size={18} /> Votre solde disponible</div>
            <p className="mt-1 break-words text-3xl font-extrabold sm:text-4xl">{money(n(d.balance))}</p>
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
            <div className="min-w-0 rounded-2xl border border-border bg-card p-4 sm:p-5 lg:col-span-2">
              <h2 className="mb-3 font-bold">Comment votre solde est calculé</h2>
              <div className="-mx-1 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
                <table className="w-full min-w-[330px] border-separate border-spacing-0 overflow-hidden rounded-xl border border-border text-sm">
                  <thead>
                    <tr className="bg-secondary/50 text-left">
                      <th className="border-b border-border px-3 py-2.5">Élément</th>
                      <th className="w-12 border-b border-l border-border px-2 py-2.5 text-center sm:w-24 sm:px-3"><span className="sm:hidden">±</span><span className="hidden sm:inline">Opération</span></th>
                      <th className="border-b border-l border-border px-3 py-2.5 text-right sm:w-40">Montant</th>
                    </tr>
                  </thead>
                  <tbody>
                    <CalcRow l="Gains des ventes livrées (après commission)" op="+" v={n(d.totals.delivered_net)} />
                    <CalcRow l="Retraits demandés ou déjà versés" op="−" v={n(d.withdrawn)} />
                    {n(d.refunds) > 0 && <CalcRow l="Remboursements clients" op="−" v={n(d.refunds)} />}
                    <tr className="bg-primary/10 font-bold">
                      <td className="px-3 py-3">Solde disponible</td>
                      <td className="border-l border-border px-2 py-3 text-center text-primary sm:px-3">=</td>
                      <td className="whitespace-nowrap border-l border-border px-3 py-3 text-right tabular-nums text-primary">{money(n(d.balance))}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="mt-4 flex items-start gap-2 rounded-xl bg-secondary p-3 text-xs text-muted-foreground"><Info size={14} className="mt-px shrink-0" />Les ventes encore en préparation ou en livraison s'ajoutent à votre solde dès qu'elles sont livrées. Les commandes passées avant la mise en place des commissions ne sont pas concernées (0 %).</p>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card">
            <div className="border-b border-border p-5"><h2 className="font-bold">Détail par vente</h2></div>
            {d.items.length === 0 ? <p className="p-5 text-sm text-muted-foreground">Aucune vente pour le moment.</p> : (
              <>
              <ul className="divide-y divide-border sm:hidden">
                {d.items.map((it, i) => (
                  <li key={i} className="flex items-center gap-3 p-3">
                    {it.image ? <img {...imgProps(it.image, { width: 64 })} loading="lazy" alt="" className="aspect-square h-14 w-14 shrink-0 rounded-lg border border-border bg-white object-cover" /> : <div className="h-14 w-14 shrink-0 rounded-lg bg-secondary" />}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium">{it.qty} × {it.title}</p>
                        <p className="shrink-0 text-sm font-bold">{money(n(it.net))}</p>
                      </div>
                      <p className="truncate text-[11px] text-muted-foreground">{it.order_number} · {dateTime(it.created_at)}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{money(n(it.gross))} − {money(n(it.commission))} ({n(it.pct)} %) · {STATUS[it.status] ?? it.status}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground"><tr className="border-b border-border">
                    <th className="p-3">Vente</th><th className="p-3">Catégorie</th><th className="p-3 text-right">Prix de vente</th><th className="p-3 text-right">Commission</th><th className="p-3 text-right">Vous recevez</th><th className="p-3">Statut</th>
                  </tr></thead>
                  <tbody>{d.items.map((it, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      <td className="p-3"><div className="flex items-center gap-3">{it.image ? <img {...imgProps(it.image, { width: 64 })} loading="lazy" alt="" className="h-10 w-10 shrink-0 rounded-lg border border-border bg-white object-cover" /> : <div className="h-10 w-10 rounded-lg bg-secondary" />}<div className="min-w-0"><p className="line-clamp-1 font-medium">{it.qty} × {it.title}</p><p className="text-xs text-muted-foreground">{it.order_number} · {dateTime(it.created_at)}</p></div></div></td>
                      <td className="p-3 text-xs">{it.category}</td>
                      <td className="p-3 text-right">{money(n(it.gross))}</td>
                      <td className="p-3 text-right text-muted-foreground">− {money(n(it.commission))} <span className="text-[11px]">({n(it.pct)} %)</span></td>
                      <td className="p-3 text-right font-bold">{money(n(it.net))}</td>
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

function Kpi({ icon: Icon, label, value }: { icon: typeof Wallet; label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-border bg-card p-3.5 sm:p-4">
      <div className="mb-2 flex items-start gap-2 text-[11px] leading-snug text-muted-foreground sm:text-xs"><Icon size={14} className="mt-px shrink-0" />{label}</div>
      <p className="break-words text-base font-extrabold tabular-nums sm:text-xl">{value}</p>
    </div>
  );
}
function CalcRow({ l, op, v }: { l: string; op: "+" | "−"; v: number }) {
  return (
    <tr>
      <td className="border-b border-border px-3 py-3 text-[13px] leading-snug text-muted-foreground sm:text-sm">{l}</td>
      <td className={`border-b border-l border-border px-2 py-3 text-center font-bold sm:px-3 ${op === "+" ? "text-emerald-400" : "text-red-400"}`}>{op}</td>
      <td className="whitespace-nowrap border-b border-l border-border px-3 py-3 text-right font-semibold tabular-nums">{money(v)}</td>
    </tr>
  );
}
