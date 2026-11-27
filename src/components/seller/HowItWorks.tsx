import { UserPlus, PackagePlus, Bell, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { Container, SectionHeading } from "@/components/seller/site/ui";
import { Reveal, useInView } from "@/components/seller/site/motion";
import { HomePhoto, useHomeImages, type HomeImageSlot } from "@/components/seller/site/homeImages";

export const STEPS = [
  { icon: UserPlus, title: "Créez votre compte", text: "Inscription gratuite : informations de la boutique, documents et moyen de versement. Amachia vérifie votre compte." },
  { icon: PackagePlus, title: "Publiez vos produits", text: "Photos, prix, variantes (couleurs, tailles) et stock. L'assistant IA rédige la fiche pour vous." },
  { icon: Bell, title: "Recevez les commandes", text: "Une sonnerie vous prévient. Préparez le colis : un livreur Prime vient le récupérer dans votre boutique." },
  { icon: Wallet, title: "Encaissez", text: "Une fois la commande livrée, le montant (moins la commission) passe dans votre solde et vous est versé par Amachia." },
];

export function HowItWorks() {
  const { ref, inView } = useInView<HTMLOListElement>(0.3);
  const [active, setActive] = useState(-1);
  // dès qu'une étape a une photo, les étapes sans photo reçoivent un visuel de même hauteur (cartes alignées)
  const imgs = useHomeImages();
  const anyPhoto = STEPS.some((_, i) => imgs[`etape${i + 1}` as HomeImageSlot]?.url);
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
        <ol ref={ref} className="stagger relative mt-16 grid gap-4 md:grid-cols-4">
          {/* trait de progression (ordinateur : horizontal ; mobile : vertical) */}
          <div aria-hidden className="absolute left-0 right-0 top-[2.15rem] hidden h-0.5 rounded bg-border md:block">
            <div className="step-progress h-full rounded bg-primary shadow-[0_0_14px_var(--primary)]" style={{ width: active < 0 ? "0%" : `${((active + 1) / STEPS.length) * 100}%` }} />
          </div>
          <div aria-hidden className="absolute bottom-6 left-[2.15rem] top-6 w-0.5 rounded bg-border md:hidden">
            <div className="w-full rounded bg-primary transition-[height] duration-[1200ms] ease-out" style={{ height: active < 0 ? "0%" : `${((active + 1) / STEPS.length) * 100}%` }} />
          </div>
          {STEPS.map((s, i) => (
            <Reveal as="li" key={s.title} variant="up" className={`step-card relative rounded-[1.4rem] border border-border bg-card p-6 shadow-card ${active === i ? "is-active" : ""}`}>
              {anyPhoto && !imgs[`etape${i + 1}` as HomeImageSlot]?.url ? (
                <div aria-hidden className="relative -mx-6 -mt-6 mb-5 grid aspect-[16/10] place-items-center overflow-hidden rounded-t-[1.4rem] bg-[radial-gradient(ellipse_at_30%_20%,color-mix(in_oklab,var(--primary)_28%,transparent),transparent_65%)] bg-secondary">
                  <s.icon size={56} strokeWidth={1.4} className="text-primary/70" />
                </div>
              ) : (
                <HomePhoto slot={`etape${i + 1}` as HomeImageSlot} width={384} sizes="(min-width: 768px) 25vw, 100vw" className="-mx-6 -mt-6 mb-5 aspect-[16/10] rounded-t-[1.4rem]" />
              )}
              <div className="flex items-center justify-between">
                <span className={`relative grid h-11 w-11 place-items-center rounded-xl transition-colors duration-500 ${i <= active ? "bg-primary text-black" : "bg-secondary text-muted-foreground"}`}>
                  {active === i && <span className="animate-ping-soft absolute inset-0 rounded-xl bg-primary/60" />}
                  <s.icon size={19} className="relative" />
                </span>
                <span className={`tabular text-4xl font-extrabold transition-colors duration-500 ${active === i ? "text-primary" : "text-foreground/10"}`}>0{i + 1}</span>
              </div>
              <h3 className="mt-5 text-lg font-bold">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
            </Reveal>
          ))}
        </ol>
      </Container>
    </section>
  );
}
