import type { CSSProperties } from "react";

/**
 * Logo officiel Amashia (référence : logo-amashia.html) : cercle avec pouce levé + « amashia » en Ubuntu Bold,
 * sourire orange sous le 2ᵉ « a ». Toutes les proportions dépendent de la taille de police (em).
 * - variant « dark » : lettres et cercle de la couleur `ink` (teinte du pied de page), pouce et sourire orange ;
 * - variant « light » : lettres blanches, cercle orange, pouce blanc, sourire orange.
 */
export function AmashiaLogo({ variant = "dark", size, ink, className = "", style }: { variant?: "dark" | "light"; size?: number | string; ink?: string; className?: string; style?: CSSProperties }) {
  const ORANGE = "#FF6800";
  const color = variant === "light" ? "#fff" : ink ?? "#2a2722";
  const circle = variant === "light" ? ORANGE : "currentColor";
  const thumb = variant === "light" ? "#fff" : ORANGE;
  return (
    <span
      className={`amashia-logo ${className}`}
      style={{ fontSize: size, color, display: "inline-flex", alignItems: "center", gap: ".14em", fontFamily: "'Ubuntu', system-ui, sans-serif", fontWeight: 700, letterSpacing: "-0.035em", lineHeight: 1, paddingBottom: ".12em", ...style }}
      aria-label="Amashia"
      role="img"
    >
      <svg viewBox="0 0 100 100" aria-hidden style={{ height: ".78em", width: ".75em", flexShrink: 0, display: "block", transform: "translateY(.12em)" }}>
        <circle cx="50" cy="50" r="50" fill={circle} />
        <rect x="22" y="47" width="13" height="27" rx="2" fill={thumb} />
        <path d="M39 49 L48 47 L54 31 Q56 23 62 25 Q67 27 65 35 L62 46 L74 46 Q80 46 79.5 51.5 Q79 54.5 76 55.5 Q79.5 57 78.5 61 Q77.5 64 75 64.5 Q78 66.5 76.5 70 Q75 73 71 73 L46 74 Q41 74 39 71 Z" fill={thumb} />
      </svg>
      <span aria-hidden style={{ display: "block" }}>
        am
        <span style={{ position: "relative", display: "inline-block" }}>
          a
          <svg viewBox="0 0 100 30" style={{ position: "absolute", left: ".01em", width: "100%", height: ".16em", top: ".86em", overflow: "visible" }}>
            <path d="M8 6 Q50 34 92 6" fill="none" stroke={ORANGE} strokeWidth="9" strokeLinecap="round" />
          </svg>
        </span>
        shia
      </span>
    </span>
  );
}

/** Grand logo du pied de page : occupe toute la largeur, couleur des lettres inspirée du fond du pied de page. */
export function FooterWordmark({ ink, className = "" }: { ink: string; className?: string }) {
  return (
    <div className={`overflow-hidden select-none ${className}`} style={{ containerType: "inline-size" }} aria-hidden>
      <AmashiaLogo ink={ink} style={{ fontSize: "20.2cqw", display: "flex", justifyContent: "center", width: "100%" }} />
    </div>
  );
}
