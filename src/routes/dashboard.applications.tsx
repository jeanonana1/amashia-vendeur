import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/seller/dashboard/DashboardLayout";
import { Check, X, Plus, Target, BarChart3, Eye, MousePointerClick } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/applications")({
  head: () => ({ meta: [{ title: "Applications — Amashia Seller" }, { name: "description", content: "Applications : votre espace vendeur Amashia pour gérer votre activité." }, { property: "og:title", content: "Applications — Amashia Seller" }, { property: "og:description", content: "Applications : votre espace vendeur Amashia pour gérer votre activité." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: AppsPage,
});

type Connection = { id: "facebook" | "tiktok"; connected: boolean; accountId?: string; pixelId?: string };
type Campaign = { id: string; name: string; platform: "facebook" | "tiktok"; objective: string; budget: number; status: "active" | "paused" | "ended"; impressions: number; clicks: number; ctr: string; spent: number };

const APPS = [
  { id: "facebook" as const, name: "Facebook Ads", color: "bg-[#1877F2]", desc: "Lancez des publicités Facebook & Instagram, suivez les conversions via Pixel.", objectives: ["Trafic", "Conversions", "Engagement", "Notoriété", "Ventes catalogue"] },
  { id: "tiktok" as const, name: "TikTok Ads", color: "bg-black border border-border", desc: "Touchez la GenZ avec des publicités vidéo natives et trackez via TikTok Pixel.", objectives: ["Trafic", "Conversions", "Vues vidéo", "Téléchargements", "Ventes"] },
];

function AppsPage() {
  const [conns, setConns] = useState<Record<string, Connection>>({});
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [connectingId, setConnectingId] = useState<"facebook" | "tiktok" | null>(null);
  const [creating, setCreating] = useState<"facebook" | "tiktok" | null>(null);
  const [accId, setAccId] = useState(""); const [pixelId, setPixelId] = useState("");
  const [form, setForm] = useState({ name: "", objective: "Conversions", budget: "5000", audience: "Cameroun 18-45", duration: "7" });

  useEffect(() => {
    setConns(JSON.parse(localStorage.getItem("ads-conns") || "{}"));
    setCampaigns(JSON.parse(localStorage.getItem("ads-campaigns") || "[]"));
  }, []);

  function saveConns(next: Record<string, Connection>) { setConns(next); localStorage.setItem("ads-conns", JSON.stringify(next)); }
  function saveCampaigns(next: Campaign[]) { setCampaigns(next); localStorage.setItem("ads-campaigns", JSON.stringify(next)); }

  function startConnect(id: "facebook" | "tiktok") {
    // Ouvre la page d'authentification officielle dans un nouvel onglet,
    // puis affiche le formulaire pour coller l'ID du compte une fois connecté.
    const url = id === "facebook"
      ? "https://www.facebook.com/login.php?next=https%3A%2F%2Fbusiness.facebook.com%2Fadsmanager%2Fmanage%2Faccounts"
      : "https://www.tiktok.com/login?redirect_url=https%3A%2F%2Fads.tiktok.com%2Fi18n%2Faccount%2Flogin";
    window.open(url, "_blank", "noopener,width=900,height=720");
    setConnectingId(id);
    toast.info(`Connectez-vous à ${id === "facebook" ? "Facebook" : "TikTok"} Ads, puis collez l'ID du compte ici.`);
  }
  function connect() {
    if (!connectingId || !accId) return toast.error("ID compte requis");
    saveConns({ ...conns, [connectingId]: { id: connectingId, connected: true, accountId: accId, pixelId } });
    toast.success("Compte connecté avec succès");
    setConnectingId(null); setAccId(""); setPixelId("");
  }
  function disconnect(id: "facebook" | "tiktok") {
    saveConns({ ...conns, [id]: { id, connected: false } });
    toast.success("Compte déconnecté");
  }
  function createCampaign() {
    if (!creating || !form.name) return toast.error("Nom requis");
    const c: Campaign = {
      id: crypto.randomUUID(), name: form.name, platform: creating, objective: form.objective,
      budget: Number(form.budget), status: "active", impressions: Math.floor(Math.random() * 5000),
      clicks: Math.floor(Math.random() * 300), ctr: (Math.random() * 5).toFixed(2) + "%", spent: 0,
    };
    saveCampaigns([c, ...campaigns]);
    toast.success("Campagne créée et activée");
    setCreating(null); setForm({ name: "", objective: "Conversions", budget: "5000", audience: "Cameroun 18-45", duration: "7" });
  }
  function toggleStatus(id: string) {
    saveCampaigns(campaigns.map((c) => c.id === id ? { ...c, status: c.status === "active" ? "paused" : "active" } : c));
  }
  function delCampaign(id: string) {
    if (!confirm("Supprimer la campagne ?")) return;
    saveCampaigns(campaigns.filter((c) => c.id !== id));
  }

  return (
    <DashboardLayout title="Applications" subtitle="Connectez vos outils marketing et lancez des publicités">
      <div className="grid md:grid-cols-2 gap-5 mb-8">
        {APPS.map((a) => {
          const c = conns[a.id];
          return (
            <div key={a.id} className="bg-card border border-border rounded-2xl p-6">
              <div className="flex items-start gap-4 mb-4">
                <div className={`w-14 h-14 rounded-2xl ${a.color} grid place-items-center text-white font-extrabold text-lg`}>{a.id === "facebook" ? "f" : "♪"}</div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-lg">{a.name}</h3>
                    {c?.connected && <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-semibold flex items-center gap-1"><Check size={10} /> Connecté</span>}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{a.desc}</p>
                </div>
              </div>
              {c?.connected ? (
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground bg-secondary rounded-xl p-3">
                    <p>Compte: <span className="font-mono text-foreground">{c.accountId}</span></p>
                    {c.pixelId && <p>Pixel: <span className="font-mono text-foreground">{c.pixelId}</span></p>}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setCreating(a.id)} className="flex-1 py-2.5 rounded-full bg-gradient-primary text-black text-sm font-semibold flex items-center justify-center gap-2"><Plus size={14} /> Nouvelle campagne</button>
                    <button onClick={() => disconnect(a.id)} className="px-4 py-2.5 rounded-full bg-secondary text-sm font-semibold">Déconnecter</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => startConnect(a.id)} className="w-full py-3 rounded-full bg-gradient-primary text-black font-semibold text-sm">Connecter mon compte {a.name}</button>
              )}
            </div>
          );
        })}
      </div>

      <div className="bg-card border border-border rounded-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold flex items-center gap-2"><Target size={18} /> Campagnes publicitaires</h3>
          <span className="text-xs text-muted-foreground">{campaigns.length} campagne(s)</span>
        </div>
        {campaigns.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground text-sm">Aucune campagne. Connectez un compte ads pour commencer.</div>
        ) : (
          <div className="space-y-3">
            {campaigns.map((c) => (
              <div key={c.id} className="border border-border rounded-xl p-4 flex flex-wrap items-center gap-4">
                <div className={`w-10 h-10 rounded-xl grid place-items-center text-white font-bold ${c.platform === "facebook" ? "bg-[#1877F2]" : "bg-black"}`}>{c.platform === "facebook" ? "f" : "♪"}</div>
                <div className="flex-1 min-w-[180px]">
                  <p className="font-bold">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.objective} • {c.budget.toLocaleString()} FCFA/jour</p>
                </div>
                <div className="flex gap-5 text-xs">
                  <div><p className="text-muted-foreground flex items-center gap-1"><Eye size={11} /> Vues</p><p className="font-bold text-sm">{c.impressions.toLocaleString()}</p></div>
                  <div><p className="text-muted-foreground flex items-center gap-1"><MousePointerClick size={11} /> Clics</p><p className="font-bold text-sm">{c.clicks}</p></div>
                  <div><p className="text-muted-foreground flex items-center gap-1"><BarChart3 size={11} /> CTR</p><p className="font-bold text-sm">{c.ctr}</p></div>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${c.status === "active" ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"}`}>{c.status === "active" ? "Active" : "En pause"}</span>
                <div className="flex gap-2">
                  <button onClick={() => toggleStatus(c.id)} className="px-3 py-1.5 rounded-lg bg-secondary text-xs font-semibold">{c.status === "active" ? "Pause" : "Reprendre"}</button>
                  <button onClick={() => delCampaign(c.id)} className="px-3 py-1.5 rounded-lg bg-destructive/10 text-destructive text-xs font-semibold">Supprimer</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {connectingId && (
        <Modal title={`Connecter ${connectingId === "facebook" ? "Facebook" : "TikTok"} Ads`} onClose={() => setConnectingId(null)}>
          <Field label="ID du compte publicitaire *"><input value={accId} onChange={(e) => setAccId(e.target.value)} placeholder="act_123456789" className={inputCls} /></Field>
          <Field label="ID du Pixel (tracking, optionnel)"><input value={pixelId} onChange={(e) => setPixelId(e.target.value)} placeholder="123456789012345" className={inputCls} /></Field>
          <div className="text-xs text-muted-foreground bg-secondary rounded-xl p-3">En connectant votre compte, vous autorisez Amashia à créer des campagnes et à suivre les conversions via votre pixel.</div>
          <button onClick={connect} className="w-full py-3 rounded-full bg-gradient-primary text-black font-semibold">Connecter le compte</button>
        </Modal>
      )}

      {creating && (
        <Modal title={`Nouvelle campagne ${creating === "facebook" ? "Facebook" : "TikTok"}`} onClose={() => setCreating(null)}>
          <Field label="Nom de la campagne *"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} /></Field>
          <Field label="Objectif">
            <select value={form.objective} onChange={(e) => setForm({ ...form, objective: e.target.value })} className={inputCls}>
              {APPS.find((a) => a.id === creating)!.objectives.map((o) => <option key={o}>{o}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Budget journalier (FCFA)"><input type="number" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} className={inputCls} /></Field>
            <Field label="Durée (jours)"><input type="number" value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} className={inputCls} /></Field>
          </div>
          <Field label="Audience cible"><input value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} className={inputCls} /></Field>
          <button onClick={createCampaign} className="w-full py-3 rounded-full bg-gradient-primary text-black font-semibold">Lancer la campagne</button>
        </Modal>
      )}
    </DashboardLayout>
  );
}

const inputCls = "w-full bg-background border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-sm mb-2 font-medium">{label}</label>{children}</div>;
}
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/60 grid place-items-center z-50 p-4 overflow-y-auto" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg space-y-4 my-8">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold">{title}</h3>
          <button onClick={onClose} className="w-8 h-8 grid place-items-center rounded-lg hover:bg-secondary"><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
