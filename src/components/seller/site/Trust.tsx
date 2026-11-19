import { ShieldCheck, Lock, BadgeCheck, Headphones } from "lucide-react";
import { Container, SectionHeading } from "@/components/seller/site/ui";
import { Reveal } from "@/components/seller/site/motion";

/** Confiance : ce qu'Amashia garantit aux vendeurs et à leurs clients. */
export function Trust() {
  const items = [
    { icon: ShieldCheck, t: "Encaissement par Amashia", d: "Le client paie Amashia : plus de risque d'impayé. Votre solde se met à jour à chaque livraison." },
    { icon: BadgeCheck, t: "Vendeurs vérifiés", d: "Chaque boutique est contrôlée à l'inscription : les clients achètent en confiance." },
    { icon: Lock, t: "Données protégées", d: "Coordonnées des clients masquées, paiements chiffrés, accès à votre espace sécurisé." },
    { icon: Headphones, t: "Une équipe à l'écoute", d: "Un problème avec une commande, un retour ou un paiement ? L'équipe Amashia vous accompagne." },
  ];
  return (
    <section className="relative py-24 md:py-32">
      <Container>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-12 lg:grid-cols-[1fr_1.2fr] lg:items-center">
          <Reveal variant="left"><SectionHeading center={false} eyebrow="Confiance" title={<>Concentrez-vous sur vos produits. <span className="text-gradient">On sécurise le reste.</span></>}
            text="Amashia gère l'encaissement, la livraison et le service client : vous gardez le temps de faire grandir votre boutique." /></Reveal>
          <div className="grid gap-4 sm:grid-cols-2">
            {items.map((x, i) => (
              <Reveal key={x.t} variant={i % 2 ? "right" : "up"} delay={i * 120} className="group rounded-[1.4rem] border border-border bg-card p-6 shadow-card transition-colors hover:border-primary/40">
                <span className="halo grid h-11 w-11 place-items-center rounded-xl bg-primary/12 text-primary" style={{ animationDelay: `${i * 0.6}s` }}><x.icon size={22} /></span>
                <p className="mt-4 font-bold">{x.t}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{x.d}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
