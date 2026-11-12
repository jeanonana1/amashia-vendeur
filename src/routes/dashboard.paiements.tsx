import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/seller/dashboard/DashboardLayout";
import { Wallet, ArrowDownToLine, CreditCard, Smartphone, Plus, X, Trash2, History } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/paiements")({
  head: () => ({ meta: [{ title: "Paiements — Amashia Seller" }, { name: "description", content: "Paiements : votre espace vendeur Amashia pour gérer votre activité." }, { property: "og:title", content: "Paiements — Amashia Seller" }, { property: "og:description", content: "Paiements : votre espace vendeur Amashia pour gérer votre activité." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: PaiementsPage,
});

type Method = { id: string; type: "mobile" | "card"; label: string; details: Record<string, string> };
type Withdrawal = { id: string; amount: number; methodLabel: string; date: string; status: "completed" | "pending" };
type Tx = { id: string; type: "credit" | "debit"; desc: string; amount: number; date: string };

const initialBalance = 125500;

function PaiementsPage() {
  const [methods, setMethods] = useState<Method[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [openWithdraw, setOpenWithdraw] = useState(false);
  const [openMethod, setOpenMethod] = useState<"mobile" | "card" | null>(null);
  const [openHistory, setOpenHistory] = useState(false);

  const [wAmount, setWAmount] = useState(""); const [wMethod, setWMethod] = useState("");
  const [mForm, setMForm] = useState({ operator: "MTN", phone: "", holder: "", number: "", expiry: "", cvc: "" });

  useEffect(() => {
    setMethods(JSON.parse(localStorage.getItem("pay-methods") || "[]"));
    setWithdrawals(JSON.parse(localStorage.getItem("pay-withdrawals") || "[]"));
    setTxs(JSON.parse(localStorage.getItem("pay-txs") || JSON.stringify([
      { id: "1", type: "credit", desc: "Vente #12345", amount: 45000, date: "10 Jan 2025" },
      { id: "2", type: "credit", desc: "Vente #12343", amount: 62000, date: "09 Jan 2025" },
    ])));
  }, []);

  function saveMethods(n: Method[]) { setMethods(n); localStorage.setItem("pay-methods", JSON.stringify(n)); }
  function saveWithdrawals(n: Withdrawal[]) { setWithdrawals(n); localStorage.setItem("pay-withdrawals", JSON.stringify(n)); }

  const balance = initialBalance - withdrawals.filter(w => w.status === "completed").reduce((a, w) => a + w.amount, 0);

  function addMethod() {
    if (openMethod === "mobile") {
      if (!mForm.phone || !mForm.holder) return toast.error("Numéro et nom requis");
      const m: Method = { id: crypto.randomUUID(), type: "mobile", label: `${mForm.operator} ${mForm.phone.slice(-4).padStart(mForm.phone.length, "•")}`, details: { operator: mForm.operator, phone: mForm.phone, holder: mForm.holder } };
      saveMethods([...methods, m]);
    } else {
      if (!mForm.number || !mForm.holder || !mForm.expiry) return toast.error("Champs carte requis");
      const last4 = mForm.number.slice(-4);
      const m: Method = { id: crypto.randomUUID(), type: "card", label: `Carte •••• ${last4}`, details: { holder: mForm.holder, last4, expiry: mForm.expiry } };
      saveMethods([...methods, m]);
    }
    toast.success("Méthode ajoutée");
    setOpenMethod(null); setMForm({ operator: "MTN", phone: "", holder: "", number: "", expiry: "", cvc: "" });
  }
  function delMethod(id: string) { if (confirm("Supprimer ?")) saveMethods(methods.filter((m) => m.id !== id)); }

  function submitWithdraw() {
    const amt = Number(wAmount);
    if (!amt || amt <= 0) return toast.error("Montant invalide");
    if (amt > balance) return toast.error("Solde insuffisant");
    if (!wMethod) return toast.error("Choisissez une méthode");
    const m = methods.find((x) => x.id === wMethod);
    const w: Withdrawal = { id: crypto.randomUUID(), amount: amt, methodLabel: m?.label || "—", date: new Date().toLocaleDateString("fr-FR"), status: "completed" };
    saveWithdrawals([w, ...withdrawals]);
    toast.success(`Retrait de ${amt.toLocaleString()} FCFA effectué`);
    setOpenWithdraw(false); setWAmount(""); setWMethod("");
  }

  return (
    <DashboardLayout title="Paiements" subtitle="Portefeuille, retraits et méthodes de paiement">
      <div className="grid lg:grid-cols-3 gap-5 mb-6">
        <div className="lg:col-span-2 bg-gradient-primary text-white rounded-2xl p-7">
          <div className="flex items-center gap-3 mb-4 opacity-90"><Wallet size={20} /><span className="text-sm font-semibold">Solde disponible</span></div>
          <p className="text-5xl font-extrabold">{balance.toLocaleString()} <span className="text-2xl opacity-80">FCFA</span></p>
          <div className="flex flex-wrap gap-3 mt-6">
            <button onClick={() => setOpenWithdraw(true)} className="px-5 py-2.5 rounded-full bg-white text-primary font-semibold flex items-center gap-2 text-sm"><ArrowDownToLine size={16} /> Retirer</button>
            <button onClick={() => setOpenHistory(true)} className="px-5 py-2.5 rounded-full bg-white/20 text-white font-semibold flex items-center gap-2 text-sm border border-white/30"><History size={16} /> Historique retraits</button>
          </div>
        </div>
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-2xl p-5">
            <p className="text-sm text-muted-foreground">Total retiré</p>
            <p className="text-2xl font-extrabold mt-1 text-red-400">{withdrawals.reduce((a, w) => a + w.amount, 0).toLocaleString()} FCFA</p>
          </div>
          <div className="bg-card border border-border rounded-2xl p-5">
            <p className="text-sm text-muted-foreground">Retraits totaux</p>
            <p className="text-2xl font-extrabold mt-1">{withdrawals.length}</p>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-card border border-border rounded-2xl p-6">
          <h3 className="font-bold mb-4">Transactions récentes</h3>
          <div className="divide-y divide-border">
            {[...withdrawals.map(w => ({ id: w.id, type: "debit" as const, desc: `Retrait vers ${w.methodLabel}`, amount: w.amount, date: w.date })), ...txs].slice(0, 8).map((t) => (
              <div key={t.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="font-semibold text-sm">{t.desc}</p>
                  <p className="text-xs text-muted-foreground">{t.date}</p>
                </div>
                <p className={`font-extrabold ${t.type === "credit" ? "text-emerald-400" : "text-red-400"}`}>{t.type === "credit" ? "+" : "-"}{t.amount.toLocaleString()} FCFA</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold">Méthodes de paiement</h3>
          </div>
          <div className="space-y-3">
            {methods.map((m) => (
              <div key={m.id} className="border border-border rounded-xl p-4 flex items-center gap-3">
                {m.type === "mobile" ? <Smartphone className="text-primary" /> : <CreditCard className="text-primary" />}
                <div className="flex-1">
                  <p className="font-semibold text-sm">{m.label}</p>
                  <p className="text-xs text-muted-foreground">{m.type === "mobile" ? m.details.holder : `Exp. ${m.details.expiry}`}</p>
                </div>
                <button onClick={() => delMethod(m.id)} className="w-8 h-8 grid place-items-center rounded-lg bg-destructive/10 text-destructive"><Trash2 size={14} /></button>
              </div>
            ))}
            <button onClick={() => setOpenMethod("mobile")} className="w-full py-2.5 rounded-xl border border-dashed border-border text-sm flex items-center justify-center gap-2 hover:border-primary"><Plus size={14} /> Mobile Money</button>
            <button onClick={() => setOpenMethod("card")} className="w-full py-2.5 rounded-xl border border-dashed border-border text-sm flex items-center justify-center gap-2 hover:border-primary"><Plus size={14} /> Carte bancaire</button>
          </div>
        </div>
      </div>

      {openWithdraw && (
        <Modal title="Retirer des fonds" onClose={() => setOpenWithdraw(false)}>
          <div className="bg-secondary rounded-xl p-3 text-sm flex justify-between"><span className="text-muted-foreground">Solde</span><span className="font-bold">{balance.toLocaleString()} FCFA</span></div>
          <F label="Montant (FCFA)"><input type="number" value={wAmount} onChange={(e) => setWAmount(e.target.value)} className={inp} /></F>
          <F label="Méthode de réception">
            <select value={wMethod} onChange={(e) => setWMethod(e.target.value)} className={inp}>
              <option value="">Choisir...</option>
              {methods.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </F>
          {methods.length === 0 && <p className="text-xs text-amber-400">Ajoutez d'abord une méthode de paiement.</p>}
          <button onClick={submitWithdraw} className="w-full py-3 rounded-full bg-gradient-primary text-white font-semibold">Confirmer le retrait</button>
        </Modal>
      )}

      {openMethod && (
        <Modal title={openMethod === "mobile" ? "Ajouter Mobile Money" : "Ajouter une carte"} onClose={() => setOpenMethod(null)}>
          {openMethod === "mobile" ? (
            <>
              <F label="Opérateur"><select value={mForm.operator} onChange={(e) => setMForm({ ...mForm, operator: e.target.value })} className={inp}><option>MTN</option><option>Orange</option><option>Express Union</option></select></F>
              <F label="Numéro *"><input value={mForm.phone} onChange={(e) => setMForm({ ...mForm, phone: e.target.value })} placeholder="+237 6XX XX XX XX" className={inp} /></F>
              <F label="Nom du bénéficiaire *"><input value={mForm.holder} onChange={(e) => setMForm({ ...mForm, holder: e.target.value })} className={inp} /></F>
            </>
          ) : (
            <>
              <F label="Nom sur la carte *"><input value={mForm.holder} onChange={(e) => setMForm({ ...mForm, holder: e.target.value })} className={inp} /></F>
              <F label="Numéro de carte *"><input value={mForm.number} onChange={(e) => setMForm({ ...mForm, number: e.target.value.replace(/\D/g, "") })} placeholder="1234 5678 9012 3456" maxLength={16} className={inp} /></F>
              <div className="grid grid-cols-2 gap-3">
                <F label="Expiration *"><input value={mForm.expiry} onChange={(e) => setMForm({ ...mForm, expiry: e.target.value })} placeholder="MM/AA" className={inp} /></F>
                <F label="CVC *"><input value={mForm.cvc} onChange={(e) => setMForm({ ...mForm, cvc: e.target.value })} placeholder="123" maxLength={4} className={inp} /></F>
              </div>
            </>
          )}
          <button onClick={addMethod} className="w-full py-3 rounded-full bg-gradient-primary text-white font-semibold">Ajouter</button>
        </Modal>
      )}

      {openHistory && (
        <Modal title="Historique des retraits" onClose={() => setOpenHistory(false)}>
          {withdrawals.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">Aucun retrait pour l'instant.</p> : (
            <div className="divide-y divide-border max-h-96 overflow-y-auto">
              {withdrawals.map((w) => (
                <div key={w.id} className="py-3 flex justify-between items-center">
                  <div>
                    <p className="font-semibold text-sm">{w.methodLabel}</p>
                    <p className="text-xs text-muted-foreground">{w.date}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-extrabold text-red-400">-{w.amount.toLocaleString()} FCFA</p>
                    <span className="text-xs text-emerald-400">Complété</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
    </DashboardLayout>
  );
}
const inp = "w-full bg-background border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary";
function F({ label, children }: { label: string; children: React.ReactNode }) { return <div><label className="block text-sm mb-2 font-medium">{label}</label>{children}</div>; }
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/60 grid place-items-center z-50 p-4 overflow-y-auto" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-card border border-border rounded-2xl p-6 w-full max-w-md space-y-4 my-8">
        <div className="flex items-center justify-between"><h3 className="text-xl font-bold">{title}</h3><button onClick={onClose} className="w-8 h-8 grid place-items-center rounded-lg hover:bg-secondary"><X size={16} /></button></div>
        {children}
      </div>
    </div>
  );
}
