import { UserPlus, PackagePlus, Bell, Wallet } from "lucide-react";
import { Container, SectionHeading } from "@/components/seller/site/ui";

export const STEPS = [
  { icon: UserPlus, title: "Créez votre compte", text: "Inscription gratuite : informations de la boutique, documents et moyen de versement. Amashia vérifie votre compte." },
  { icon: PackagePlus, title: "Publiez vos produits", text: "Photos, prix, variantes (couleurs, tailles) et stock. L'assistant IA rédige la fiche pour vous." },
  { icon: Bell, title: "Recevez les commandes", text: "Une sonnerie vous prévient. Préparez le colis : un livreur Prime vient le récupérer dans votre boutique." },
  { icon: Wallet, title: "Encaissez", text: "Une fois la commande livrée, le montant (moins la commission) passe dans votre solde et vous est versé par Amashia." },
];

export function HowItWorks() {
  return (
    <section className="relative py-24 md:py-32">
      <Container>
        <SectionHeading eyebrow="Comment ça marche" title={<>De l'inscription à votre <span className="text-gradient">première vente</span></>} text="Quatre étapes, aucune compétence technique. Tout se fait depuis votre téléphone ou votre ordinateur." />
        <ol className="relative mt-16 grid gap-4 md:grid-cols-4">
          <div aria-hidden className="absolute left-0 right-0 top-[2.15rem] hidden h-px bg-gradient-to-r from-transparent via-border to-transparent md:block" />
          {STEPS.map((s, i) => (
            <li key={s.title} className="relative rounded-[1.4rem] border border-border bg-card p-6 shadow-card">
              <div className="flex items-center justify-between">
                <span className="relative grid h-11 w-11 place-items-center rounded-xl bg-primary text-black"><s.icon size={19} /></span>
                <span className="tabular text-4xl font-extrabold text-foreground/10">0{i + 1}</span>
              </div>
              <h3 className="mt-5 text-lg font-bold">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}
