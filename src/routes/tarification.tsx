import { createFileRoute } from "@tanstack/react-router";
import { Header } from "@/components/seller/Header";
import { Footer } from "@/components/seller/Footer";
import { FinalCTA } from "@/components/seller/FinalCTA";
import { Faq } from "@/components/seller/site/Faq";
import { CommissionCalculator, useCommissionRates } from "@/components/seller/site/Commission";
import { Container, PageHero } from "@/components/seller/site/ui";
import { Check, X } from "lucide-react";

export const Route = createFileRoute("/tarification")({
  head: () => ({
    meta: [
      { title: "Tarifs et commissions — Amashia Seller" }, { name: "description", content: "Inscription gratuite, aucun abonnement : une commission par catégorie, seulement sur les commandes livrées." },
      { property: "og:title", content: "Tarifs et commissions — Amashia Seller" }, { property: "og:description", content: "Une commission seulement sur les ventes livrées." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

const FAQ_PRICE = [
  { q: "Quand la commission est-elle prélevée ?", a: "Uniquement sur les commandes livrées. Une commande annulée ne vous coûte rien." },
  { q: "Les frais de livraison sont-ils à ma charge ?", a: "Non : les frais de livraison sont payés par le client au moment de la commande (gratuits pour lui au-delà d'un certain montant ou avec Prime)." },
  { q: "Où voir le détail de ce que je paie ?", a: "Dans votre espace, la page « Commissions » détaille, commande par commande, le taux appliqué, le montant prélevé et ce que vous recevez." },
  { q: "Les taux peuvent-ils changer ?", a: "Les taux sont fixés par catégorie par Amashia. Cette page affiche toujours les taux en vigueur, lus directement dans notre base." },
];

function Page() {
  const rates = useCommissionRates();
  return (
    <div className="min-h-screen overflow-x-clip bg-background">
      <Header />
      <main>
        <PageHero eyebrow="Tarifs" title={<>Gratuit pour commencer. <span className="text-gradient">Une commission quand vous vendez.</span></>}
          text="Pas d'abonnement, pas de frais d'inscription, pas de frais cachés. Vous ne payez qu'une commission sur les commandes livrées." />
        <section className="pb-10">
          <Container>
            <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
              <div className="rounded-[1.6rem] border border-border bg-card p-6 shadow-card sm:p-8">
                <p className="text-sm font-bold">Commissions par catégorie</p>
                <p className="mt-1 text-xs text-muted-foreground">Taux en vigueur, mis à jour en direct.</p>
                <div className="mt-6 divide-y divide-border">
                  {(rates ?? Array.from({ length: 5 }, () => null)).map((r, i) => (
                    <div key={r?.slug ?? i} className="flex items-center justify-between py-3.5">
                      {r ? <><span className="font-medium">{r.name}</span><span className="tabular rounded-full bg-primary/12 px-3 py-1 text-sm font-extrabold text-primary">{r.rate} %</span></>
                        : <span className="h-4 w-full animate-pulse rounded bg-secondary" />}
                    </div>
                  ))}
                </div>
              </div>
              <CommissionCalculator rates={rates} />
            </div>
            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <div className="rounded-[1.6rem] border border-border bg-card p-6 shadow-card sm:p-8">
                <p className="font-bold">Inclus pour tous les vendeurs</p>
                <ul className="mt-5 space-y-3 text-sm">
                  {["Boutique et produits illimités", "Encaissement : livraison, Orange Money, MTN MoMo, carte", "Livraison Prime ou par agence", "Assistant IA pour les fiches produits", "Analytique, ventes flash, coupons", "Gestion des retours et des avis"].map((t) => (
                    <li key={t} className="flex items-center gap-3"><span className="grid h-6 w-6 place-items-center rounded-full bg-primary/15 text-primary"><Check size={13} strokeWidth={3} /></span>{t}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-[1.6rem] border border-border bg-card p-6 shadow-card sm:p-8">
                <p className="font-bold">Ce que vous ne payez jamais</p>
                <ul className="mt-5 space-y-3 text-sm">
                  {["Frais d'inscription", "Abonnement mensuel", "Commission sur une commande annulée", "Frais de livraison (payés par le client)"].map((t) => (
                    <li key={t} className="flex items-center gap-3"><span className="grid h-6 w-6 place-items-center rounded-full bg-secondary text-muted-foreground"><X size={13} strokeWidth={3} /></span>{t}</li>
                  ))}
                </ul>
              </div>
            </div>
          </Container>
        </section>
        <Faq items={FAQ_PRICE} />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}
