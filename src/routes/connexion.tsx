import { AuthSplit } from "@/components/seller/site/AuthSplit";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PasswordInput } from "@/components/ui/password-input";
import { PhoneInput } from "@/components/seller/PhoneInput";
import { cmDigits, cmPhoneError, formatCm, toE164 } from "@/lib/phone";

export const Route = createFileRoute("/connexion")({
  head: () => ({
    meta: [
      { title: "Connexion — Amashia Seller" }, { property: "og:title", content: "Connexion — Amashia Seller" }, { property: "og:description", content: "Accédez à votre tableau de bord vendeur Amashia Seller." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
      { name: "description", content: "Accédez à votre tableau de bord vendeur Amashia Seller." },
    ],
  }),
  component: Page,
});

function Page() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"email" | "phone">("email");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [recovery, setRecovery] = useState(false);
  useEffect(() => {
    // Retour depuis le lien de confirmation reçu par email : le compte est
    // connecté automatiquement, on ouvre directement le tableau de bord.
    const fromEmailLink = /access_token=|[?&]code=/.test(window.location.hash + window.location.search);
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") { setRecovery(true); return; }
      if (fromEmailLink && session && (event === "SIGNED_IN" || event === "INITIAL_SESSION") && !/type=recovery/.test(window.location.hash)) {
        toast.success("Email confirmé ! Bienvenue sur Amashia.");
        navigate({ to: "/dashboard", replace: true });
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (recovery) {
        if (password.length < 8) { toast.error("Utilisez au moins 8 caractères."); return; }
        const { error } = await supabase.auth.updateUser({ password });
        if (error) { toast.error(error.message); return; }
        toast.success("Mot de passe mis à jour.");
        navigate({ to: "/dashboard", replace: true });
        return;
      }
      if (!identifier.trim()) {
        toast.error(tab === "email" ? "Adresse email requise" : "Numéro de téléphone requis");
        return;
      }
      if (tab === "phone") { const pe = cmPhoneError(cmDigits(identifier)); if (pe) { toast.error(pe); return; } }

      const credentials = tab === "email"
        ? { email: identifier.trim(), password }
        : { phone: toE164(cmDigits(identifier)), password };
      const { error } = await supabase.auth.signInWithPassword(credentials);
      if (error) return toast.error(error.message);
      toast.success("Connexion réussie");
      navigate({ to: "/dashboard", replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Connexion impossible pour le moment");
    } finally {
      setLoading(false);
    }
  }
  return (
    <AuthSplit>
        <div>
          <div>
            <div className="mb-8">
              <h1 className="text-3xl font-extrabold sm:text-4xl">Bon retour 👋</h1>
              <p className="mt-2 text-muted-foreground">Connectez-vous à votre espace vendeur.</p>
            </div>

            <div className="grid grid-cols-2 p-1 bg-secondary rounded-full mb-6">
              {(["email", "phone"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => { setTab(t); setIdentifier(""); }}
                  className={`py-2.5 rounded-full text-sm font-semibold transition ${tab === t ? "bg-gradient-primary text-black" : "text-muted-foreground"}`}
                >
                  {t === "email" ? "Email" : "Téléphone"}
                </button>
              ))}
            </div>

            <form onSubmit={login} className="space-y-5">
              <div>
                <label className="block text-sm font-medium mb-2">{tab === "email" ? "Adresse email" : "Numéro de téléphone"}</label>
                {tab === "phone" ? (
                  <PhoneInput value={identifier} onChange={setIdentifier} disabled={recovery} required={!recovery} className="w-full bg-[var(--surface-2)] border border-border rounded-xl px-4 h-12 text-[15px] focus:outline-none focus:ring-2 focus:ring-primary/60 focus:border-primary" />
                ) : (
                  <input
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    type="email"
                    disabled={recovery}
                    required={!recovery}
                    placeholder="votre@email.com"
                    className="w-full bg-[var(--surface-2)] border border-border rounded-xl px-4 h-12 text-[15px] focus:outline-none focus:ring-2 focus:ring-primary/60 focus:border-primary"
                  />
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Mot de passe</label>
                <PasswordInput
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Votre mot de passe"
                  required
                  className="w-full bg-[var(--surface-2)] border border-border rounded-xl px-4 h-12 text-[15px] focus:outline-none focus:ring-2 focus:ring-primary/60 focus:border-primary"
                />
              </div>
              <div className="text-right">
                <Button type="button" variant="link" className="text-sm text-primary" onClick={async () => {
                  if (tab !== "email" || !identifier.trim()) { toast.error("Renseignez votre adresse email."); return; }
                  const { error } = await supabase.auth.resetPasswordForEmail(identifier.trim(), { redirectTo: `${window.location.origin}/connexion` });
                  if (error) toast.error(error.message); else toast.success("Email de récupération envoyé.");
                }}>Mot de passe oublié ?</Button>
              </div>
              <button type="submit" disabled={loading} className="w-full h-12 rounded-full bg-primary text-black font-bold shadow-[0_10px_40px_-12px_var(--glow)] hover:bg-[#ff7a1f] transition disabled:opacity-60">
                {loading ? "Connexion..." : recovery ? "Enregistrer le nouveau mot de passe" : "Se connecter"}
              </button>
              <p className="text-center text-sm text-muted-foreground">
                Pas encore de compte ?{" "}
                <Link to="/inscription" className="text-primary font-semibold hover:underline">Créer un compte</Link>
              </p>
            </form>
          </div>
          <p className="text-center mt-6 text-xs text-muted-foreground">
            En vous connectant, vous acceptez nos{" "}
            <a href="https://amashia-client.vercel.app/legal/terms" className="text-primary hover:underline">conditions d'utilisation</a> et notre{" "}
            <a href="https://amashia-client.vercel.app/legal/privacy" className="text-primary hover:underline">politique de confidentialité</a>
          </p>
        </div>
    </AuthSplit>
  );
}
