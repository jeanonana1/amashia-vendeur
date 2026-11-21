import { Link, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Sun, Moon, Menu, X, ArrowRight } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { LangToggle } from "@/components/seller/LangToggle";
import { SellerLogo } from "@/components/seller/SellerLogo";

const links = [
  { to: "/fonctionnalites", label: "Fonctionnalités" },
  { to: "/comment-ca-marche", label: "Comment ça marche" },
  { to: "/tarification", label: "Tarifs" },
] as const;

/** Barre de navigation flottante (verre dépoli), menu plein écran sur mobile. */
export function Header() {
  const { pathname } = useLocation();
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on(); window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <header className="sticky top-0 z-50 px-3 pt-3 sm:px-5">
      <div className={`mx-auto flex h-[4.5rem] max-w-[1200px] items-center justify-between gap-4 border px-4 transition-all duration-300 sm:px-5 ${scrolled || open ? "rounded-full border-border bg-background/85 pl-5 pr-2.5 shadow-card backdrop-blur-xl sm:pl-6 sm:pr-3" : "rounded-2xl border-transparent"}`}>
        <Link to="/" className="flex shrink-0 items-center" aria-label="Accueil amachia seller">
          <SellerLogo className="h-[22px] sm:h-[26px]" />
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <Link key={l.to} to={l.to} className={`rounded-full px-4 py-2 text-sm font-medium transition ${pathname === l.to ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}>{l.label}</Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <div className="hidden sm:block"><LangToggle /></div>
          <button onClick={toggle} className="hidden h-9 w-9 place-items-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-foreground sm:grid" aria-label="Changer de thème">
            {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <Link to="/connexion" className="hidden rounded-full px-4 py-2 text-sm font-semibold text-muted-foreground transition hover:text-foreground sm:inline-flex">Se connecter</Link>
          <Link to="/inscription" className="cta-sweep hidden h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-bold text-black transition hover:bg-[#ff7a1f] sm:inline-flex">
            Créer ma boutique <ArrowRight size={15} />
          </Link>
          <button onClick={() => setOpen((v) => !v)} className="grid h-10 w-10 place-items-center rounded-full bg-secondary md:hidden" aria-label="Menu">
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>
      {open && (
        <div className="mx-auto mt-2 max-w-[1200px] bg-background rounded-2xl border border-border p-3 shadow-card md:hidden">
          {links.map((l) => <Link key={l.to} to={l.to} className="block rounded-xl px-4 py-3 text-[15px] font-semibold hover:bg-secondary">{l.label}</Link>)}
          <div className="mt-2 grid grid-cols-2 gap-2 border-t border-border pt-3">
            <Link to="/connexion" className="grid h-11 place-items-center rounded-full border border-border text-sm font-semibold">Se connecter</Link>
            <Link to="/inscription" className="cta-sweep grid h-11 place-items-center rounded-full bg-primary text-sm font-bold text-black">Créer ma boutique</Link>
          </div>
          <div className="mt-2 flex items-center justify-between rounded-xl px-4 py-2.5 text-sm text-muted-foreground"><span>Langue / Language</span><LangToggle /></div>
          <button onClick={toggle} className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm text-muted-foreground">
            {theme === "dark" ? <><Sun size={15} /> Mode clair</> : <><Moon size={15} /> Mode sombre</>}
          </button>
        </div>
      )}
    </header>
  );
}
