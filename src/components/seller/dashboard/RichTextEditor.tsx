import { useEffect, useRef, useState } from "react";
import {
  Bold, Italic, Underline, Strikethrough, List, ListOrdered, Quote,
  Heading1, Heading2, Heading3, Link as LinkIcon, Undo, Redo,
  AlignLeft, AlignCenter, AlignRight, Type, Minus, Code, ChevronDown,
} from "lucide-react";

type Props = { value: string; onChange: (html: string) => void; placeholder?: string };

const CMDS = ["bold", "italic", "underline", "strikeThrough", "insertUnorderedList", "insertOrderedList", "justifyLeft", "justifyCenter", "justifyRight"] as const;

export function RichTextEditor({ value, onChange, placeholder }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const savedRange = useRef<Range | null>(null);
  const [active, setActive] = useState<Record<string, boolean>>({});
  const [block, setBlockName] = useState<string>("p");
  const [size, setSizeValue] = useState<string>("3");
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) {
      ref.current.innerHTML = value || "";
    }
  }, [value]);

  const saveSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && ref.current?.contains(sel.anchorNode)) {
      savedRange.current = sel.getRangeAt(0).cloneRange();
    }
  };

  const restoreSelection = () => {
    const sel = window.getSelection();
    if (!sel) return;
    if (savedRange.current) {
      sel.removeAllRanges();
      sel.addRange(savedRange.current);
    } else {
      ref.current?.focus();
    }
  };

  useEffect(() => {
    if (!openMenu) return;
    const close = () => setOpenMenu(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [openMenu]);

  const refreshState = () => {
    const next: Record<string, boolean> = {};
    try {
      CMDS.forEach((c) => { next[c] = document.queryCommandState(c); });
      const bv = document.queryCommandValue("formatBlock") || "";
      const clean = String(bv).replace(/[<>]/g, "").toLowerCase() || "p";
      setBlockName(clean === "div" ? "p" : clean);
      const fs = String(document.queryCommandValue("fontSize") || "");
      if (fs) setSizeValue(fs);
    } catch { /* ignore */ }
    setActive(next);
  };

  const exec = (cmd: string, arg?: string) => {
    ref.current?.focus();
    restoreSelection();
    document.execCommand(cmd, false, arg);
    if (ref.current) onChange(ref.current.innerHTML);
    saveSelection();
    // Defer so the DOM state after execCommand is reflected by queryCommandState
    setTimeout(refreshState, 0);
  };

  const setBlock = (tag: string) => exec("formatBlock", `<${tag}>`);
  const link = () => {
    const url = prompt("URL du lien ?");
    if (url) exec("createLink", url);
  };
  const setSize = (size: string) => exec("fontSize", size);

  const Btn = ({ onClick, title, children, activeKey }: any) => (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      className={`w-8 h-8 grid place-items-center rounded-lg transition ${activeKey && active[activeKey] ? "bg-primary text-white" : "hover:bg-secondary text-foreground"}`}
    >
      {children}
    </button>
  );

  const isBlock = (t: string) => block === t;

  const Sep = () => <span className="w-px h-5 bg-border mx-0.5" />;

  // Custom dropdown: a native <select> can't be used here because keeping the
  // text selection requires preventDefault on mousedown, which blocks its popup.
  const Dropdown = ({ label, items, current, onPick, width = "w-44" }: {
    label: string;
    items: { value: string; label: string }[];
    current?: string;
    onPick: (v: string) => void;
    width?: string;
  }) => {
    const openKey = `dd-${label}`;
    const isOpen = openMenu === openKey;
    const currentLabel = items.find((i) => i.value === current)?.label || label;
    return (
      <div className="relative">
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); saveSelection(); }}
          onClick={() => setOpenMenu(isOpen ? null : openKey)}
          className="h-8 px-2 text-xs bg-background border border-border rounded-lg inline-flex items-center gap-1 hover:border-primary"
          title={label}
        >
          {currentLabel} <ChevronDown size={12} />
        </button>
        {isOpen && (
          <div className={`absolute left-0 top-full mt-1 z-30 ${width} bg-card border border-border rounded-xl shadow-elegant p-1 max-h-72 overflow-y-auto`}>
            {items.map((it) => (
              <button
                key={it.value}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onPick(it.value); setOpenMenu(null); }}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs hover:bg-secondary ${current === it.value ? "bg-primary/15 text-primary font-semibold" : ""}`}
              >
                {it.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-background">
      <div className="flex flex-wrap items-center gap-0.5 p-2 border-b border-border bg-secondary/40">
        <Btn onClick={() => exec("undo")} title="Annuler"><Undo size={15} /></Btn>
        <Btn onClick={() => exec("redo")} title="Rétablir"><Redo size={15} /></Btn>
        <Sep />
        <Dropdown
          label="Paragraphe"
          current={block}
          onPick={setBlock}
          items={[
            { value: "p", label: "Paragraphe" },
            { value: "h2", label: "Titre H2" },
            { value: "h3", label: "Titre H3" },
            { value: "h4", label: "Titre H4" },
            { value: "h5", label: "Titre H5" },
            { value: "h6", label: "Titre H6" },
            { value: "blockquote", label: "Citation" },
            { value: "pre", label: "Préformaté" },
          ]}
        />
        <Dropdown
          label="Taille"
          current={size}
          onPick={(v) => { setSizeValue(v); setSize(v); }}
          width="w-40"
          items={[
            { value: "1", label: "Très petit" },
            { value: "2", label: "Petit" },
            { value: "3", label: "Normal" },
            { value: "4", label: "Moyen" },
            { value: "5", label: "Grand" },
            { value: "6", label: "Très grand" },
            { value: "7", label: "Énorme" },
          ]}
        />

        <Sep />
        <Btn onClick={() => exec("bold")} title="Gras" activeKey="bold"><Bold size={15} /></Btn>
        <Btn onClick={() => exec("italic")} title="Italique" activeKey="italic"><Italic size={15} /></Btn>
        <Btn onClick={() => exec("underline")} title="Souligné" activeKey="underline"><Underline size={15} /></Btn>
        <Btn onClick={() => exec("strikeThrough")} title="Barré" activeKey="strikeThrough"><Strikethrough size={15} /></Btn>
        <Sep />
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setBlock("h1")} title="Titre 1" className={`w-8 h-8 grid place-items-center rounded-lg transition ${isBlock("h1") ? "bg-primary text-white" : "hover:bg-secondary"}`}><Heading1 size={15} /></button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setBlock("h2")} title="Titre 2" className={`w-8 h-8 grid place-items-center rounded-lg transition ${isBlock("h2") ? "bg-primary text-white" : "hover:bg-secondary"}`}><Heading2 size={15} /></button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setBlock("h3")} title="Titre 3" className={`w-8 h-8 grid place-items-center rounded-lg transition ${isBlock("h3") ? "bg-primary text-white" : "hover:bg-secondary"}`}><Heading3 size={15} /></button>
        <Sep />
        <Btn onClick={() => exec("insertUnorderedList")} title="Liste à puces" activeKey="insertUnorderedList"><List size={15} /></Btn>
        <Btn onClick={() => exec("insertOrderedList")} title="Liste numérotée" activeKey="insertOrderedList"><ListOrdered size={15} /></Btn>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setBlock("blockquote")} title="Citation" className={`w-8 h-8 grid place-items-center rounded-lg transition ${isBlock("blockquote") ? "bg-primary text-white" : "hover:bg-secondary"}`}><Quote size={15} /></button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setBlock("pre")} title="Code" className={`w-8 h-8 grid place-items-center rounded-lg transition ${isBlock("pre") ? "bg-primary text-white" : "hover:bg-secondary"}`}><Code size={15} /></button>
        <Sep />
        <Btn onClick={() => exec("justifyLeft")} title="Aligner à gauche" activeKey="justifyLeft"><AlignLeft size={15} /></Btn>
        <Btn onClick={() => exec("justifyCenter")} title="Centrer" activeKey="justifyCenter"><AlignCenter size={15} /></Btn>
        <Btn onClick={() => exec("justifyRight")} title="Aligner à droite" activeKey="justifyRight"><AlignRight size={15} /></Btn>
        <Sep />
        <Btn onClick={link} title="Insérer un lien"><LinkIcon size={15} /></Btn>
        <Btn onClick={() => exec("insertHorizontalRule")} title="Séparateur"><Minus size={15} /></Btn>
        <Btn onClick={() => exec("removeFormat")} title="Effacer la mise en forme"><Type size={15} /></Btn>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={(e) => { onChange((e.target as HTMLDivElement).innerHTML); saveSelection(); refreshState(); }}
        onKeyUp={() => { saveSelection(); refreshState(); }}
        onMouseUp={() => { saveSelection(); refreshState(); }}
        onBlur={saveSelection}
        data-placeholder={placeholder || "Écrivez la description du produit..."}
        className="rte-content min-h-[180px] p-4 text-sm focus:outline-none prose prose-sm max-w-none prose-invert"
        style={{ lineHeight: 1.6 }}
      />
      <style>{`
        .rte-content:empty:before { content: attr(data-placeholder); color: hsl(var(--muted-foreground)); pointer-events: none; }
        .rte-content h1 { font-size: 1.6em; font-weight: 800; margin: 0.5em 0; }
        .rte-content h2 { font-size: 1.35em; font-weight: 700; margin: 0.5em 0; }
        .rte-content h3 { font-size: 1.15em; font-weight: 700; margin: 0.5em 0; }
        .rte-content ul { list-style: disc; padding-left: 1.5em; margin: 0.5em 0; }
        .rte-content ol { list-style: decimal; padding-left: 1.5em; margin: 0.5em 0; }
        .rte-content blockquote { border-left: 3px solid hsl(var(--primary)); padding-left: 1em; color: hsl(var(--muted-foreground)); margin: 0.5em 0; }
        .rte-content pre { background: hsl(var(--secondary)); padding: 0.75em; border-radius: 0.5em; font-family: monospace; overflow-x: auto; }
        .rte-content a { color: hsl(var(--primary)); text-decoration: underline; }
        .rte-content hr { border: 0; border-top: 1px solid hsl(var(--border)); margin: 1em 0; }
      `}</style>
    </div>
  );
}
