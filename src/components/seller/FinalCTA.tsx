import { Container, GhostCta, PrimaryCta } from "@/components/seller/site/ui";
import { Reveal } from "@/components/seller/site/motion";
import { HomePhoto } from "@/components/seller/site/homeImages";

export function FinalCTA() {
  return (
    <section className="py-16 md:py-24">
      <Container>
        <Reveal variant="scale" className="relative isolate overflow-hidden rounded-[2rem] border border-border bg-[#0b0e14] px-6 py-16 text-center text-white sm:px-12 md:py-24">
          {/* photo de fond (si choisie dans l'admin), fortement voilée pour garder le texte lisible */}
          <div aria-hidden className="absolute inset-0 -z-20">
            <HomePhoto slot="cta" width={1080} sizes="(min-width: 1024px) 1200px, 100vw" shade={false} className="h-full w-full">
              <div className="absolute inset-0 bg-[#0b0e14]/75" />
            </HomePhoto>
          </div>
          <div aria-hidden className="absolute inset-0 -z-10">
            <div className="absolute inset-0 opacity-60 [background-image:linear-gradient(rgba(255,255,255,.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.05)_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(ellipse_at_center,#000_30%,transparent_75%)]" />
            <div className="glow-breathe absolute left-1/2 top-full h-[30rem] w-[50rem] rounded-full bg-[#ff6800]/40 blur-[110px]" />
          </div>
          <h2 className="mx-auto max-w-3xl text-balance text-3xl font-extrabold leading-[1.05] sm:text-5xl md:text-6xl">Votre prochaine vente commence aujourd'hui.</h2>
          <p className="mx-auto mt-5 max-w-xl text-white/70 md:text-lg">Ouvrez votre boutique en quelques minutes et touchez les clients d'Amachia partout au Cameroun.</p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <PrimaryCta className="cta-sweep w-full sm:w-auto">Créer ma boutique gratuitement</PrimaryCta>
            <GhostCta to="/connexion" className="w-full border-white/15 bg-white/5 text-white hover:bg-white/10 sm:w-auto">J'ai déjà un compte</GhostCta>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
