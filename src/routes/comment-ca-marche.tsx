import { createFileRoute } from "@tanstack/react-router";
import { Header } from "@/components/seller/Header";
import { Footer } from "@/components/seller/Footer";
import { FinalCTA } from "@/components/seller/FinalCTA";
import { Faq } from "@/components/seller/site/Faq";
import { STEPS } from "@/components/seller/HowItWorks";
import { Container, PageHero, PrimaryCta } from "@/components/seller/site/ui";
import { ShoppingCart, PackageCheck, Bike, Home, Wallet } from "lucide-react";

export const Route = createFileRoute("/comment-ca-marche")({
  head: () => ({
    meta: [
      { title: "Comment ça marche — Amachia Seller" }, { name: "description", content: "De l'inscription à votre premier versement : comment vendre sur Amachia, étape par étape." },
      { property: "og:title", content: "Comment ça marche — Amachia Seller" }, { property: "og:description", content: "Vendre sur Amachia, étape par étape." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

const journey = [
  { icon: ShoppingCart, t: "Le client commande", d: "Sur le site Amachia, il choisit votre produit et paie à la livraison, par Mobile Money ou par carte." },
  { icon: PackageCheck, t: "Vous préparez", d: "Votre espace sonne. La commande passe « En préparation » dès qu'un livreur l'accepte." },
  { icon: Bike, t: "Le livreur récupère", d: "Un livreur Prime proche de votre boutique vient chercher le colis : « En cours de livraison »." },
  { icon: Home, t: "Le client reçoit", d: "La commande est livrée ; le statut « Livrée » apparaît chez vous, chez le client et chez Amachia." },
  { icon: Wallet, t: "Vous êtes payé", d: "Le montant, moins la commission, passe dans votre solde disponible puis vous est versé." },
];

function Page() {
  return (
    <div className="min-h-screen overflow-x-clip bg-background">
      <Header />
      <main>
        <PageHero eyebrow="Comment ça marche" title={<>Simple pour vous. <span className="text-gradient">Rassurant pour vos clients.</span></>}
          text="Vous vous occupez de vos produits. Amachia s'occupe de l'encaissement, de la livraison et du suivi." />
        <section className="py-10">
          <Container>
            <h2 className="text-center text-2xl font-extrabold sm:text-3xl">Démarrer en 4 étapes</h2>
            <ol className="mt-10 grid gap-4 md:grid-cols-4">
              {STEPS.map((s, i) => (
                <li key={s.title} className="rounded-[1.4rem] border border-border bg-card p-6 shadow-card">
                  <div className="flex items-center justify-between"><span className="grid h-11 w-11 place-items-center rounded-xl bg-primary text-black"><s.icon size={19} /></span><span className="tabular text-4xl font-extrabold text-foreground/10">0{i + 1}</span></div>
                  <h3 className="mt-5 text-lg font-bold">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
                </li>
              ))}
            </ol>
          </Container>
        </section>
        <section className="py-20">
          <Container>
            <h2 className="text-center text-2xl font-extrabold sm:text-3xl">Le parcours d'une commande</h2>
            <p className="mx-auto mt-3 max-w-xl text-center text-muted-foreground">Les mêmes étapes s'affichent dans votre espace, chez le client et dans l'admin Amachia.</p>
            <div className="relative mx-auto mt-12 max-w-3xl">
              <div aria-hidden className="absolute bottom-6 left-[1.4rem] top-6 w-px bg-gradient-to-b from-primary via-primary/40 to-transparent sm:left-1/2" />
              {journey.map((j, i) => (
                <div key={j.t} className={`relative mb-6 flex items-start gap-5 sm:w-1/2 ${i % 2 ? "sm:ml-auto sm:pl-10" : "sm:flex-row-reverse sm:pr-10 sm:text-right"}`}>
                  <span className={`relative z-10 grid h-11 w-11 shrink-0 place-items-center rounded-full border-4 border-background bg-primary text-black sm:absolute sm:top-3 ${i % 2 ? "sm:-left-[1.4rem]" : "sm:-right-[1.4rem]"}`}><j.icon size={18} /></span>
                  <div className="rounded-[1.2rem] border border-border bg-card p-5 shadow-card">
                    <p className="font-bold">{j.t}</p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{j.d}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-10 text-center"><PrimaryCta /></div>
          </Container>
        </section>
        <Faq />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}
