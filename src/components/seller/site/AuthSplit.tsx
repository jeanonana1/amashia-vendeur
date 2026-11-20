import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Bell, Bike, Wallet, Sparkles } from "lucide-react";
import { SellerLogo } from "@/components/seller/SellerLogo";

/** Mise en page des écrans de connexion / inscription : formulaire à gauche, panneau de marque à droite. */
export function AuthSplit({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[1fr_minmax(0,0.9fr)]">
      <div className="relative flex flex-col px-5 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <Link to="/" aria-label="Accueil amachia seller"><SellerLogo className="h-10 sm:h-11" /></Link>
          <Link to="/" className="text-sm font-medium text-muted-foreground hover:text-foreground">← Retour au site</Link>
        </div>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className={`w-full ${wide ? "max-w-3xl" : "max-w-md"}`}>{children}</div>
        </div>
        <p className="text-center text-xs text-muted-foreground">© {new Date().getFullYear()} Amachia · Vendez partout au Cameroun</p>
      </div>
      <aside className="relative isolate hidden overflow-hidden border-l border-border bg-[#0a0d13] p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden className="absolute inset-0 -z-10">
          <div className="absolute inset-0 opacity-70 [background-image:linear-gradient(rgba(255,255,255,.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.05)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(ellipse_at_70%_30%,#000_25%,transparent_75%)]" />
          <div className="absolute -right-40 -top-40 h-[32rem] w-[32rem] rounded-full bg-[#ff6800]/35 blur-[120px]" />
        </div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#ff8a3d]">Amachia Seller</p>
        <div>
          <h2 className="max-w-md text-4xl font-extrabold leading-[1.08]">Votre boutique, ouverte à tout le Cameroun.</h2>
          <p className="mt-4 max-w-md text-white/65">Publiez, vendez, encaissez : Amachia s'occupe du paiement et de la livraison.</p>
          <div className="mt-10 space-y-3">
            {[
              { i: <Sparkles size={16} />, t: "Fiches produits rédigées par l'IA", c: "bg-[#ff6800] text-black" },
              { i: <Bell size={16} />, t: "Une sonnerie à chaque commande", c: "bg-white/10 text-white" },
              { i: <Bike size={16} />, t: "Un livreur Prime récupère vos colis", c: "bg-white/10 text-white" },
              { i: <Wallet size={16} />, t: "Votre solde mis à jour à chaque livraison", c: "bg-white/10 text-white" },
            ].map((x) => (
              <div key={x.t} className="flex max-w-sm items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 backdrop-blur">
                <span className={`grid h-9 w-9 place-items-center rounded-xl ${x.c}`}>{x.i}</span>
                <span className="text-sm font-semibold">{x.t}</span>
              </div>
            ))}
          </div>
        </div>
        <p className="text-sm text-white/50">Inscription gratuite · Commission seulement sur les ventes livrées</p>
      </aside>
    </div>
  );
}
