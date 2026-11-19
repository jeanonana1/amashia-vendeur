import { useEffect, useState } from "react";
import { LANG_EVENT, preferredLang, setSellerLang, type SellerLang } from "@/lib/sellerLang";

/** Bouton FR / EN : le site entier passe en anglais (traduction automatique) ou revient au français. */
export function LangToggle({ className = "" }: { className?: string }) {
  const [lang, setLang] = useState<SellerLang>("fr");
  useEffect(() => {
    setLang(preferredLang());
    const on = () => setLang(preferredLang());
    window.addEventListener(LANG_EVENT, on);
    return () => window.removeEventListener(LANG_EVENT, on);
  }, []);
  return (
    <div translate="no" className={`inline-flex shrink-0 items-center rounded-full border border-border bg-card/60 p-0.5 text-[11px] font-bold ${className}`} role="group" aria-label="Langue / Language">
      {(["fr", "en"] as const).map((l) => (
        <button key={l} type="button" onClick={() => { if (l !== lang) { setLang(l); setSellerLang(l); } }}
          className={`rounded-full px-2.5 py-1 uppercase transition ${lang === l ? "bg-primary text-black" : "text-muted-foreground hover:text-foreground"}`} aria-pressed={lang === l}>{l}</button>
      ))}
    </div>
  );
}
