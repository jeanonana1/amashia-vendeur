import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { User, Store, ArrowRight } from "lucide-react";
import { AuthSplit } from "@/components/seller/site/AuthSplit";

export const Route = createFileRoute("/inscription")({
  head: () => ({
    meta: [
      { title: "Inscription — Amachia Seller" }, { property: "og:title", content: "Inscription — Amachia Seller" }, { property: "og:description", content: "Choisissez votre type de compte et rejoignez Amachia Seller." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
      { name: "description", content: "Choisissez votre type de compte et rejoignez Amachia Seller." },
    ],
  }),
  component: Page,
});

function Page() {
  const navigate = useNavigate();
  const go = (type: "particulier" | "entreprise") => navigate({ to: "/inscription/etapes", search: { type } });
  return (
    <AuthSplit wide>
      <div>
        <p className="eyebrow">Inscription gratuite</p>
        <h1 className="mt-3 text-3xl font-extrabold sm:text-4xl">Quel compte souhaitez-vous créer ?</h1>
        <p className="mt-2 text-muted-foreground">Vous pourrez compléter les informations de votre boutique à l'étape suivante.</p>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <button onClick={() => go("particulier")} className="group rounded-[1.4rem] border border-border bg-card p-6 text-left shadow-card transition hover:border-foreground/25">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-secondary text-foreground"><User size={22} /></span>
            <h3 className="mt-5 text-xl font-bold">Particulier</h3>
            <p className="mt-2 text-sm text-muted-foreground">Vendez quelques produits en tant que personne physique, sans structure d'entreprise.</p>
            <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground group-hover:text-foreground">Continuer <ArrowRight size={16} /></span>
          </button>
          <button onClick={() => go("entreprise")} className="ring-gradient group relative rounded-[1.4rem] border border-primary/40 bg-card p-6 text-left shadow-card transition hover:border-primary">
            <span className="absolute right-4 top-4 rounded-full bg-primary px-2.5 py-1 text-[11px] font-bold text-black">Recommandé</span>
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary text-black"><Store size={22} /></span>
            <h3 className="mt-5 text-xl font-bold">Entreprise</h3>
            <p className="mt-2 text-sm text-muted-foreground">Votre boutique sur Amachia, avec des catégories illimitées. Idéal pour les commerces et marques.</p>
            <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-primary">Continuer <ArrowRight size={16} className="transition group-hover:translate-x-0.5" /></span>
          </button>
        </div>
        <p className="mt-8 text-sm text-muted-foreground">Vous avez déjà un compte ? <Link to="/connexion" className="font-semibold text-primary hover:underline">Se connecter</Link></p>
      </div>
    </AuthSplit>
  );
}
