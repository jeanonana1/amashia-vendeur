import { Link } from "@tanstack/react-router";
import { SellerLogo } from "@/components/seller/SellerLogo";

const CLIENT = "https://amashia-client.vercel.app";

export function Footer() {
  const cols = [
    { title: "Produit", links: [
      { label: "Fonctionnalités", to: "/fonctionnalites" }, { label: "Comment ça marche", to: "/comment-ca-marche" }, { label: "Tarifs et commissions", to: "/tarification" }, { label: "Ouvrir ma boutique", to: "/inscription" },
    ] },
    { title: "Vendeurs", links: [
      { label: "Se connecter", to: "/connexion" }, { label: "Tableau de bord", to: "/dashboard" },
    ] },
    { title: "Amashia", links: [
      { label: "Le site Amashia", href: CLIENT }, { label: "Nous contacter", href: `${CLIENT}/contact` }, { label: "Carrières", href: `${CLIENT}/careers` },
    ] },
    { title: "Légal", links: [
      { label: "Conditions d'utilisation", href: `${CLIENT}/legal/terms` }, { label: "Conditions de vente", href: `${CLIENT}/legal/sales` }, { label: "Confidentialité", href: `${CLIENT}/legal/privacy` },
    ] },
  ] as const;
  return (
    <footer className="relative mt-10 border-t border-border">
      <div className="mx-auto max-w-[1200px] px-5 py-14 sm:px-8">
        <div className="grid gap-10 md:grid-cols-[1.3fr_repeat(4,1fr)]">
          <div>
            <Link to="/" aria-label="Accueil amashia seller"><SellerLogo className="h-8" /></Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">La plateforme des vendeurs d'Amashia : vendez partout au Cameroun, nous nous occupons du paiement et de la livraison.</p>
          </div>
          {cols.map((c) => (
            <div key={c.title}>
              <p className="mb-4 text-sm font-bold">{c.title}</p>
              <ul className="space-y-2.5 text-sm text-muted-foreground">
                {c.links.map((l) => (
                  <li key={l.label}>{"to" in l ? <Link to={l.to as never} className="transition hover:text-foreground">{l.label}</Link> : <a href={l.href} className="transition hover:text-foreground">{l.label}</a>}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row">
          <p>© {new Date().getFullYear()} Amashia. Tous droits réservés.</p>
          <p>Fait au Cameroun, pour les vendeurs du Cameroun.</p>
        </div>
      </div>
    </footer>
  );
}
