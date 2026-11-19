import { ShieldCheck, Lock, BadgeCheck, Headphones } from "lucide-react";
import { Container, SectionHeading } from "@/components/seller/site/ui";

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
        <div className="grid gap-12 lg:grid-cols-[1fr_1.2fr] lg:items-center">
          <SectionHeading center={false} eyebrow="Confiance" title={<>Concentrez-vous sur vos produits. <span className="text-gradient">On sécurise le reste.</span></>}
            text="Amashia gère l'encaissement, la livraison et le service client : vous gardez le temps de faire grandir votre boutique." />
          <div className="grid gap-4 sm:grid-cols-2">
            {items.map((x) => (
              <div key={x.t} className="rounded-[1.4rem] border border-border bg-card p-6 shadow-card">
                <x.icon className="text-primary" size={22} />
                <p className="mt-4 font-bold">{x.t}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{x.d}</p>
              </div>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
