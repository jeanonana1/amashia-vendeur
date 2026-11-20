import { Plus } from "lucide-react";
import { Container, SectionHeading } from "@/components/seller/site/ui";
import { Reveal } from "@/components/seller/site/motion";

export const FAQ = [
  { q: "Combien coûte l'ouverture d'une boutique ?", a: "Rien. L'inscription et la boutique sont gratuites. Amachia prélève seulement une commission sur chaque commande livrée, selon la catégorie du produit." },
  { q: "Qui livre mes commandes ?", a: "Dans les villes couvertes, un livreur Amachia (application Prime) proche de votre boutique vient récupérer le colis et le livre au client. Ailleurs, la commande part par une agence d'expédition partenaire." },
  { q: "Comment suis-je payé ?", a: "Le client paie Amachia (à la livraison, Orange Money, MTN MoMo ou carte). Une fois la commande livrée, le montant moins la commission passe dans votre solde, que vous suivez en direct ; Amachia vous le verse sur le moyen de paiement choisi à l'inscription." },
  { q: "Ai-je besoin d'un site ou de connaissances techniques ?", a: "Non. Vos produits apparaissent directement sur la marketplace Amachia. Tout se gère depuis votre espace vendeur, sur téléphone ou ordinateur." },
  { q: "Les coordonnées de mes clients sont-elles visibles ?", a: "Pour protéger les clients, leur téléphone et leur e-mail ne sont pas transmis aux vendeurs : vous voyez le prénom et le quartier. La livraison est assurée par Amachia." },
  { q: "Puis-je vendre plusieurs types de produits ?", a: "Oui. Chaque produit suit le taux de commission de sa catégorie. Les comptes Entreprise peuvent vendre dans un nombre illimité de catégories." },
];

export function Faq({ items = FAQ }: { items?: { q: string; a: string }[] }) {
  return (
    <section className="py-24 md:py-32">
      <Container className="max-w-3xl">
        <Reveal variant="blur"><SectionHeading eyebrow="Questions fréquentes" title="Tout ce que vous voulez savoir" /></Reveal>
        <div className="mt-12 divide-y divide-border overflow-hidden rounded-[1.4rem] border border-border bg-card">
          {items.map((f, i) => (
            <Reveal key={f.q} variant="up" delay={i * 80}><details className="group px-6 py-5 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-[15px] font-semibold sm:text-base">
                {f.q}
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-secondary transition group-open:rotate-45 group-open:bg-primary group-open:text-black"><Plus size={16} /></span>
              </summary>
              <p className="faq-answer mt-3 pr-10 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
            </details></Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}
