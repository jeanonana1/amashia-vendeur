import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { DashboardLayout } from "@/components/seller/dashboard/DashboardLayout";
import { User, Bell, Lock, Globe, CreditCard, HelpCircle } from "lucide-react";
import { toast } from "sonner";
import { PasswordInput } from "@/components/ui/password-input";

export const Route = createFileRoute("/dashboard/parametres")({
  head: () => ({ meta: [{ title: "Paramètres — Amashia Seller" }, { name: "description", content: "Paramètres : votre espace vendeur Amashia pour gérer votre activité." }, { property: "og:title", content: "Paramètres — Amashia Seller" }, { property: "og:description", content: "Paramètres : votre espace vendeur Amashia pour gérer votre activité." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: ParametresPage,
});

const TABS = [
  { id: "profil", label: "Profil", icon: User },
  { id: "notifs", label: "Notifications", icon: Bell },
  { id: "securite", label: "Sécurité", icon: Lock },
  { id: "preferences", label: "Préférences", icon: Globe },
  { id: "facturation", label: "Facturation", icon: CreditCard },
  { id: "aide", label: "Aide", icon: HelpCircle },
];

const inputCls = "w-full bg-background border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary";

function ParametresPage() {
  const [tab, setTab] = useState("profil");

  return (
    <DashboardLayout title="Paramètres" subtitle="Gérez votre compte et préférences">
      <div className="grid lg:grid-cols-4 gap-6">
        <aside className="bg-card border border-border rounded-2xl p-3 space-y-1 h-fit">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition ${tab === t.id ? "bg-primary/15 text-primary font-semibold" : "text-muted-foreground hover:bg-secondary"}`}>
                <Icon size={16} /> {t.label}
              </button>
            );
          })}
        </aside>

        <div className="lg:col-span-3 bg-card border border-border rounded-2xl p-6">
          {tab === "profil" && (
            <div className="space-y-5">
              <h3 className="font-bold text-lg">Informations du profil</h3>
              <div className="flex items-center gap-5">
                <div className="w-20 h-20 rounded-2xl bg-gradient-primary grid place-items-center text-black text-2xl font-extrabold">A</div>
                <button className="px-4 py-2 rounded-full bg-secondary text-sm">Changer la photo</button>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div><label className="block text-sm mb-2">Prénom</label><input className={inputCls} defaultValue="Vendeur" /></div>
                <div><label className="block text-sm mb-2">Nom</label><input className={inputCls} defaultValue="Amashia" /></div>
                <div><label className="block text-sm mb-2">Email</label><input className={inputCls} defaultValue="vendeur@amashia.cm" /></div>
                <div><label className="block text-sm mb-2">Téléphone</label><input className={inputCls} defaultValue="+237 6 12 34 56 78" /></div>
              </div>
              <button onClick={() => toast.success("Profil mis à jour")} className="px-6 py-3 rounded-full bg-gradient-primary text-black font-semibold">Enregistrer</button>
            </div>
          )}
          {tab === "notifs" && (
            <div className="space-y-4">
              <h3 className="font-bold text-lg">Préférences de notifications</h3>
              {["Nouvelles commandes","Nouveaux avis","Paiements reçus","Promotions Amashia","Newsletter"].map((n) => (
                <div key={n} className="flex justify-between items-center py-3 border-b border-border last:border-0">
                  <div>
                    <p className="font-semibold text-sm">{n}</p>
                    <p className="text-xs text-muted-foreground">Recevoir par email et notification push</p>
                  </div>
                  <Toggle defaultOn />
                </div>
              ))}
            </div>
          )}
          {tab === "securite" && (
            <div className="space-y-5">
              <h3 className="font-bold text-lg">Sécurité du compte</h3>
              <div><label className="block text-sm mb-2">Mot de passe actuel</label><PasswordInput className={inputCls} /></div>
              <div><label className="block text-sm mb-2">Nouveau mot de passe</label><PasswordInput className={inputCls} /></div>
              <div><label className="block text-sm mb-2">Confirmer</label><PasswordInput className={inputCls} /></div>
              <button onClick={() => toast.success("Mot de passe modifié")} className="px-6 py-3 rounded-full bg-gradient-primary text-black font-semibold">Modifier</button>
              <div className="border-t border-border pt-5">
                <div className="flex justify-between items-center">
                  <div><p className="font-semibold">Authentification à deux facteurs</p><p className="text-xs text-muted-foreground">Ajoutez une couche de sécurité supplémentaire</p></div>
                  <Toggle />
                </div>
              </div>
            </div>
          )}
          {tab === "preferences" && (
            <div className="space-y-5">
              <h3 className="font-bold text-lg">Préférences</h3>
              <div><label className="block text-sm mb-2">Langue</label><select className={inputCls}><option>Français</option><option>English</option></select></div>
              <div><label className="block text-sm mb-2">Devise</label><select className={inputCls}><option>FCFA (XAF)</option><option>EUR</option><option>USD</option></select></div>
              <div><label className="block text-sm mb-2">Fuseau horaire</label><select className={inputCls}><option>(GMT+1) Douala</option></select></div>
            </div>
          )}
          {tab === "facturation" && (
            <div className="space-y-5">
              <h3 className="font-bold text-lg">Facturation</h3>
              <p className="text-sm text-muted-foreground">Aucune facture pour le moment. Vos factures apparaîtront ici.</p>
            </div>
          )}
          {tab === "aide" && (
            <div className="space-y-5">
              <h3 className="font-bold text-lg">Centre d'aide</h3>
              <p className="text-sm text-muted-foreground">Besoin d'aide ? Contactez notre équipe support.</p>
              <button className="px-6 py-3 rounded-full bg-gradient-primary text-black font-semibold">Contacter le support</button>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

function Toggle({ defaultOn = false }: { defaultOn?: boolean }) {
  const [on, setOn] = useState(defaultOn);
  return (
    <button onClick={() => setOn(!on)} className={`w-12 h-7 rounded-full transition relative ${on ? "bg-primary" : "bg-secondary"}`}>
      <span className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${on ? "left-6" : "left-1"}`} />
    </button>
  );
}
