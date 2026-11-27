import type { ReactNode } from "react";
import { IconVerifie as BadgeCheck, IconPortefeuille as Wallet } from "@/components/icons/AmachiaIcons";

import type { AnyIcon } from "@/components/icons/AmachiaIcons";
type Line = { icon: AnyIcon; tone: string; label: string; hint: string; value: number };

/** Carte « Solde disponible » (pages Paiements et Commissions) : même design partout. */
export function BalanceCard({ amount, loading, subtitle, chip, actions, footer, lines, note }: {
  amount: number; loading?: boolean; subtitle: string; chip?: string; actions?: ReactNode; footer?: ReactNode; lines: Line[]; note: ReactNode;
}) {
  return (
    <section className="relative mb-6 overflow-hidden rounded-[1.5rem] border border-border bg-card shadow-card">
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-40" />
      <div className="relative grid grid-cols-[minmax(0,1fr)] gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-black"><Wallet size={18} /></span>
            <span className="text-sm font-semibold text-muted-foreground">Solde disponible</span>
            {chip && <span className="ml-auto rounded-full border border-border bg-background/60 px-2.5 py-1 text-[10px] font-semibold text-muted-foreground">{chip}</span>}
          </div>
          <p className="mt-4 flex items-start gap-1 font-extrabold tabular-nums leading-none tracking-tight">
            <span className="text-[2.6rem] sm:text-5xl">{loading ? "…" : Math.round(amount).toLocaleString("fr-FR")}</span>
            <span className="mt-1 text-xs font-bold text-primary sm:text-sm">FCFA</span>
          </p>
          <p className="mt-2 text-xs text-muted-foreground">{subtitle}</p>
          {actions && <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">{actions}</div>}
          {footer}
        </div>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-px overflow-hidden rounded-2xl border border-border bg-border">
          {lines.map((l) => (
            <div key={l.label} className="flex items-center gap-3 bg-card px-4 py-3.5">
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${l.tone}`}><l.icon size={16} /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{l.label}</p>
                <p className="truncate text-[11px] text-muted-foreground">{l.hint}</p>
              </div>
              <p className="shrink-0 whitespace-nowrap text-right font-extrabold tabular-nums">{Math.round(l.value).toLocaleString("fr-FR")}<span className="ml-0.5 align-super text-[9px] text-muted-foreground">FCFA</span></p>
            </div>
          ))}
        </div>
      </div>
      <p className="relative flex items-start gap-2 border-t border-border bg-background/40 px-5 py-3 text-[11px] text-muted-foreground sm:px-7">
        <BadgeCheck size={14} className="mt-px shrink-0 text-primary" />
        {note}
      </p>
    </section>
  );
}

export const primaryBtn = "cta-sweep flex h-12 items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-bold text-black shadow-[0_10px_30px_-10px_var(--primary)] transition hover:brightness-95 disabled:opacity-50 disabled:shadow-none";
export const ghostBtn = "flex h-12 items-center justify-center gap-1.5 rounded-full border border-border px-5 text-sm font-semibold hover:border-primary hover:text-primary";
