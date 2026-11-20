import type { ReactNode } from "react";

/**
 * Tableau Amachia (style « Comment votre solde est calculé ») : bordures, en-tête discret,
 * une ligne par élément, colonnes séparées par un trait. Défile de gauche à droite si l'écran est trop étroit.
 */
export function TableScroll({ children, minWidth = 0, className = "" }: { children: ReactNode; minWidth?: number; className?: string }) {
  return (
    <div className={`-mx-1 overflow-x-auto px-1 pb-1 [scrollbar-width:thin] ${className}`}>
      <div style={minWidth ? { minWidth } : undefined}>{children}</div>
    </div>
  );
}

type Row = { label: ReactNode; value: ReactNode; op?: "+" | "−" | "="; hint?: ReactNode; strong?: boolean };

/** Tableau « libellé → valeur » (avec colonne d'opération facultative et ligne de total). */
export function SpecTable({ rows, head = ["Élément", "Montant"], ops = false, minWidth = 300, total }: {
  rows: Row[]; head?: [string, string]; ops?: boolean; minWidth?: number; total?: Row;
}) {
  return (
    <TableScroll minWidth={minWidth}>
      <table className="amx-table text-sm">
        <thead>
          <tr>
            <th>{head[0]}</th>
            {ops && <th className="w-12 text-center">±</th>}
            <th className="text-right">{head[1]}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td className={r.strong ? "font-semibold text-foreground" : "text-muted-foreground"}>
                {r.label}
                {r.hint && <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground/80">{r.hint}</span>}
              </td>
              {ops && <td className={`text-center font-bold ${r.op === "+" ? "text-emerald-400" : r.op === "−" ? "text-red-400" : "text-primary"}`}>{r.op ?? ""}</td>}
              <td className="whitespace-nowrap text-right font-semibold tabular-nums">{r.value}</td>
            </tr>
          ))}
          {total && (
            <tr className="amx-total">
              <td>{total.label}</td>
              {ops && <td className="text-center">=</td>}
              <td className="whitespace-nowrap text-right tabular-nums">{total.value}</td>
            </tr>
          )}
        </tbody>
      </table>
    </TableScroll>
  );
}
