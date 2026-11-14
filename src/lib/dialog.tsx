import { useEffect, useRef, useState } from "react";
import { AlertTriangle, HelpCircle, X } from "lucide-react";
import { playSound } from "@/lib/sound";

/**
 * Fenêtres de confirmation / saisie aux couleurs d'Amashia, à la place des
 * fenêtres du navigateur (confirm, prompt).
 *
 *   if (!(await askConfirm({ title: "Supprimer ce produit ?", danger: true }))) return;
 *   const url = await askText({ title: "Adresse du lien", placeholder: "https://…" });
 */

type ConfirmOptions = { title: string; message?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean };
type TextOptions = { title: string; message?: string; placeholder?: string; initial?: string; confirmLabel?: string };
type Request =
  | ({ kind: "confirm"; resolve: (v: boolean) => void } & ConfirmOptions)
  | ({ kind: "text"; resolve: (v: string | null) => void } & TextOptions);

let push: ((r: Request) => void) | null = null;
const queue: Request[] = [];

export function askConfirm(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const r: Request = { kind: "confirm", resolve, ...opts };
    if (push) push(r); else queue.push(r);
  });
}

export function askText(opts: TextOptions): Promise<string | null> {
  return new Promise((resolve) => {
    const r: Request = { kind: "text", resolve, ...opts };
    if (push) push(r); else queue.push(r);
  });
}

/** À placer une fois dans la page racine. */
export function DialogHost() {
  const [current, setCurrent] = useState<Request | null>(null);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const okRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    push = (r) => setCurrent((c) => { if (c) { queue.push(r); return c; } return r; });
    const first = queue.shift();
    if (first) setCurrent(first);
    return () => { push = null; };
  }, []);

  useEffect(() => {
    if (!current) return;
    setValue(current.kind === "text" ? current.initial ?? "" : "");
    if (current.kind === "confirm" && current.danger) playSound("warning");
    const t = window.setTimeout(() => (current.kind === "text" ? inputRef.current?.focus() : okRef.current?.focus()), 30);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(false); };
    window.addEventListener("keydown", onKey);
    return () => { window.clearTimeout(t); window.removeEventListener("keydown", onKey); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  function close(ok: boolean) {
    if (!current) return;
    if (current.kind === "confirm") current.resolve(ok);
    else current.resolve(ok ? value.trim() || null : null);
    setCurrent(queue.shift() ?? null);
  }

  if (!current) return null;
  const danger = current.kind === "confirm" && current.danger;
  const Icon = danger ? AlertTriangle : HelpCircle;

  return (
    <div className="fixed inset-0 z-[300] grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => close(false)} role="presentation">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="amashia-dialog-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm animate-[dialog-in_160ms_ease-out] rounded-2xl border border-border bg-card p-5 shadow-2xl"
      >
        <div className="flex items-start gap-3">
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${danger ? "bg-red-500/15 text-red-400" : "bg-primary/15 text-primary"}`}><Icon size={19} /></span>
          <div className="min-w-0 flex-1">
            <h3 id="amashia-dialog-title" className="font-bold leading-snug">{current.title}</h3>
            {current.message && <p className="mt-1 text-sm text-muted-foreground">{current.message}</p>}
          </div>
          <button onClick={() => close(false)} className="grid h-7 w-7 shrink-0 place-items-center rounded-lg hover:bg-secondary" aria-label="Fermer"><X size={14} /></button>
        </div>
        {current.kind === "text" && (
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") close(true); }}
            placeholder={current.placeholder}
            className="mt-4 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
          />
        )}
        <div className="mt-5 flex gap-2">
          <button onClick={() => close(false)} className="flex-1 rounded-full bg-secondary py-2.5 text-sm font-semibold">{current.kind === "confirm" ? current.cancelLabel ?? "Annuler" : "Annuler"}</button>
          <button
            ref={okRef}
            onClick={() => close(true)}
            className={`flex-1 rounded-full py-2.5 text-sm font-semibold ${danger ? "bg-red-500 text-white" : "bg-primary text-black"}`}
          >
            {current.confirmLabel ?? (danger ? "Supprimer" : "Confirmer")}
          </button>
        </div>
      </div>
    </div>
  );
}
