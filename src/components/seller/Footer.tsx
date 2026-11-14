import { Link } from "@tanstack/react-router";

export function Footer() {
  return (
    <footer className="border-t border-border/50 bg-background">
      <div className="container mx-auto px-6 py-16">
        <div className="grid md:grid-cols-2 gap-10 mb-12">
          <div>
            <Link to="/" className="flex items-center gap-3 font-display font-extrabold text-xl mb-4">
              <span className="w-10 h-10 rounded-xl bg-gradient-primary grid place-items-center text-black text-sm">a</span>
              <span>Amashia Seller</span>
            </Link>
          </div>
          <p className="text-muted-foreground max-w-md md:justify-self-end">
            Autonomiser les vendeurs africains avec des outils modernes pour développer leur activité en ligne.
          </p>
        </div>
        <div className="grid md:grid-cols-4 gap-10">
          <div>
            <h4 className="font-bold mb-4">Produit</h4>
            <ul className="space-y-3 text-muted-foreground text-sm">
              <li><Link to="/fonctionnalites" className="hover:text-primary">Fonctionnalités</Link></li>
              <li><Link to="/tarification" className="hover:text-primary">Tarification</Link></li>
              <li><Link to="/comment-ca-marche" className="hover:text-primary">Comment ça marche</Link></li>
              <li><a href="#" className="hover:text-primary">Aperçu Dashboard</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold mb-4">Entreprise</h4>
            <ul className="space-y-3 text-muted-foreground text-sm">
              <li><a href="#" className="hover:text-primary">À propos</a></li>
              <li><a href="#" className="hover:text-primary">Contact</a></li>
              <li><a href="#" className="hover:text-primary">Support</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold mb-4">Légal</h4>
            <ul className="space-y-3 text-muted-foreground text-sm">
              <li><a href="#" className="hover:text-primary">Mentions légales</a></li>
              <li><a href="#" className="hover:text-primary">Politique de confidentialité</a></li>
              <li><a href="#" className="hover:text-primary">Conditions d'utilisation</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold mb-4">Restez informé</h4>
            <p className="text-muted-foreground text-sm mb-3">Recevez nos dernières actualités et offres.</p>
            <form className="flex gap-2">
              <input
                type="email"
                placeholder="Votre email"
                className="flex-1 bg-input border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
              />
              <button className="w-10 h-10 grid place-items-center rounded-lg bg-gradient-primary text-black">→</button>
            </form>
          </div>
        </div>
        <div className="mt-12 pt-8 border-t border-border/50 text-sm text-muted-foreground text-center">
          © 2026 Amashia Seller. Tous droits réservés.
        </div>
      </div>
    </footer>
  );
}
