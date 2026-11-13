import { useState } from "react";
import { Check, Plus } from "lucide-react";

/** Couleurs proposées d'office au vendeur (nom affiché aux clients + teinte). */
export const COLOR_PALETTE: { name: string; hex: string }[] = [
  { name: "Noir", hex: "#1c1c1c" },
  { name: "Blanc", hex: "#ffffff" },
  { name: "Gris", hex: "#9ca3af" },
  { name: "Argent", hex: "#c0c6cc" },
  { name: "Or", hex: "#d4af37" },
  { name: "Beige", hex: "#e8d8b8" },
  { name: "Marron", hex: "#7c4a2d" },
  { name: "Rouge", hex: "#dc2626" },
  { name: "Bordeaux", hex: "#7f1d1d" },
  { name: "Rose", hex: "#ec4899" },
  { name: "Orange", hex: "#f97316" },
  { name: "Jaune", hex: "#facc15" },
  { name: "Vert", hex: "#16a34a" },
  { name: "Kaki", hex: "#78716c" },
  { name: "Turquoise", hex: "#14b8a6" },
  { name: "Bleu ciel", hex: "#7dd3fc" },
  { name: "Bleu", hex: "#2563eb" },
  { name: "Bleu marine", hex: "#1e3a8a" },
  { name: "Violet", hex: "#7c3aed" },
  { name: "Multicolore", hex: "conic-gradient(#ef4444, #f59e0b, #22c55e, #3b82f6, #a855f7, #ef4444)" },
];

/**
 * Une valeur de couleur est enregistrée sous la forme « Nom » (couleur de la
 * palette), « Nom #rrggbb » (couleur personnalisée) ou « #rrggbb » (ancien format).
 */
export function colorParts(value: string): { name: string; css: string } {
  const v = value.trim();
  const m = /^(.*?)\s*(#[0-9a-f]{3,8})$/i.exec(v);
  if (m) return { name: m[1].trim() || m[2].toUpperCase(), css: m[2] };
  const known = COLOR_PALETTE.find((c) => c.name.toLowerCase() === v.toLowerCase());
  return { name: v, css: known?.hex ?? v };
}

export function ColorSwatch({ value, size = 28 }: { value: string; size?: number }) {
  const { css } = colorParts(value);
  return (
    <span
      className="inline-block shrink-0 rounded-full border border-black/15 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.25)]"
      style={{ width: size, height: size, background: css }}
    />
  );
}

/** Sélecteur de couleurs : palette en pastilles + couleur personnalisée nommée. */
export function ColorPicker({ selected, onToggle }: { selected: string[]; onToggle: (value: string) => void }) {
  const [customName, setCustomName] = useState("");
  const [customHex, setCustomHex] = useState("#8e4585");
  const isSelected = (name: string) => selected.some((s) => colorParts(s).name.toLowerCase() === name.toLowerCase());
  const customs = selected.filter((s) => !COLOR_PALETTE.some((c) => c.name.toLowerCase() === colorParts(s).name.toLowerCase()));

  function addCustom() {
    const name = customName.trim();
    if (!name) return;
    if (isSelected(name)) return;
    onToggle(`${name} ${customHex.toLowerCase()}`);
    setCustomName("");
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3 sm:grid-cols-5 md:grid-cols-7">
        {COLOR_PALETTE.map((c) => {
          const on = isSelected(c.name);
          return (
            <button
              key={c.name}
              type="button"
              onClick={() => onToggle(c.name)}
              aria-pressed={on}
              className="group flex flex-col items-center gap-1.5 rounded-xl p-1.5 transition hover:bg-secondary/60"
            >
              <span className={`relative grid h-11 w-11 place-items-center rounded-full p-[3px] ring-2 transition ${on ? "ring-primary" : "ring-transparent group-hover:ring-border"}`}>
                <span className="h-full w-full rounded-full border border-black/15 shadow-sm" style={{ background: c.hex }} />
                {on && (
                  <span className="absolute -right-0.5 -top-0.5 grid h-5 w-5 place-items-center rounded-full bg-primary text-white shadow">
                    <Check size={12} strokeWidth={3} />
                  </span>
                )}
              </span>
              <span className={`text-center text-[11px] leading-tight ${on ? "font-semibold text-primary" : "text-muted-foreground"}`}>{c.name}</span>
            </button>
          );
        })}
      </div>

      {customs.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {customs.map((v) => (
            <button key={v} type="button" onClick={() => onToggle(v)} className="flex items-center gap-2 rounded-full border border-primary bg-primary/10 py-1 pl-1 pr-3 text-xs font-semibold text-primary" title="Retirer">
              <ColorSwatch value={v} size={22} /> {colorParts(v).name} <span aria-hidden>×</span>
            </button>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-dashed border-border p-3">
        <p className="mb-2 text-xs font-semibold text-muted-foreground">Autre couleur</p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative h-10 w-10 shrink-0 cursor-pointer overflow-hidden rounded-full border border-border shadow-sm" style={{ background: customHex }} title="Choisir la teinte">
            <input type="color" value={customHex} onChange={(e) => setCustomHex(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
          </label>
          <input
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }}
            placeholder="Nom de la couleur (ex : Prune, Vert pomme…)"
            maxLength={30}
            className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
          />
          <button
            type="button"
            onClick={addCustom}
            disabled={!customName.trim()}
            className="flex items-center gap-1 rounded-xl bg-gradient-primary px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-40"
          >
            <Plus size={14} /> Ajouter
          </button>
        </div>
      </div>
    </div>
  );
}
