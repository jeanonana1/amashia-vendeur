/**
 * Nettoyage du texte mis en forme dans l'éditeur de description.
 *
 * Quand on colle un texte venant d'un autre site (Amazon, Word, une page
 * web…), le navigateur colle aussi ses couleurs, polices, fonds blancs et
 * classes. On ne garde que la structure utile (paragraphes, titres, listes,
 * gras, italique…) et uniquement l'alignement du texte comme style.
 */
const ALLOWED = new Set([
  "p", "br", "hr", "ul", "ol", "li", "strong", "b", "em", "i", "u", "s", "strike",
  "h2", "h3", "h4", "h5", "h6", "blockquote", "pre",
]);
const VOID = new Set(["br", "hr"]);
const REMAP: Record<string, string> = { h1: "h2" };

function keptStyle(attrs: string): string {
  const m = /style\s*=\s*("([^"]*)"|'([^']*)')/i.exec(attrs);
  const style = m ? (m[2] ?? m[3] ?? "") : "";
  const align = /text-align\s*:\s*(left|center|right|justify)/i.exec(style);
  return align ? ` style="text-align: ${align[1].toLowerCase()}"` : "";
}

export function cleanEditorHtml(html: string | null | undefined): string {
  if (!html) return "";
  const cleaned = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|iframe|object|embed|noscript|template|svg|math|meta|link|title|head)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<(script|style|iframe|object|embed|noscript|template|svg|math|meta|link|title|head)\b[^>]*>/gi, "");

  const out: string[] = [];
  for (const part of cleaned.split(/(<[^>]*>)/)) {
    if (!part) continue;
    if (part.startsWith("<") && part.endsWith(">")) {
      const tag = /^<\s*(\/?)\s*([a-zA-Z0-9]+)([\s\S]*?)\/?>$/.exec(part);
      if (!tag) continue;
      const closing = tag[1] === "/";
      let name = tag[2].toLowerCase();
      name = REMAP[name] ?? name;
      if (name === "div") { if (closing) out.push("<br>"); continue; }
      if (!ALLOWED.has(name)) continue; // balise retirée, son texte est conservé
      if (VOID.has(name)) { if (!closing) out.push(`<${name}>`); continue; }
      out.push(closing ? `</${name}>` : `<${name}${keptStyle(tag[3] ?? "")}>`);
    } else {
      out.push(part.replace(/</g, "&lt;").replace(/>/g, "&gt;"));
    }
  }
  return out
    .join("")
    .replace(/(<br>\s*){3,}/g, "<br><br>")
    .replace(/^(\s*<br>)+|(<br>\s*)+$/g, "")
    .trim();
}

/** Le texte contient-il des styles venus d'ailleurs (couleurs, polices, fonds, classes) ? */
export function hasForeignFormatting(html: string | null | undefined): boolean {
  if (!html) return false;
  return /\sclass\s*=|style\s*=\s*["'][^"']*(color|background|font-family|margin|padding|border)/i.test(html);
}
