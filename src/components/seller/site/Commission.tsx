import { useEffect, useMemo, useState } from "react";
import { Calculator } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Select } from "@/components/ui/app-select";

export type Rate = { slug: string; name: string; rate: number };

/** Taux de commission réels (base Amashia), par catégorie. */
export function useCommissionRates() {
  const [rates, setRates] = useState<Rate[] | null>(null);
  useEffect(() => {
    void (supabase as unknown as { rpc: (f: string) => Promise<{ data: Rate[] | null }> }).rpc("public_commission_rates")
      .then(({ data }) => setRates((data ?? []).map((r) => ({ ...r, rate: Number(r.rate) }))));
  }, []);
  return rates;
}

const fcfa = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} FCFA`;

/** Simulateur : prix de vente → commission → montant reçu. */
export function CommissionCalculator({ rates }: { rates: Rate[] | null }) {
  const [price, setPrice] = useState("25000");
  const [cat, setCat] = useState<string>("");
  useEffect(() => { if (rates?.length && !cat) setCat(rates[0].slug); }, [rates, cat]);
  const rate = useMemo(() => rates?.find((r) => r.slug === cat)?.rate ?? 0, [rates, cat]);
  const p = Number(price.replace(/\D/g, "")) || 0;
  const fee = Math.round((p * rate) / 100);
  return (
    <div className="ring-gradient rounded-[1.4rem] border border-border bg-card p-6 shadow-card sm:p-8">
      <div className="flex items-center gap-2 text-sm font-bold"><span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/12 text-primary"><Calculator size={17} /></span>Simulez votre gain</div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-muted-foreground">Prix de vente
          <div className="mt-1.5 flex items-center rounded-xl border border-border bg-[var(--surface-2)] px-3 focus-within:ring-2 focus-within:ring-primary">
            <input inputMode="numeric" value={Number(price || 0).toLocaleString("fr-FR")} onChange={(e) => setPrice(e.target.value.replace(/\D/g, "").slice(0, 9))} className="tabular h-12 w-full min-w-0 flex-1 bg-transparent text-lg font-bold text-foreground outline-none" />
            <span className="text-sm font-semibold">FCFA</span>
          </div>
        </label>
        <label className="text-sm font-medium text-muted-foreground">Catégorie
          <Select value={cat} onChange={(e) => setCat(e.target.value)} className="mt-1.5 h-12 w-full rounded-xl border border-border bg-[var(--surface-2)] px-3 text-[15px] font-semibold text-foreground outline-none focus:ring-2 focus:ring-primary">
            {(rates ?? []).map((r) => <option key={r.slug} value={r.slug}>{r.name} · {r.rate} %</option>)}
          </Select>
        </label>
      </div>
      <div className="mt-6 space-y-3 rounded-2xl bg-[var(--surface-2)] p-5">
        <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 text-sm"><span className="text-muted-foreground">Prix payé par le client</span><span className="tabular whitespace-nowrap font-semibold">{fcfa(p)}</span></div>
        <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 text-sm"><span className="text-muted-foreground">Commission Amashia ({rate} %)</span><span className="tabular whitespace-nowrap font-semibold">− {fcfa(fee)}</span></div>
        <div className="flex flex-col gap-1 border-t border-border pt-3 sm:flex-row sm:items-end sm:justify-between">
          <span className="font-semibold">Vous recevez</span>
          <span className="tabular whitespace-nowrap text-[1.9rem] font-extrabold leading-none text-primary sm:text-3xl">{Math.round(p - fee).toLocaleString("fr-FR")}<sup className="ml-1 align-super text-xs font-bold">FCFA</sup></span>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Taux réels de la catégorie, appliqués uniquement aux commandes livrées. Les frais de livraison sont payés par le client.</p>
    </div>
  );
}
