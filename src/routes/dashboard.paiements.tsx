import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { DashboardLayout } from "@/components/seller/dashboard/DashboardLayout";
import { Wallet, ArrowDownToLine, Smartphone, Landmark, Plus, X, Trash2, History, Clock, CheckCircle2, XCircle, Star, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { dateTime, money, useSellerStats } from "@/lib/sellerStats";

export const Route = createFileRoute("/dashboard/paiements")({
  head: () => ({ meta: [{ title: "Paiements — Amashia Seller" }, { name: "description", content: "Paiements : votre espace vendeur Amashia pour gérer votre activité." }, { property: "og:title", content: "Paiements — Amashia Seller" }, { property: "og:description", content: "Paiements : votre espace vendeur Amashia pour gérer votre activité." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: PaiementsPage,
});

type Kind = "orange_money" | "mtn_momo" | "bank";
type Method = { id: string; kind: Kind; label: string | null; account_name: string; account_number: string; bank_name: string | null; is_default: boolean; created_at: string };
type Withdrawal = { id: string; amount: number; method: { kind: Kind; label?: string | null; account_number?: string; bank_name?: string | null }; status: "pending" | "paid" | "rejected"; note: string | null; created_at: string; processed_at: string | null };
type Sale = { id: string; order_number: string; product_title: string; amount: number; created_at: string };

const KIND: Record<Kind, { label: string; icon: typeof Smartphone; cls: string }> = {
  orange_money: { label: "Orange Money", icon: Smartphone, cls: "bg-orange-500/15 text-orange-400" },
  mtn_momo: { label: "MTN Mobile Money", icon: Smartphone, cls: "bg-yellow-500/15 text-yellow-400" },
  bank: { label: "Virement bancaire", icon: Landmark, cls: "bg-blue-500/15 text-blue-400" },
};
const WSTATUS = {
  pending: { label: "En cours de traitement", icon: Clock, cls: "text-amber-400" },
  paid: { label: "Payé", icon: CheckCircle2, cls: "text-emerald-400" },
  rejected: { label: "Refusé", icon: XCircle, cls: "text-red-400" },
} as const;

const mask = (n: string) => (n.length > 4 ? `•••• ${n.slice(-4)}` : n);
const db = () => supabase as any;

function PaiementsPage() {
  const { stats, reload: reloadStats } = useSellerStats(30, 60_000);
  const [methods, setMethods] = useState<Method[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [openWithdraw, setOpenWithdraw] = useState(false);
  const [openMethod, setOpenMethod] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    const [m, w, s] = await Promise.all([
      db().from("seller_payout_methods").select("*").order("is_default", { ascending: false }).order("created_at"),
      db().from("seller_withdrawals").select("*").order("created_at", { ascending: false }),
      db().from("seller_orders").select("id,order_number,product_title,amount,created_at").eq("status", "delivered").order("created_at", { ascending: false }).limit(50),
    ]);
    setMethods(m.data || []);
    setWithdrawals(w.data || []);
    setSales(s.data || []);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const balance = stats?.balance ?? 0;
  const pendingOut = withdrawals.filter((w) => w.status === "pending").reduce((s, w) => s + w.amount, 0);
  const paidOut = withdrawals.filter((w) => w.status === "paid").reduce((s, w) => s + w.amount, 0);

  // historique : ventes livrées (crédits) + retraits (débits)
  const txs = [
    ...sales.map((s) => ({ id: `s-${s.id}`, credit: true, desc: `Vente ${s.order_number} · ${s.product_title}`, amount: Number(s.amount), date: s.created_at, status: null as null | Withdrawal["status"] })),
    ...withdrawals.map((w) => ({ id: `w-${w.id}`, credit: false, desc: `Retrait vers ${KIND[w.method.kind]?.label ?? "votre compte"}${w.method.account_number ? ` (${mask(w.method.account_number)})` : ""}`, amount: w.amount, date: w.created_at, status: w.status })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  async function removeMethod(id: string) {
    if (!confirm("Supprimer ce moyen de retrait ?")) return;
    const { error } = await db().from("seller_payout_methods").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Moyen de retrait supprimé");
    void load();
  }
  async function makeDefault(id: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await db().from("seller_payout_methods").update({ is_default: false }).eq("user_id", user.id);
    await db().from("seller_payout_methods").update({ is_default: true }).eq("id", id);
    void load();
  }

  return (
    <DashboardLayout title="Paiements" subtitle="Votre solde, vos moyens de retrait et l'historique de vos gains">
      <div className="mb-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="rounded-2xl bg-gradient-primary p-6 text-white lg:col-span-2">
          <div className="mb-4 flex items-center gap-3 opacity-90"><Wallet size={20} /><span className="text-sm font-semibold">Solde disponible</span></div>
          <p className="text-4xl font-extrabold">{stats ? money(balance) : "…"}</p>
          <p className="mt-1 text-xs opacity-80">Ventes livrées, moins les retraits demandés ou déjà payés.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              onClick={() => (methods.length ? setOpenWithdraw(true) : (toast.info("Ajoutez d'abord un moyen de retrait."), setOpenMethod(true)))}
              disabled={!stats || balance < 1000}
              className="flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-black disabled:opacity-50"
            >
              <ArrowDownToLine size={16} /> Retirer mon argent
            </button>
            {stats && balance < 1000 && <span className="self-center text-xs opacity-80">Retrait possible à partir de 1 000 FCFA</span>}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3">
          <Kpi label="En attente de livraison" value={money(stats?.pending_balance ?? 0)} hint="Ventes pas encore livrées" />
          <Kpi label="Retraits en cours" value={money(pendingOut)} hint="En cours de traitement" />
          <Kpi label="Déjà versé" value={money(paidOut)} hint="Retraits payés" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-6 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-bold">Historique</h3>
            {txs.length > 6 && <button onClick={() => setShowAll(true)} className="flex items-center gap-1 text-xs text-primary"><History size={13} /> Tout voir</button>}
          </div>
          {loading ? <div className="h-32 animate-pulse rounded-xl bg-secondary/40" /> : txs.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Aucun mouvement pour le moment. Vos ventes livrées et vos retraits apparaîtront ici.</p>
          ) : <TxList txs={txs.slice(0, 6)} />}
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-bold">Moyens de retrait</h3>
            <button onClick={() => setOpenMethod(true)} className="grid h-8 w-8 place-items-center rounded-full bg-primary/15 text-primary" aria-label="Ajouter"><Plus size={16} /></button>
          </div>
          {methods.length === 0 ? (
            <button onClick={() => setOpenMethod(true)} className="w-full rounded-xl border border-dashed border-border py-8 text-sm text-muted-foreground hover:border-primary hover:text-primary">
              Ajouter Orange Money, MTN MoMo ou un compte bancaire
            </button>
          ) : (
            <div className="space-y-2">
              {methods.map((m) => {
                const k = KIND[m.kind];
                return (
                  <div key={m.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
                    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${k.cls}`}><k.icon size={18} /></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{m.label || k.label}</p>
                      <p className="truncate text-xs text-muted-foreground">{m.bank_name ? `${m.bank_name} · ` : ""}{mask(m.account_number)} · {m.account_name}</p>
                      {m.is_default ? <span className="text-[10px] font-semibold text-primary">Par défaut</span> : <button onClick={() => void makeDefault(m.id)} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary"><Star size={10} /> Définir par défaut</button>}
                    </div>
                    <button onClick={() => void removeMethod(m.id)} className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-red-500/10 hover:text-red-400" aria-label="Supprimer"><Trash2 size={14} /></button>
                  </div>
                );
              })}
            </div>
          )}
          <p className="mt-4 text-[11px] text-muted-foreground">Les retraits sont traités par l'équipe Amashia sous 48 h ouvrées vers le moyen choisi.</p>
        </div>
      </div>

      {openMethod && <MethodModal onClose={() => setOpenMethod(false)} onSaved={() => { setOpenMethod(false); void load(); }} isFirst={methods.length === 0} />}
      {openWithdraw && (
        <WithdrawModal
          balance={balance}
          methods={methods}
          onClose={() => setOpenWithdraw(false)}
          onDone={() => { setOpenWithdraw(false); void load(); void reloadStats(); }}
        />
      )}
      {showAll && (
        <Modal title="Historique complet" onClose={() => setShowAll(false)}>
          <div className="max-h-[60vh] overflow-y-auto"><TxList txs={txs} /></div>
        </Modal>
      )}
    </DashboardLayout>
  );
}

function TxList({ txs }: { txs: { id: string; credit: boolean; desc: string; amount: number; date: string; status: Withdrawal["status"] | null }[] }) {
  return (
    <div className="divide-y divide-border">
      {txs.map((t) => {
        const st = t.status ? WSTATUS[t.status] : null;
        return (
          <div key={t.id} className="flex items-center gap-3 py-3">
            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${t.credit ? "bg-emerald-500/15 text-emerald-400" : "bg-secondary text-foreground"}`}>
              {t.credit ? <ArrowUpRight size={15} className="rotate-180" /> : <ArrowDownToLine size={15} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-1 text-sm font-medium">{t.desc}</p>
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                {dateTime(t.date)}
                {st && <span className={`flex items-center gap-1 ${st.cls}`}><st.icon size={11} /> {st.label}</span>}
              </p>
            </div>
            <p className={`whitespace-nowrap text-sm font-bold ${t.credit ? "text-emerald-400" : t.status === "rejected" ? "text-muted-foreground line-through" : ""}`}>
              {t.credit ? "+" : "−"}{money(t.amount)}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-extrabold">{value}</p>
      <p className="text-[10px] text-muted-foreground">{hint}</p>
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-black/60 backdrop-blur-sm sm:place-items-center sm:p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-2xl border border-border bg-card p-6 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between"><h3 className="text-lg font-bold">{title}</h3><button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-secondary" aria-label="Fermer"><X size={16} /></button></div>
        {children}
      </div>
    </div>
  );
}

const inp = "w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:border-primary focus:outline-none";

function MethodModal({ onClose, onSaved, isFirst }: { onClose: () => void; onSaved: () => void; isFirst: boolean }) {
  const [kind, setKind] = useState<Kind>("orange_money");
  const [f, setF] = useState({ label: "", account_name: "", account_number: "", bank_name: "" });
  const [busy, setBusy] = useState(false);
  async function save() {
    const number = f.account_number.replace(/\s+/g, "");
    if (!f.account_name.trim()) return toast.error("Indiquez le nom du titulaire.");
    if (kind !== "bank" && !/^(\+?237)?6\d{8}$/.test(number)) return toast.error("Numéro mobile camerounais invalide (ex. 6XXXXXXXX).");
    if (kind === "bank" && (number.length < 10 || !f.bank_name.trim())) return toast.error("Indiquez la banque et le numéro de compte (RIB).");
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await db().from("seller_payout_methods").insert({
      user_id: user?.id, kind, label: f.label.trim() || null, account_name: f.account_name.trim(), account_number: number,
      bank_name: kind === "bank" ? f.bank_name.trim() : null, is_default: isFirst,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Moyen de retrait ajouté");
    onSaved();
  }
  return (
    <Modal title="Ajouter un moyen de retrait" onClose={onClose}>
      <div className="mb-4 grid grid-cols-3 gap-2">
        {(Object.keys(KIND) as Kind[]).map((k) => (
          <button key={k} onClick={() => setKind(k)} className={`rounded-xl border p-3 text-xs font-semibold transition ${kind === k ? "border-primary bg-primary/10 text-primary" : "border-border"}`}>{KIND[k].label}</button>
        ))}
      </div>
      <div className="space-y-3">
        {kind === "bank" && <input className={inp} placeholder="Nom de la banque" value={f.bank_name} onChange={(e) => setF({ ...f, bank_name: e.target.value })} />}
        <input className={inp} placeholder="Nom du titulaire" value={f.account_name} onChange={(e) => setF({ ...f, account_name: e.target.value })} />
        <input className={inp} placeholder={kind === "bank" ? "Numéro de compte / RIB" : "Numéro (6XXXXXXXX)"} inputMode={kind === "bank" ? "text" : "tel"} value={f.account_number} onChange={(e) => setF({ ...f, account_number: e.target.value })} />
        <input className={inp} placeholder="Nom (facultatif, ex. Mon Orange Money)" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} />
      </div>
      <button onClick={save} disabled={busy} className="mt-5 w-full rounded-full bg-gradient-primary py-3 text-sm font-semibold text-white disabled:opacity-60">{busy ? "Enregistrement…" : "Enregistrer"}</button>
    </Modal>
  );
}

function WithdrawModal({ balance, methods, onClose, onDone }: { balance: number; methods: Method[]; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState(String(balance));
  const [method, setMethod] = useState(methods.find((m) => m.is_default)?.id ?? methods[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  async function submit() {
    const a = Math.floor(Number(amount.replace(/\s/g, "")));
    if (!a || a < 1000) return toast.error("Montant minimum : 1 000 FCFA");
    if (a > balance) return toast.error("Solde insuffisant");
    setBusy(true);
    const { error } = await db().rpc("request_withdrawal", { _amount: a, _method: method });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Demande de retrait envoyée");
    onDone();
  }
  return (
    <Modal title="Retirer mon argent" onClose={onClose}>
      <p className="mb-3 text-sm text-muted-foreground">Solde disponible : <b className="text-foreground">{money(balance)}</b></p>
      <label className="mb-1 block text-xs font-semibold">Montant (FCFA)</label>
      <input className={inp} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))} />
      <div className="mt-2 flex gap-2">
        {[0.25, 0.5, 1].map((p) => <button key={p} onClick={() => setAmount(String(Math.floor(balance * p)))} className="rounded-full bg-secondary px-3 py-1 text-xs">{p === 1 ? "Tout" : `${p * 100} %`}</button>)}
      </div>
      <label className="mb-1 mt-4 block text-xs font-semibold">Vers</label>
      <select className={inp} value={method} onChange={(e) => setMethod(e.target.value)}>
        {methods.map((m) => <option key={m.id} value={m.id}>{(m.label || KIND[m.kind].label)} · {mask(m.account_number)}</option>)}
      </select>
      <button onClick={submit} disabled={busy} className="mt-5 w-full rounded-full bg-gradient-primary py-3 text-sm font-semibold text-white disabled:opacity-60">{busy ? "Envoi…" : "Confirmer le retrait"}</button>
      <p className="mt-3 text-[11px] text-muted-foreground">Le montant est réservé immédiatement et versé par l'équipe Amashia sous 48 h ouvrées.</p>
    </Modal>
  );
}
