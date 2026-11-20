/**
 * Code-barres EAN-13 (SKU Amachia) dessiné en SVG, sans bibliothèque.
 * Le livreur le scanne chez le vendeur pour vérifier qu'il récupère le bon produit.
 */
const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
const PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

export function ean13Bits(code: string): string | null {
  if (!/^\d{13}$/.test(code)) return null;
  const d = code.split("").map(Number);
  const p = PARITY[d[0]];
  let bits = "101";
  for (let i = 1; i <= 6; i++) bits += (p[i - 1] === "L" ? L : G)[d[i]];
  bits += "01010";
  for (let i = 7; i <= 12; i++) bits += R[d[i]];
  return bits + "101";
}

export function Barcode({ code, height = 56, className = "", showText = true }: { code: string; height?: number; className?: string; showText?: boolean }) {
  const bits = ean13Bits(code);
  if (!bits) return <span className="font-mono text-xs">{code}</span>;
  const quiet = 9, w = bits.length + quiet * 2, textH = showText ? 11 : 0;
  // barres de garde (début, milieu, fin) un peu plus longues, comme sur un vrai EAN-13
  const guard = (i: number) => i < 3 || (i >= 45 && i < 50) || i >= 92;
  return (
    <svg viewBox={`0 0 ${w} ${height / 4 + textH}`} className={className} role="img" aria-label={`Code-barres ${code}`} style={{ background: "#fff" }} preserveAspectRatio="xMidYMid meet">
      {bits.split("").map((b, i) => b === "1" ? <rect key={i} x={quiet + i} y={0} width={1} height={height / 4 - (guard(i) ? 0 : 3)} fill="#000" /> : null)}
      {showText && <text x={w / 2} y={height / 4 + textH - 2} textAnchor="middle" fontSize={8.5} fontFamily="monospace" letterSpacing={1.2} fill="#000">{code}</text>}
    </svg>
  );
}

/** Même code-barres, en texte SVG (pour l'impression des étiquettes). */
export function barcodeSvg(code: string, height = 64) {
  const bits = ean13Bits(code);
  if (!bits) return `<span>${code}</span>`;
  const quiet = 9, w = bits.length + quiet * 2, h = height / 4, textH = 11;
  const guard = (i: number) => i < 3 || (i >= 45 && i < 50) || i >= 92;
  const bars = bits.split("").map((b, i) => (b === "1" ? `<rect x="${quiet + i}" y="0" width="1" height="${h - (guard(i) ? 0 : 3)}"/>` : "")).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h + textH}" width="100%"><rect width="100%" height="100%" fill="#fff"/><g fill="#000">${bars}</g><text x="${w / 2}" y="${h + textH - 2}" text-anchor="middle" font-size="8.5" font-family="monospace" letter-spacing="1.2">${code}</text></svg>`;
}

/** Ouvre une page d'impression avec une étiquette par article (à coller sur l'emballage). */
export function printLabels(items: { sku: string; title: string; qty: number }[], orderRef: string) {
  const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const labels = items.flatMap((it) => Array.from({ length: Math.max(1, it.qty) }, () => it)).map((it) => `
    <div class="l"><p class="t">${esc(it.title)}</p>${barcodeSvg(it.sku)}<p class="o">Amachia · ${esc(orderRef)}</p></div>`).join("");
  const w = window.open("", "_blank", "width=720,height=900");
  if (!w) return false;
  w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Étiquettes ${esc(orderRef)}</title><style>
    body{font-family:system-ui,sans-serif;margin:16px} .g{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
    .l{border:1px dashed #999;border-radius:8px;padding:10px;break-inside:avoid} .t{margin:0 0 6px;font-size:12px;font-weight:600;line-height:1.3;max-height:32px;overflow:hidden}
    .o{margin:4px 0 0;font-size:10px;color:#555} @media print{.n{display:none}}</style></head><body>
    <p class="n">Collez chaque étiquette sur l'emballage du produit : le livreur Amachia la scanne avant d'emporter le colis.</p>
    <div class="g">${labels}</div><script>window.onload=function(){setTimeout(function(){window.print()},300)}</script></body></html>`);
  w.document.close();
  return true;
}
