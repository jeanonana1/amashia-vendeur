import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/** Vrai dès que l'élément entre à l'écran (une seule fois). */
export function useInView<T extends HTMLElement>(threshold = 0.2) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    if (typeof IntersectionObserver === "undefined") { setInView(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setInView(true); io.disconnect(); } }, { threshold, rootMargin: "0px 0px -8% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [threshold, inView]);
  return { ref, inView };
}

export function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

type Variant = "up" | "left" | "right" | "scale" | "blur";

/** Apparition au défilement : glisse / zoome / se précise quand la section arrive à l'écran. */
export function Reveal({ children, variant = "up", delay = 0, className = "", as: Tag = "div", style }: {
  children: ReactNode; variant?: Variant; delay?: number; className?: string; as?: "div" | "li" | "section" | "span"; style?: CSSProperties;
}) {
  const { ref, inView } = useInView<HTMLDivElement>(0.15);
  const T = Tag as "div";
  return (
    <T ref={ref} className={`reveal reveal-${variant} ${inView ? "is-in" : ""} ${className}`} style={{ transitionDelay: `${delay}ms`, ...style }}>
      {children}
    </T>
  );
}

/** Nombre qui monte de 0 à sa valeur quand il apparaît à l'écran. */
export function CountUp({ to, ms = 1400, format = (n: number) => Math.round(n).toLocaleString("fr-FR") }: { to: number; ms?: number; format?: (n: number) => string }) {
  const { ref, inView } = useInView<HTMLSpanElement>(0.4);
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!inView) return;
    if (prefersReducedMotion()) { setV(to); return; }
    let raf = 0; const t0 = performance.now();
    const tick = (t: number) => { const k = Math.min(1, (t - t0) / ms); setV(to * (1 - Math.pow(1 - k, 3))); if (k < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, to, ms]);
  return <span ref={ref} className="tabular">{format(v)}</span>;
}

/** Séparateur entre deux sections : numéro + nom de la section, trait qui se dessine et point lumineux. */
export function SectionDivider({ index, label }: { index: number; label: string }) {
  const { ref, inView } = useInView<HTMLDivElement>(0.6);
  return (
    <div ref={ref} aria-hidden className={`section-divider mx-auto flex w-full max-w-[1200px] items-center gap-3 px-5 sm:gap-4 sm:px-8 ${inView ? "is-in" : ""}`}>
      <span className="divider-line h-px flex-1 origin-right bg-gradient-to-l from-border to-transparent" />
      <span className="divider-chip inline-flex shrink-0 items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground shadow-card">
        <span className="tabular rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-extrabold text-black">{String(index).padStart(2, "0")}</span>
        {label}
      </span>
      <span className="divider-line relative h-px flex-1 origin-left bg-gradient-to-r from-border to-transparent">
        <span className="divider-spark absolute -top-[3px] left-0 h-[7px] w-[7px] rounded-full bg-primary shadow-[0_0_12px_2px_var(--primary)]" />
      </span>
    </div>
  );
}
