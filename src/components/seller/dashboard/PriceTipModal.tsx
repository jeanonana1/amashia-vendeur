import { useState } from "react";
import { Sparkles, TrendingUp, Check } from "lucide-react";
import { IconFermer as X } from "@/components/icons/AmachiaIcons";

/**
 * Prix psychologique : un prix rond (5 000) est proposé juste en dessous (4 999).
 * Renvoie null quand le prix n'est pas rond ou trop petit pour que ce soit utile.
 */
export function charmPrice(price: number): number | null {
  if (!Number.isFinite(price) || price < 1000) return null;
  if (price % 500 !== 0) return null; // déjà « psychologique » (4 990, 4 999, 12 450…)
  return price - 1;
}

const fmt = (n: number) => n.toLocaleString("fr-FR");
const EXAMPLES = [5000, 25000, 100000];

export function PriceTipModal({ price, onApply, onClose }: { price: number; onApply: (v: number) => void; onClose: () => void }) {
  const [off, setOff] = useState(false);
  const charm = charmPrice(price);
  const close = () => {
    if (off) { try { localStorage.setItem("amashia-price-tip-off", "1"); } catch { /* ignore */ } }
    onClose();
  };
  return (
    <div className="fixed inset-0 z-[100] grid grid-cols-[minmax(0,1fr)] place-items-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm" onClick={close}>
      <div role="dialog" aria-modal="true" aria-labelledby="price-tip-title" onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-2xl border border-border bg-card p-6" style={{ animation: "dialog-in .18s ease-out" }}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-primary text-black"><TrendingUp size={20} /></div>
            <div>
              <h3 id="price-tip-title" className="text-lg font-bold">Conseil : le prix qui fait vendre</h3>
              <p className="text-xs text-muted-foreground">À lire avant de fixer votre prix</p>
            </div>
          </div>
          <button onClick={close} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg hover:bg-secondary" aria-label="Fermer"><X size={16} /></button>
        </div>

        <p className="text-sm leading-relaxed">
          Au lieu d'un prix rond comme <b>5 000 FCFA</b>, affichez plutôt <b className="text-primary">4 999 FCFA</b>.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          C'est ce qu'on appelle le <b className="text-foreground">prix psychologique</b>. Le client lit un prix de gauche à droite et retient surtout le premier chiffre : 4 999 est perçu comme « 4 mille et quelque », donc nettement moins cher que 5 000, alors que l'écart n'est que de 1 franc. Ce prix donne aussi l'impression d'un tarif étudié au plus juste. C'est pour cela que les grandes enseignes l'utilisent partout : il attire plus de clics et déclenche plus facilement l'achat.
        </p>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {EXAMPLES.map((e) => (
            <div key={e} className="rounded-xl bg-secondary/60 p-3 text-center">
              <p className="text-xs text-muted-foreground line-through">{fmt(e)}</p>
              <p className="text-sm font-bold text-primary">{fmt(e - 1)}</p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">Les terminaisons en 990 ou 900 (4 990, 99 900) fonctionnent aussi très bien.</p>

        {charm && (
          <button onClick={() => { onApply(charm); close(); }} className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-primary py-3 text-sm font-semibold text-black">
            <Sparkles size={15} /> Utiliser {fmt(charm)} FCFA au lieu de {fmt(price)} FCFA
          </button>
        )}
        <button onClick={close} className={`${charm ? "mt-2 bg-secondary" : "mt-5 bg-gradient-primary text-black"} flex w-full items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold`}>
          <Check size={15} /> {charm ? "Garder mon prix" : "J'ai compris, je fixe mon prix"}
        </button>
        <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={off} onChange={(e) => setOff(e.target.checked)} className="accent-[#ff6800]" /> Ne plus afficher ce conseil
        </label>
      </div>
    </div>
  );
}
