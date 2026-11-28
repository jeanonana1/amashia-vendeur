import { UserPlus, PackagePlus } from "lucide-react";
import { IconNotifications as Bell, IconPortefeuille as Wallet } from "@/components/icons/AmachiaIcons";
import { useEffect, useState } from "react";
import { Container, SectionHeading } from "@/components/seller/site/ui";
import { Reveal, useInView } from "@/components/seller/site/motion";
import { HomePhoto, useHomeImages, type HomeImageSlot } from "@/components/seller/site/homeImages";

export const STEPS = [
  { icon: UserPlus, title: "Créez votre compte", text: "Inscription gratuite : vos informations, vos documents, puis votre boutique (nom, logo, quartier). Amachia vérifie votre compte." },
  { icon: PackagePlus, title: "Publiez vos produits", text: "Photos, prix, variantes (couleurs, tailles) et stock. L'assistant IA rédige la fiche pour vous." },
  { icon: Bell, title: "Recevez les commandes", text: "Une sonnerie vous prévient. Préparez le colis : un livreur Prime vient le récupérer dans votre boutique." },
  { icon: Wallet, title: "Encaissez", text: "Une fois la commande livrée, le montant (moins la commission) passe dans votre solde et vous est versé par Amachia." },
];

export function HowItWorks() {
  const { ref, inView } = useInView<HTMLOListElement>(0.3);
  const [active, setActive] = useState(-1);
  const imgs = useHomeImages();
  // une fois la section à l'écran, les étapes s'allument l'une après l'autre, en boucle
  useEffect(() => {
    if (!inView) return;
    setActive(0);
    const t = window.setInterval(() => setActive((a) => (a + 1) % STEPS.length), 2400);
    return () => window.clearInterval(t);
  }, [inView]);
  return (
    <section className="relative py-24 md:py-32">
      <Container>
        <Reveal variant="blur"><SectionHeading eyebrow="Comment ça marche" title={<>De l'inscription à votre <span className="text-gradient">première vente</span></>} text="Quatre étapes, aucune compétence technique. Tout se fait depuis votre téléphone ou votre ordinateur." /></Reveal>
        {/* Images au format vertical 9:16 (format TikTok). Mobile : cartes qui défilent sur le côté ; ordinateur : 4 colonnes. */}
        <ol ref={ref} className="stagger relative mt-12 -mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-4 [scrollbar-width:none] md:mx-0 md:mt-16 md:grid md:grid-cols-4 md:overflow-visible md:px-0 md:pb-0 [&::-webkit-scrollbar]:hidden">
          {STEPS.map((s, i) => {
            const slot = `etape${i + 1}` as HomeImageSlot;
            const has = !!imgs[slot]?.url;
            return (
              <Reveal as="li" key={s.title} variant="up" className={`step-card relative w-[72vw] max-w-[300px] shrink-0 snap-center overflow-hidden rounded-[1.4rem] border border-border bg-card shadow-card md:w-auto md:max-w-none ${active === i ? "is-active" : ""}`}>
                <div className="relative aspect-[9/16] overflow-hidden">
                  {has ? (
                    <HomePhoto slot={slot} width={540} sizes="(min-width: 768px) 25vw, 72vw" className="absolute inset-0 h-full w-full" />
                  ) : (
                    <div aria-hidden className="absolute inset-0 grid place-items-center bg-secondary bg-[radial-gradient(ellipse_at_30%_20%,color-mix(in_oklab,var(--primary)_28%,transparent),transparent_65%)]">
                      <s.icon size={64} strokeWidth={1.3} className="text-primary/70" />
                    </div>
                  )}
                  {/* numéro et icône posés sur l'image, texte en bas lisible sur un dégradé */}
                  <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
                    <span className={`relative grid h-11 w-11 place-items-center rounded-xl backdrop-blur transition-colors duration-500 ${i <= active ? "bg-primary text-black" : "bg-black/40 text-white"}`}>
                      {active === i && <span className="animate-ping-soft absolute inset-0 rounded-xl bg-primary/60" />}
                      <s.icon size={19} className="relative" />
                    </span>
                    <span className={`tabular text-4xl font-extrabold drop-shadow transition-colors duration-500 ${active === i ? "text-primary" : "text-white/80"}`}>0{i + 1}</span>
                  </div>
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/55 to-transparent p-4 pt-16 text-white">
                    <h3 className="text-lg font-bold">{s.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-white/85">{s.text}</p>
                  </div>
                </div>
                {/* progression de l'étape active */}
                <div aria-hidden className="h-1 w-full bg-border"><div className="h-full bg-primary transition-[width] duration-[2400ms] ease-linear" style={{ width: active === i ? "100%" : i < active ? "100%" : "0%" }} /></div>
              </Reveal>
            );
          })}
        </ol>
      </Container>
    </section>
  );
}
