import { createFileRoute } from "@tanstack/react-router";
import { Header } from "@/components/seller/Header";
import { Hero } from "@/components/seller/Hero";
import { Features } from "@/components/seller/Features";
import { HowItWorks } from "@/components/seller/HowItWorks";
import { FinalCTA } from "@/components/seller/FinalCTA";
import { PricingTeaser } from "@/components/seller/site/Pricing";
import { Trust } from "@/components/seller/site/Trust";
import { SellerReviews } from "@/components/seller/site/SellerReviews";
import { Faq } from "@/components/seller/site/Faq";
import { Footer } from "@/components/seller/Footer";
import { SectionDivider } from "@/components/seller/site/motion";

export const Route = createFileRoute("/")({
  head: () => ({
    scripts: [{ type: "application/ld+json", children: JSON.stringify([
      { "@context": "https://schema.org", "@type": "Organization", "@id": "https://amachia.com/#organization", name: "Amachia", url: "https://amachia.com", logo: "https://amachia.com/icon-512.png", areaServed: "CM" },
      { "@context": "https://schema.org", "@type": "WebSite", name: "Amachia Seller", alternateName: "Vendre sur Amachia", url: "https://seller.amachia.com", inLanguage: "fr-CM", publisher: { "@id": "https://amachia.com/#organization" } },
      { "@context": "https://schema.org", "@type": "WebPage", name: "Vendre sur Amachia : ouvrez votre boutique en ligne au Cameroun", url: "https://seller.amachia.com/", description: "Ouvrez votre boutique sur Amachia gratuitement : publiez vos produits, recevez vos commandes en temps réel. Paiement et livraison gérés par Amachia." },
    ]) }],
    links: [{ rel: "canonical", href: "https://seller.amachia.com/" }],
    meta: [
      { title: "Amachia Seller — Vendez partout au Cameroun" },
      { name: "description", content: "Ouvrez votre boutique sur Amachia gratuitement : publiez vos produits, recevez vos commandes en temps réel. Paiement et livraison gérés par Amachia." },
      { property: "og:title", content: "Amachia Seller — Vendez partout au Cameroun" },
      { property: "og:description", content: "Créez votre boutique, gérez vos produits et développez votre activité sur Amachia." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
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
        <SectionDivider index={4} label="Avis vendeurs" />
        <SellerReviews />
        <SectionDivider index={5} label="Tarifs" />
        <PricingTeaser />
        <SectionDivider index={6} label="Questions" />
        <Faq />
        <SectionDivider index={7} label="Lancez-vous" />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}
