import { createFileRoute } from "@tanstack/react-router";
import { Header } from "@/components/seller/Header";
import { Hero } from "@/components/seller/Hero";
import { Features } from "@/components/seller/Features";
import { HowItWorks } from "@/components/seller/HowItWorks";
import { FinalCTA } from "@/components/seller/FinalCTA";
import { PricingTeaser } from "@/components/seller/site/Pricing";
import { Trust } from "@/components/seller/site/Trust";
import { Faq } from "@/components/seller/site/Faq";
import { Footer } from "@/components/seller/Footer";
import { SectionDivider } from "@/components/seller/site/motion";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Amashia Seller — Vendez partout au Cameroun" },
      { name: "description", content: "Ouvrez votre boutique sur Amashia gratuitement : publiez vos produits, recevez vos commandes en temps réel. Paiement et livraison gérés par Amashia." },
      { property: "og:title", content: "Amashia Seller — Vendez partout au Cameroun" },
      { property: "og:description", content: "Créez votre boutique, gérez vos produits et développez votre activité sur Amashia." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen overflow-x-clip bg-background">
      <Header />
      <main>
        <Hero />
        <SectionDivider index={1} label="Fonctionnalités" />
        <Features />
        <SectionDivider index={2} label="Comment ça marche" />
        <HowItWorks />
        <SectionDivider index={3} label="Confiance" />
        <Trust />
        <SectionDivider index={4} label="Tarifs" />
        <PricingTeaser />
        <SectionDivider index={5} label="Questions" />
        <Faq />
        <SectionDivider index={6} label="Lancez-vous" />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}
