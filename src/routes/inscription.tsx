import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Header } from "@/components/seller/Header";
import { Footer } from "@/components/seller/Footer";
import { User, Store, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/inscription")({
  head: () => ({
    meta: [
      { title: "Inscription — Amashia Seller" }, { property: "og:title", content: "Inscription — Amashia Seller" }, { property: "og:description", content: "Choisissez votre type de compte et rejoignez Amashia Seller." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
      { name: "description", content: "Choisissez votre type de compte et rejoignez Amashia Seller." },
    ],
  }),
  component: Page,
});

function Page() {
  const navigate = useNavigate();
  const go = (type: "particulier" | "entreprise") => navigate({ to: "/inscription/etapes", search: { type } });
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="flex-1 grid place-items-center py-16 px-6">
        <div className="w-full max-w-4xl bg-card border border-border rounded-3xl p-10 md:p-14">
          <div className="text-center mb-10">
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-primary grid place-items-center text-white text-2xl font-extrabold shadow-elegant">a</div>
            <h1 className="text-3xl md:text-4xl font-extrabold">Choisissez votre type de compte</h1>
            <p className="mt-3 text-muted-foreground">Sélectionnez le type de compte qui correspond à vos besoins</p>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <button onClick={() => go("particulier")} className="group text-left bg-background border border-border rounded-2xl p-7 hover:border-primary transition">
              <div className="w-14 h-14 rounded-2xl bg-primary/15 text-primary grid place-items-center mb-5">
                <User size={26} />
              </div>
              <h3 className="text-xl font-bold mb-2">Particulier</h3>
              <p className="text-sm text-muted-foreground mb-6">Créez un compte pour acheter des produits et utiliser des services sur Amashia</p>
              <span className="inline-flex items-center gap-2 text-primary font-semibold text-sm">
                Continuer <ArrowRight size={16} />
              </span>
            </button>
            <button onClick={() => go("entreprise")} className="group text-left bg-background border-2 border-primary/50 rounded-2xl p-7 hover:border-primary transition relative">
              <span className="absolute top-4 right-4 px-3 py-1 rounded-full bg-primary text-white text-xs font-bold">Vendeur</span>
              <div className="w-14 h-14 rounded-2xl bg-gradient-primary text-white grid place-items-center mb-5">
                <Store size={26} />
              </div>
              <h3 className="text-xl font-bold mb-2">Entreprise</h3>
              <p className="text-sm text-muted-foreground mb-6">Créez votre boutique et vendez vos produits ou services sur Amashia</p>
              <span className="inline-flex items-center gap-2 text-primary font-semibold text-sm">
                Continuer <ArrowRight size={16} />
              </span>
            </button>
          </div>
          <p className="text-center mt-8 text-sm text-muted-foreground">
            Vous avez déjà un compte ?{" "}
            <Link to="/connexion" className="text-primary font-semibold hover:underline">Se connecter</Link>
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
