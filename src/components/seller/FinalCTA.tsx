import { Link } from "@tanstack/react-router";
import { ArrowRight, Check } from "lucide-react";

export function FinalCTA() {
  return (
    <section className="py-24 md:py-32 relative overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-gradient-primary opacity-10" />
      <div className="container mx-auto px-6">
        <div className="relative overflow-hidden rounded-[2rem] border border-primary/30 bg-gradient-to-br from-card via-card to-primary/10 p-10 md:p-20 text-center">
          <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full bg-primary/30 blur-3xl" />
          <div className="absolute -bottom-20 -left-20 w-80 h-80 rounded-full bg-gold/20 blur-3xl" />
          <div className="relative">
            <h2 className="text-4xl md:text-6xl font-extrabold leading-tight max-w-3xl mx-auto">
              Prêt à développer <span className="text-gradient">votre business</span> ?
            </h2>
            <p className="mt-6 max-w-2xl mx-auto text-muted-foreground text-lg">
              Rejoignez des milliers de vendeurs africains qui ont choisi Amashia Seller pour transformer leur activité. Commencez gratuitement dès aujourd'hui.
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-4">
              <Link
                to="/inscription"
                className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-gradient-primary text-white font-semibold shadow-elegant hover:shadow-glow transition"
              >
                Créer mon compte vendeur <ArrowRight size={18} />
              </Link>
              <Link
                to="/comment-ca-marche"
                className="inline-flex items-center px-8 py-4 rounded-full border-2 border-border bg-background/50 backdrop-blur font-semibold hover:border-primary transition"
              >
                En savoir plus
              </Link>
            </div>
            <div className="mt-10 flex flex-wrap justify-center gap-8 text-sm text-muted-foreground">
              {["Gratuit pour commencer", "Sans engagement", "Support 24/7"].map((t) => (
                <span key={t} className="inline-flex items-center gap-2">
                  <Check size={16} className="text-primary" /> {t}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
