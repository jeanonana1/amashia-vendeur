import type { CSSProperties } from "react";

/**
 * Logo officiel Amachia (référence : logo-amashia.html) : cercle avec pouce levé + « amachia » en Ubuntu Bold,
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
      style={{ fontSize: size, color, display: "inline-flex", alignItems: "center", gap: ".14em", fontFamily: "'Ubuntu', system-ui, sans-serif", fontWeight: 700, letterSpacing: "-0.035em", lineHeight: 1, paddingBottom: ".26em", ...style }}
      aria-label="Amachia"
      role="img"
    >
      <svg viewBox="0 0 100 100" aria-hidden style={{ height: ".78em", width: ".75em", flexShrink: 0, display: "block", transform: "translateY(.12em)" }}>
        <circle cx="50" cy="50" r="50" fill={circle} />
        <rect x="22" y="47" width="13" height="27" rx="2" fill={thumb} />
        {/* pouce levé + 4 doigts repliés */}
        <path d="M39 49 L48 47 L54 31 Q56 23 62 25 Q67 27 65 35 L62 46 L74.5 46 Q80 46 79.8 49.6 Q79.6 52.3 76.6 53 Q80 53.8 79.6 57 Q79.3 59.6 76.4 60 Q79.6 60.8 79.1 64 Q78.7 66.6 75.9 67 Q78.6 68 78 71 Q77.3 74 73 74 L46 74 Q41 74 39 71 Z" fill={thumb} />
        <path d="M76.6 53 L70 53 M76.4 60 L69.5 60 M75.9 67 L69 67" stroke={circle} strokeWidth="1.6" strokeLinecap="round" fill="none" />
      </svg>
      <span aria-hidden style={{ display: "block" }}>
        am
        <span style={{ position: "relative", display: "inline-block" }}>
          a
          <svg viewBox="0 0 100 30" style={{ position: "absolute", left: ".01em", width: "100%", height: ".16em", top: "1em", overflow: "visible" }}>
            <path d="M8 6 Q50 34 92 6" fill="none" stroke={ORANGE} strokeWidth="9" strokeLinecap="round" />
          </svg>
        </span>
        chia
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
