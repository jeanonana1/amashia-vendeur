import { Check } from "lucide-react";
import { Container, SectionHeading, PrimaryCta } from "@/components/seller/site/ui";
import { CommissionCalculator, useCommissionRates } from "@/components/seller/site/Commission";
import { CountUp, Reveal } from "@/components/seller/site/motion";

/** Section tarifs de la page d'accueil : principe + simulateur. */
export function PricingTeaser() {
  const rates = useCommissionRates();
  const min = rates?.length ? Math.min(...rates.map((r) => r.rate)) : null;
  const max = rates?.length ? Math.max(...rates.map((r) => r.rate)) : null;
  return (
    <section className="relative py-24 md:py-32">
      <Container>
        <div className="grid grid-cols-[minmax(0,1fr)] items-center gap-12 lg:grid-cols-2">
          <Reveal variant="left">
            <SectionHeading center={false} eyebrow="Tarifs" title={<>Vous ne payez <span className="text-gradient">que quand vous vendez</span></>}
              text="Pas d'abonnement, pas de frais d'inscription. Une commission par catégorie, prélevée seulement sur les commandes livrées." />
            <div className="mt-8 text-center lg:text-left">
              <p className="tabular whitespace-nowrap text-[2.6rem] font-extrabold leading-none min-[380px]:text-5xl sm:text-6xl">{min == null ? "—" : min === max ? <><CountUp to={min} />&nbsp;%</> : <><CountUp to={min} />–<CountUp to={max ?? 0} />&nbsp;%</>}</p>
              <p className="mt-2 text-muted-foreground">de commission selon la catégorie</p>
            </div>
            <ul className="mx-auto mt-8 w-fit max-w-full space-y-3 text-[15px] lg:mx-0">
              {["Boutique et fiches produits illimitées", "Encaissement et livraison gérés par Amashia", "Assistant IA, analytique, promotions inclus", "Versement de votre solde par Amashia"].map((t, i) => (
                <Reveal as="li" key={t} variant="left" delay={250 + i * 140} className="flex items-center gap-3"><span className="grid h-6 w-6 place-items-center rounded-full bg-primary/15 text-primary"><Check size={14} strokeWidth={3} /></span>{t}</Reveal>
              ))}
            </ul>
            <div className="mt-10 flex justify-center lg:justify-start"><PrimaryCta>Créer ma boutique</PrimaryCta></div>
          </Reveal>
          <Reveal variant="scale" delay={150}><CommissionCalculator rates={rates} /></Reveal>
        </div>
      </Container>
    </section>
  );
}
