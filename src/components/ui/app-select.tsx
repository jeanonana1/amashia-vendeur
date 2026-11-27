import { Children, Fragment, isValidElement, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";
import { IconChevronBas as ChevronDown, IconRecherche as Search, IconFermer as X } from "@/components/icons/AmachiaIcons";

/**
 * Menu déroulant Amachia : remplace le <Select> du navigateur partout sur le site vendeur.
 * S'utilise exactement comme un <select> (value, onChange(e) avec e.target.value, <option>, <optgroup>),
 * mais ouvre notre propre fenêtre : feuille en bas de l'écran sur mobile, fenêtre centrée sur ordinateur.
 */

type Item = { value: string; label: string; disabled?: boolean; group?: string };

function textOf(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children);
  return "";
}

function collect(children: ReactNode, group?: string, out: Item[] = []): Item[] {
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const props = child.props as { children?: ReactNode; value?: unknown; label?: string; disabled?: boolean };
    if (child.type === Fragment) collect(props.children, group, out);
    else if (child.type === "optgroup") collect(props.children, props.label, out);
    else if (child.type === "option") {
      const label = textOf(props.children);
      out.push({ value: props.value !== undefined ? String(props.value) : label, label, disabled: props.disabled, group });
    }
  });
  return out;
}

type Props = {
  value?: string | number | null;
  onChange?: (e: { target: { value: string; name?: string }; currentTarget: { value: string; name?: string } }) => void;
  children?: ReactNode;
  className?: string;
  disabled?: boolean;
  name?: string;
  id?: string;
  /** Titre de la fenêtre (sinon : le texte du libellé qui entoure le menu, ou « Choisir ») */
  title?: string;
  "aria-label"?: string;
};

export function Select({ value, onChange, children, className = "", disabled, name, id, title, ...rest }: Props) {
  const items = useMemo(() => collect(children), [children]);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const btn = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const current = String(value ?? "");
  const selected = items.find((i) => i.value === current);
  const isPlaceholder = !selected || selected.value === "";

  // titre : le libellé visible autour du menu
  const [heading, setHeading] = useState(title ?? "");
  const openSheet = () => {
    if (disabled) return;
    if (!title) {
      const lab = btn.current?.closest("label");
      const prev = btn.current?.parentElement?.querySelector("label, span.block, p");
      const t = (lab ? Array.from(lab.childNodes).filter((n) => n !== btn.current && !(n as HTMLElement).contains?.(btn.current!)).map((n) => n.textContent).join(" ") : prev?.textContent) ?? "";
      setHeading(t.replace(/\*/g, "").trim() || rest["aria-label"] || "Choisir une option");
    }
    setQ("");
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // on fait apparaître l'option choisie
    requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>("[data-selected='true']")?.scrollIntoView({ block: "center" }));
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prevOverflow; };
  }, [open]);

  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const shown = q ? items.filter((i) => norm(i.label).includes(norm(q))) : items;
  const pick = (v: string) => {
    setOpen(false);
    if (v !== current) onChange?.({ target: { value: v, name }, currentTarget: { value: v, name } });
    btn.current?.focus();
  };

  let lastGroup: string | undefined;
  return (
    <>
      <button
        ref={btn}
        type="button"
        id={id}
        name={name}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={rest["aria-label"]}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); openSheet(); }}
        className={`${className.replace(/(^|\s)(block|inline-block)(?=\s|$)/g, " ")} ${/\b(block|w-full)\b/.test(className) ? "flex w-full" : "inline-flex"} min-w-0 items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:opacity-50`}
      >
        <span className={`min-w-0 flex-1 truncate ${isPlaceholder ? "text-muted-foreground" : ""}`}>{selected?.label ?? "Choisir"}</span>
        <ChevronDown size={16} className="shrink-0 opacity-60" />
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[300] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={(e) => { e.stopPropagation(); setOpen(false); }}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="app-select-sheet flex max-h-[82vh] w-full flex-col overflow-hidden rounded-t-3xl border border-border bg-card text-foreground shadow-2xl sm:max-h-[70vh] sm:max-w-md sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-border sm:hidden" />
            <div className="flex shrink-0 items-center justify-between gap-3 px-5 pb-3 pt-3 sm:pt-5">
              <p className="min-w-0 truncate font-bold">{heading || "Choisir une option"}</p>
              <button type="button" onClick={() => setOpen(false)} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-secondary text-muted-foreground hover:text-foreground" aria-label="Fermer"><X size={16} /></button>
            </div>
            {items.length > 8 && (
              <div className="relative mx-5 mb-2 shrink-0">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input autoFocus={typeof window !== "undefined" && window.innerWidth >= 640} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher…" className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary" />
              </div>
            )}
            <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {shown.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Aucun résultat</p>}
              {shown.map((it, i) => {
                const header = it.group && it.group !== lastGroup ? it.group : null;
                lastGroup = it.group;
                const on = it.value === current;
                return (
                  <Fragment key={`${it.value}-${i}`}>
                    {header && <p className="px-3 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{header}</p>}
                    <button
                      type="button"
                      disabled={it.disabled}
                      data-selected={on}
                      onClick={() => pick(it.value)}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition disabled:opacity-40 ${on ? "bg-primary/12 font-semibold text-primary" : "hover:bg-secondary/70"}`}
                    >
                      <span className={`min-w-0 flex-1 ${it.value === "" ? "text-muted-foreground" : ""}`}>{it.label}</span>
                      {on && <Check size={16} className="shrink-0" />}
                    </button>
                  </Fragment>
                );
              })}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
