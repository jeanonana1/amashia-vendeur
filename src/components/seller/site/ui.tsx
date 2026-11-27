import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { IconSuivant as ArrowRight } from "@/components/icons/AmachiaIcons";

/** Éléments communs des pages publiques du site vendeur. */
export function Container({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[1200px] px-5 sm:px-8 ${className}`}>{children}</div>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs font-semibold text-muted-foreground backdrop-blur">
      <span className="h-1.5 w-1.5 rounded-full bg-primary" />
      {children}
    </span>
  );
}

export function SectionHeading({ eyebrow, title, text, center = true }: { eyebrow?: string; title: ReactNode; text?: ReactNode; center?: boolean }) {
  return (
    <div className={`${center ? "mx-auto text-center" : "mx-auto text-center lg:mx-0 lg:text-left"} max-w-2xl`}>
      {eyebrow && <p className="eyebrow mb-4">{eyebrow}</p>}
      <h2 className="text-balance text-3xl font-extrabold leading-[1.08] sm:text-4xl md:text-[3.2rem]">{title}</h2>
      {text && <p className="mt-5 text-base leading-relaxed text-muted-foreground md:text-lg">{text}</p>}
    </div>
  );
}

export function PrimaryCta({ to = "/inscription", children = "Créer ma boutique", className = "" }: { to?: string; children?: ReactNode; className?: string }) {
  return (
    <Link to={to as never} className={`cta-sweep group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-primary px-6 text-[15px] font-bold text-black shadow-[0_10px_40px_-12px_var(--glow)] transition hover:bg-[#ff7a1f] ${className}`}>
      {children}
      <ArrowRight size={17} className="transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

export function GhostCta({ to, children, className = "" }: { to: string; children: ReactNode; className?: string }) {
  return (
    <Link to={to as never} className={`inline-flex h-12 items-center justify-center gap-2 rounded-full border border-border bg-card/60 px-6 text-[15px] font-semibold backdrop-blur transition hover:border-foreground/25 hover:bg-secondary ${className}`}>
      {children}
    </Link>
  );
}

/** Fond décoratif : quadrillage estompé + halo orange. */
export function Backdrop({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 -z-10 overflow-hidden ${className}`}>
      <div className="bg-grid absolute inset-0" />
      <div className="glow-orb animate-drift absolute left-1/2 top-[-18rem] h-[38rem] w-[60rem]" style={{ transform: "translateX(-50%)" }} />
    </div>
  );
}

/** En-tête de page intérieure (Fonctionnalités, Tarification…). */
export function PageHero({ eyebrow, title, text, children }: { eyebrow: string; title: ReactNode; text: ReactNode; children?: ReactNode }) {
  return (
    <section className="relative isolate overflow-hidden pb-16 pt-16 md:pb-24 md:pt-24">
      <Backdrop />
      <Container className="text-center">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="mx-auto mt-6 max-w-4xl text-balance text-4xl font-extrabold leading-[1.04] sm:text-5xl md:text-[4.2rem]">{title}</h1>
        <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">{text}</p>
        {children}
      </Container>
    </section>
  );
}
