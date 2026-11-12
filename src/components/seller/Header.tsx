import { Link, useLocation } from "@tanstack/react-router";
import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/components/theme-provider";

const links = [
  { to: "/", label: "Accueil" },
  { to: "/fonctionnalites", label: "Fonctionnalités" },
  { to: "/tarification", label: "Tarification" },
  { to: "/comment-ca-marche", label: "Comment ça marche" },
] as const;

export function Header() {
  const { pathname } = useLocation();
  const { theme, toggle } = useTheme();
  return (
    <header className="sticky top-0 z-50 backdrop-blur-xl bg-background/80 border-b border-border/50">
      <div className="container mx-auto px-6 h-20 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3 font-display font-extrabold text-xl">
          <span className="w-10 h-10 rounded-xl bg-gradient-primary grid place-items-center text-white shadow-soft text-sm">
            a
          </span>
          <span>Amashia Seller</span>
        </Link>
        <nav className="hidden md:flex items-center gap-10 text-[15px] font-medium">
          {links.map((l) => {
            const active = pathname === l.to;
            return (
              <Link
                key={l.to}
                to={l.to}
                className={active ? "text-primary" : "text-muted-foreground hover:text-foreground transition"}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-4">
          <button onClick={toggle} className="hidden sm:grid place-items-center w-10 h-10 rounded-full bg-secondary text-muted-foreground hover:text-primary transition" aria-label="Theme">
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <Link to="/connexion" className="hidden sm:inline-flex text-[15px] font-medium hover:text-primary transition">
            Se connecter
          </Link>
          <Link
            to="/inscription"
            className="inline-flex items-center px-6 py-2.5 rounded-full bg-gradient-primary text-white font-semibold text-[15px] hover:opacity-95 shadow-soft transition"
          >
            Commencer
          </Link>
        </div>
      </div>
    </header>
  );
}
