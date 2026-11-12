import { createFileRoute } from "@tanstack/react-router";
import { Header } from "@/components/seller/Header";
import { Hero } from "@/components/seller/Hero";
import { Features } from "@/components/seller/Features";
import { HowItWorks } from "@/components/seller/HowItWorks";
import { Testimonials } from "@/components/seller/Testimonials";
import { Stats } from "@/components/seller/Stats";
import { FinalCTA } from "@/components/seller/FinalCTA";
import { Footer } from "@/components/seller/Footer";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Amashia Seller — Vendez plus intelligemment, plus rapidement" },
      { name: "description", content: "La plateforme tout-en-un pour les vendeurs africains. Créez votre boutique, gérez vos produits et développez votre activité." },
      { property: "og:title", content: "Amashia Seller — Vendez plus intelligemment, plus rapidement" },
      { property: "og:description", content: "Créez votre boutique, gérez vos produits et développez votre activité sur Amashia." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <Hero />
        <Features />
        <HowItWorks />
        <Testimonials />
        <Stats />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}
