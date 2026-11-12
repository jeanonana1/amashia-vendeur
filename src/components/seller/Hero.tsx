import { Link } from "@tanstack/react-router";
import { ArrowRight, Users, ShieldCheck, ArrowDown } from "lucide-react";

const HERO_BG = "/images/visual-a27356eba9dd.jpg";
const DASHBOARD = "/images/visual-b7d6e0307252.jpg";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 -z-10">
        <img src={HERO_BG} alt="" className="w-full h-full object-cover opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-background/80 to-background" />
      </div>
      <div className="container mx-auto px-6 pt-16 pb-24 md:pt-24 md:pb-32 grid md:grid-cols-2 gap-12 items-center">
        <div className="animate-fade-up text-center md:text-left">
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-card/80 border border-border text-sm font-medium mb-8 backdrop-blur">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            +10 000 vendeurs actifs
          </span>
          <h1 className="text-4xl sm:text-5xl md:text-7xl font-extrabold leading-[1.05] tracking-tight">
            Vendez plus intelligemment.{" "}
            <span className="text-gradient">Développez-vous plus rapidement</span>{" "}
            avec Amashia Seller.
          </h1>
          <p className="mt-8 text-base md:text-lg text-muted-foreground max-w-xl mx-auto md:mx-0">
            La plateforme tout-en-un pour les vendeurs africains. Créez votre boutique, gérez vos produits et développez votre activité en toute simplicité.
          </p>
          <div className="mt-10 flex flex-wrap gap-4 justify-center md:justify-start">
            <Link
              to="/inscription"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-gradient-primary text-white font-semibold shadow-elegant hover:shadow-glow transition"
            >
              Commencer à vendre <ArrowRight size={18} />
            </Link>
            <Link
              to="/connexion"
              className="inline-flex items-center px-8 py-4 rounded-full border-2 border-border bg-card/50 backdrop-blur font-semibold hover:border-primary transition"
            >
              Se connecter
            </Link>
          </div>
          <div className="mt-12 flex flex-wrap gap-8 justify-center md:justify-start">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-primary/10 grid place-items-center text-primary">
                <Users size={20} />
              </div>
              <div className="text-left">
                <p className="font-bold">10 000+ vendeurs</p>
                <p className="text-sm text-muted-foreground">Nous font confiance</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-primary/10 grid place-items-center text-primary">
                <ShieldCheck size={20} />
              </div>
              <div className="text-left">
                <p className="font-bold">Paiements sécurisés</p>
                <p className="text-sm text-muted-foreground">100% protégés</p>
              </div>
            </div>
          </div>
        </div>

        <div className="relative animate-fade-up" style={{ animationDelay: "0.2s" }}>
          <div className="absolute -inset-10 bg-primary/30 blur-3xl rounded-full animate-glow-pulse" />
          <div className="relative animate-float">
            <img src={DASHBOARD} alt="Dashboard Amashia Seller" className="relative rounded-3xl shadow-elegant w-full" />
          </div>
          <div className="absolute -left-4 top-10 bg-card border border-border rounded-2xl shadow-soft p-4 backdrop-blur">
            <p className="text-2xl font-extrabold text-primary">+245%</p>
            <p className="text-xs text-muted-foreground">Ventes</p>
          </div>
          <div className="absolute -right-2 bottom-10 bg-card border border-border rounded-2xl shadow-soft p-4 backdrop-blur">
            <p className="text-2xl font-extrabold text-gold">1.2M FCFA</p>
            <p className="text-xs text-muted-foreground">Revenus</p>
          </div>
        </div>
      </div>
      <div className="hidden md:flex flex-col items-center pb-8 text-muted-foreground text-sm gap-2">
        <span>Découvrir plus</span>
        <ArrowDown className="animate-bounce-arrow text-primary" size={20} />
      </div>
    </section>
  );
}
