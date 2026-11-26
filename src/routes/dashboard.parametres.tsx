import { askConfirm } from "@/lib/dialog";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { DashboardLayout } from "@/components/seller/dashboard/DashboardLayout";
import { User, Bell, Lock, SlidersHorizontal, CreditCard, HelpCircle, Loader2, Camera, LogOut, ShieldCheck, Send, Star } from "lucide-react";
import { toast } from "sonner";
import { PasswordInput } from "@/components/ui/password-input";
import { supabase } from "@/integrations/supabase/client";
import { compressImage, MAX_IMAGE_BYTES, tooHeavyMessage } from "@/lib/imageCompress";
import { soundEnabled, setSoundEnabled } from "@/lib/sound";
import { money } from "@/lib/sellerStats";
import { PhoneInput } from "@/components/seller/PhoneInput";
import { cmDigits, cmPhoneError, formatCm, toE164 } from "@/lib/phone";
import { TableScroll } from "@/components/seller/ui/SpecTable";
import { preferredLang, setSellerLang, type SellerLang } from "@/lib/sellerLang";
import { Select } from "@/components/ui/app-select";

export const Route = createFileRoute("/dashboard/parametres")({
  head: () => ({ meta: [{ title: "Paramètres — Amachia Seller" }, { name: "description", content: "Paramètres de votre compte vendeur Amachia." }, { property: "og:title", content: "Paramètres — Amachia Seller" }, { name: "twitter:card", content: "summary" }] }),
  component: ParametresPage,
});

/**
 * Paramètres du compte vendeur. Tout est enregistré dans le profil privé du vendeur
 * (table seller_profiles, lisible uniquement par lui) : rien n'apparaît sur le site client.
 */

const TABS = [
  { id: "profil", label: "Profil", icon: User },
  { id: "notifs", label: "Notifications", icon: Bell },
  { id: "securite", label: "Sécurité", icon: Lock },
  { id: "preferences", label: "Préférences", icon: SlidersHorizontal },
  { id: "facturation", label: "Paiements & facturation", icon: CreditCard },
  { id: "avis", label: "Mon avis sur Amachia", icon: Star },
  { id: "aide", label: "Aide", icon: HelpCircle },
] as const;

const NOTIFS: { key: string; label: string; desc: string }[] = [
  { key: "order", label: "Nouvelles commandes", desc: "Quand un client commande un de vos produits" },
  { key: "cancel", label: "Commandes annulées", desc: "Quand une commande est annulée" },
  { key: "return", label: "Demandes de retour", desc: "Quand un client demande un retour" },
  { key: "review", label: "Nouveaux avis", desc: "Quand un client note un de vos produits" },
  { key: "report", label: "Signalements", desc: "Quand un produit est signalé par un client" },
  { key: "stock", label: "Stock faible", desc: "Quand il reste 3 articles ou moins" },
  { key: "payout", label: "Paiements et retraits", desc: "Suivi de vos demandes de retrait" },
  { key: "follower", label: "Nouveaux abonnés", desc: "Quand un client suit votre boutique" },
  { key: "published", label: "Produits publiés", desc: "Confirmation de mise en ligne" },
];

const PERIODS = [{ v: 1, l: "Jour" }, { v: 7, l: "Semaine" }, { v: 30, l: "Mois" }, { v: 365, l: "Année" }];
const PAYMENT_METHODS = ["Orange Money", "MTN Mobile Money", "Virement bancaire"];

type Profile = {
  first_name: string; last_name: string; phone: string; avatar_url: string | null; niu: string;
  payment_method: string; notif_prefs: Record<string, boolean>; dashboard_period: number; language?: string | null;
};

const inputCls = "w-full bg-background border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary";
const btn = "inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-gradient-primary text-black font-semibold disabled:opacity-50";
const db = supabase as any;

function ParametresPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("profil");
  const [uid, setUid] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [p, setP] = useState<Profile | null>(null);

  useEffect(() => {
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUid(user.id);
      setEmail(user.email ?? "");
      const { data } = await db.from("seller_profiles").select("first_name, last_name, phone, avatar_url, niu, payment_method, notif_prefs, dashboard_period, language").eq("id", user.id).maybeSingle();
      setP({
        first_name: data?.first_name ?? "", last_name: data?.last_name ?? "", phone: data?.phone ?? "", avatar_url: data?.avatar_url ?? null,
        niu: data?.niu ?? "", payment_method: data?.payment_method ?? "", notif_prefs: data?.notif_prefs ?? {}, dashboard_period: data?.dashboard_period ?? 1,
      });
    })();
  }, []);

  /** Enregistre des champs du profil privé. */
  async function save(patch: Partial<Profile>, ok = "Enregistré") {
    if (!uid) return false;
    const { error } = await db.from("seller_profiles").update(patch).eq("id", uid);
    if (error) { toast.error("Enregistrement impossible. Réessayez."); return false; }
    setP((prev) => (prev ? { ...prev, ...patch } : prev));
    toast.success(ok);
    return true;
  }

  return (
    <DashboardLayout title="Paramètres" subtitle="Votre compte, vos préférences et votre sécurité">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-4">
        <aside className="h-fit min-w-0 rounded-2xl border border-border bg-card p-2 lg:space-y-1 lg:p-3">
          <div className="flex gap-1 overflow-x-auto [scrollbar-width:none] lg:block lg:space-y-1">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm transition lg:w-full lg:gap-3 ${tab === t.id ? "bg-primary/15 text-primary font-semibold" : "text-muted-foreground hover:bg-secondary"}`}>
              <t.icon size={16} /> {t.label}
            </button>
          ))}
          </div>
          <p className="hidden px-3 pt-3 text-[11px] text-muted-foreground lg:block">Ces informations sont privées : elles ne sont jamais affichées sur le site client.</p>
        </aside>

        <div className="min-w-0 rounded-2xl border border-border bg-card p-4 sm:p-6 lg:col-span-3">
          {!p ? (
            <div className="grid h-40 place-items-center"><Loader2 className="animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              {tab === "profil" && uid && <ProfileTab uid={uid} email={email} p={p} save={save} setP={setP} />}
              {tab === "notifs" && <NotifsTab p={p} save={save} />}
              {tab === "securite" && <SecurityTab email={email} />}
              {tab === "preferences" && <PrefsTab p={p} save={save} />}
              {tab === "facturation" && uid && <BillingTab uid={uid} p={p} save={save} />}
              {tab === "avis" && uid && <PlatformReviewTab uid={uid} />}
              {tab === "aide" && <HelpTab />}
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

type SaveFn = (patch: Partial<Profile>, ok?: string) => Promise<boolean>;

function ProfileTab({ uid, email, p, save, setP }: { uid: string; email: string; p: Profile; save: SaveFn; setP: React.Dispatch<React.SetStateAction<Profile | null>> }) {
  const [f, setF] = useState({ first_name: p.first_name, last_name: p.last_name, phone: cmDigits(p.phone) });
  const [newEmail, setNewEmail] = useState(email);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (f.first_name.trim().length < 2) return toast.error("Indiquez votre prénom");
    if (f.phone && !/^\+?[\d\s]{8,16}$/.test(f.phone.trim())) return toast.error("Numéro de téléphone invalide");
    setBusy(true);
    if (f.phone) { const pe = cmPhoneError(cmDigits(f.phone)); if (pe) { toast.error(pe); return; } }
    const ok = await save({ first_name: f.first_name.trim(), last_name: f.last_name.trim(), phone: f.phone ? formatCm(cmDigits(f.phone)) : "" }, "Profil mis à jour");
    if (ok) window.dispatchEvent(new CustomEvent("amashia-profile", { detail: { name: f.first_name.trim() } }));
    if (newEmail.trim() && newEmail.trim().toLowerCase() !== email.toLowerCase()) {
      const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
      if (error) toast.error("Changement d'e-mail impossible : " + error.message);
      else toast.success("Un lien de confirmation a été envoyé à la nouvelle adresse e-mail.");
    }
    setBusy(false);
  }

  async function uploadAvatar(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Choisissez une image");
    if (file.size > MAX_IMAGE_BYTES) return toast.error(tooHeavyMessage());
    setUploading(true);
    try {
      const small = await compressImage(file, 400);
      const path = `${uid}/avatar-${Date.now()}.${small.name.split(".").pop() || "jpg"}`;
      const { error } = await supabase.storage.from("product-images").upload(path, small, { contentType: small.type, cacheControl: "31536000" });
      if (error) throw error;
      const url = supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
      if (await save({ avatar_url: url }, "Photo de profil mise à jour")) {
        setP((prev) => (prev ? { ...prev, avatar_url: url } : prev));
        window.dispatchEvent(new CustomEvent("amashia-profile", { detail: { avatar: url } }));
      }
    } catch {
      toast.error("Envoi de la photo impossible");
    } finally {
      setUploading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <h3 className="font-bold text-lg">Informations du profil</h3>
      <div className="flex items-center gap-5">
        {p.avatar_url
          ? <img src={p.avatar_url} alt="" className="h-20 w-20 rounded-2xl object-cover" />
          : <div className="w-20 h-20 rounded-2xl bg-gradient-primary grid place-items-center text-black text-2xl font-extrabold">{(f.first_name || "V")[0]?.toUpperCase()}</div>}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary text-sm disabled:opacity-50">
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />} Changer la photo
          </button>
          {p.avatar_url && <button type="button" onClick={async () => { if (await save({ avatar_url: null }, "Photo retirée")) window.dispatchEvent(new CustomEvent("amashia-profile", { detail: { avatar: null } })); }} className="px-4 py-2 rounded-full text-sm text-muted-foreground hover:text-foreground">Retirer</button>}
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { void uploadAvatar(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <label className="block"><span className="block text-sm mb-2">Prénom *</span><input className={inputCls} value={f.first_name} onChange={(e) => setF({ ...f, first_name: e.target.value })} maxLength={60} /></label>
        <label className="block"><span className="block text-sm mb-2">Nom</span><input className={inputCls} value={f.last_name} onChange={(e) => setF({ ...f, last_name: e.target.value })} maxLength={60} /></label>
        <label className="block"><span className="block text-sm mb-2">E-mail de connexion</span><input type="email" className={inputCls} value={newEmail} onChange={(e) => setNewEmail(e.target.value)} /></label>
        <label className="block"><span className="block text-sm mb-2">Téléphone</span><PhoneInput className={inputCls} value={f.phone} onChange={(v) => setF({ ...f, phone: v })} /></label>
      </div>
      <p className="text-xs text-muted-foreground">Le nom, le logo et la description visibles par les clients se règlent dans <Link to="/dashboard/boutique" className="text-primary hover:underline">Ma Boutique</Link>.</p>
      <button type="submit" disabled={busy} className={btn}>{busy && <Loader2 size={15} className="animate-spin" />} Enregistrer</button>
    </form>
  );
}

function NotifsTab({ p, save }: { p: Profile; save: SaveFn }) {
  const prefs = p.notif_prefs;
  const on = (k: string) => prefs[k] !== false;
  return (
    <div className="space-y-2">
      <h3 className="font-bold text-lg">Notifications</h3>
      <p className="mb-2 text-sm text-muted-foreground">Choisissez les alertes qui apparaissent dans votre cloche et votre page Notifications. Une alerte désactivée n'est plus créée.</p>
      {NOTIFS.map((n) => (
        <div key={n.key} className="flex justify-between items-center gap-4 py-3 border-b border-border last:border-0">
          <div><p className="font-semibold text-sm">{n.label}</p><p className="text-xs text-muted-foreground">{n.desc}</p></div>
          <Toggle on={on(n.key)} onChange={(v) => void save({ notif_prefs: { ...prefs, [n.key]: v } }, v ? `« ${n.label} » activé` : `« ${n.label} » désactivé`)} />
        </div>
      ))}
    </div>
  );
}

function SecurityTab({ email }: { email: string }) {
  const [f, setF] = useState({ current: "", next: "", confirm: "" });
  const [busy, setBusy] = useState(false);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (f.next.length < 8) return toast.error("Le nouveau mot de passe doit contenir au moins 8 caractères");
    if (f.next !== f.confirm) return toast.error("Les deux mots de passe ne correspondent pas");
    setBusy(true);
    // vérifie le mot de passe actuel avant d'accepter le changement
    const { error: authErr } = await supabase.auth.signInWithPassword({ email, password: f.current });
    if (authErr) { setBusy(false); return toast.error("Mot de passe actuel incorrect"); }
    const { error } = await supabase.auth.updateUser({ password: f.next });
    setBusy(false);
    if (error) return toast.error("Modification impossible : " + error.message);
    setF({ current: "", next: "", confirm: "" });
    toast.success("Mot de passe modifié");
  }

  async function signOutOthers() {
    const { error } = await supabase.auth.signOut({ scope: "others" });
    if (error) toast.error("Action impossible pour le moment");
    else toast.success("Vos autres appareils ont été déconnectés");
  }

  return (
    <div className="space-y-6">
      <form onSubmit={changePassword} className="space-y-4">
        <h3 className="font-bold text-lg">Changer le mot de passe</h3>
        <label className="block"><span className="block text-sm mb-2">Mot de passe actuel</span><PasswordInput className={inputCls} value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} autoComplete="current-password" /></label>
        <div className="grid md:grid-cols-2 gap-4">
          <label className="block"><span className="block text-sm mb-2">Nouveau mot de passe</span><PasswordInput className={inputCls} value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} autoComplete="new-password" /></label>
          <label className="block"><span className="block text-sm mb-2">Confirmer</span><PasswordInput className={inputCls} value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} autoComplete="new-password" /></label>
        </div>
        <button type="submit" disabled={busy || !f.current || !f.next} className={btn}>{busy && <Loader2 size={15} className="animate-spin" />} Modifier le mot de passe</button>
      </form>
      <div className="border-t border-border pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-3"><ShieldCheck className="mt-0.5 shrink-0 text-primary" size={18} /><div><p className="font-semibold text-sm">Déconnecter mes autres appareils</p><p className="text-xs text-muted-foreground">Utile si vous vous êtes connecté sur un téléphone ou un ordinateur qui n'est pas le vôtre.</p></div></div>
          <button onClick={() => void signOutOthers()} className="inline-flex items-center gap-2 rounded-full bg-secondary px-4 py-2 text-sm font-semibold"><LogOut size={14} /> Déconnecter</button>
        </div>
      </div>
    </div>
  );
}

function PrefsTab({ p, save }: { p: Profile; save: SaveFn }) {
  const [sound, setSound] = useState(soundEnabled());
  const [lang, setLang] = useState<SellerLang>(() => preferredLang());
  return (
    <div className="space-y-6">
      <h3 className="font-bold text-lg">Préférences</h3>
      <div>
        <p className="mb-2 text-sm font-semibold">Période affichée par défaut sur l'Aperçu</p>
        <div className="flex flex-wrap gap-2">
          {PERIODS.map((x) => (
            <button key={x.v} onClick={() => void save({ dashboard_period: x.v }, `Aperçu : ${x.l} par défaut`)} className={`rounded-full px-4 py-2 text-sm ${p.dashboard_period === x.v ? "bg-primary font-semibold text-black" : "bg-secondary text-muted-foreground"}`}>{x.l}</button>
          ))}
        </div>
      </div>
      <div className="border-t border-border pt-5">
        <p className="mb-1 text-sm font-semibold">Langue du site</p>
        <p className="mb-3 text-xs text-muted-foreground">En anglais, toutes les pages de votre espace sont traduites automatiquement.</p>
        <div className="grid max-w-sm grid-cols-2 gap-2">
          {([["fr", "🇫🇷 Français"], ["en", "🇬🇧 English"]] as const).map(([v, l]) => (
            <button key={v} translate="no" onClick={() => { setLang(v); setSellerLang(v); void save({ language: v }, v === "en" ? "Language: English" : "Langue : français"); }} className={`rounded-xl border py-2.5 text-sm font-semibold ${lang === v ? "border-primary bg-primary/15 text-primary" : "border-border hover:border-primary/50"}`}>{l}</button>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between gap-4 border-t border-border pt-5">
        <div><p className="font-semibold text-sm">Effets sonores</p><p className="text-xs text-muted-foreground">Sons lors des nouvelles commandes, publications et alertes (sur cet appareil)</p></div>
        <Toggle on={sound} onChange={(v) => { setSoundEnabled(v); setSound(v); toast.success(v ? "Sons activés" : "Sons coupés"); }} />
      </div>
      <div className="border-t border-border pt-5 text-sm text-muted-foreground">Devise : <b className="text-foreground">FCFA (XAF)</b> · Fuseau horaire : <b className="text-foreground">Afrique centrale (GMT+1)</b></div>
    </div>
  );
}

function BillingTab({ uid, p, save }: { uid: string; p: Profile; save: SaveFn }) {
  const [f, setF] = useState({ payment_method: p.payment_method || PAYMENT_METHODS[0], niu: p.niu ?? "" });
  const [withdrawals, setWithdrawals] = useState<{ id: string; amount: number; method: unknown; status: string; created_at: string }[] | null>(null);
  useEffect(() => {
    void db.from("seller_withdrawals").select("id, amount, method, status, created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(20)
      .then(({ data }: { data: any[] | null }) => setWithdrawals(data ?? []));
  }, [uid]);
  const STATUS: Record<string, string> = { pending: "En cours", paid: "Payé", rejected: "Refusé", cancelled: "Annulé" };
  const STATUS_CLS: Record<string, string> = { pending: "bg-amber-500/15 text-amber-400", paid: "bg-emerald-500/15 text-emerald-400", rejected: "bg-red-500/15 text-red-400", cancelled: "bg-secondary text-muted-foreground" };
  return (
    <div className="space-y-6">
      <form onSubmit={(e) => { e.preventDefault(); void save({ payment_method: f.payment_method, niu: (f.niu ?? "").trim() }, "Informations de paiement enregistrées"); }} className="space-y-4">
        <h3 className="font-bold text-lg">Paiements & facturation</h3>
        <div className="grid md:grid-cols-2 gap-4">
          <label className="block"><span className="block text-sm mb-2">Moyen de paiement préféré pour vos retraits</span>
            <Select className={inputCls} value={f.payment_method} onChange={(e) => setF({ ...f, payment_method: e.target.value })}>{PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}</Select>
          </label>
          <label className="block"><span className="block text-sm mb-2">NIU (numéro d'identifiant unique)</span><input className={inputCls} value={f.niu} onChange={(e) => setF({ ...f, niu: e.target.value })} maxLength={30} placeholder="Facultatif" /></label>
        </div>
        <button type="submit" className={btn}>Enregistrer</button>
      </form>
      <div className="border-t border-border pt-5">
        <div className="mb-3 flex items-center justify-between"><p className="font-semibold">Historique des retraits</p><Link to="/dashboard/paiements" className="text-xs text-primary hover:underline">Demander un retrait</Link></div>
        {withdrawals === null ? <div className="h-16 animate-pulse rounded-xl bg-secondary/40" /> : withdrawals.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun retrait pour le moment.</p>
        ) : (
          <TableScroll minWidth={440} className="max-h-[420px] overflow-y-auto">
            <table className="amx-table text-sm">
              <thead><tr><th>Date</th><th>Vers</th><th className="text-right">Montant</th><th className="text-right">Statut</th></tr></thead>
              <tbody>
                {withdrawals.map((w) => (
                  <tr key={w.id}>
                    <td className="whitespace-nowrap text-muted-foreground">{new Date(w.created_at).toLocaleDateString("fr-FR")}</td>
                    <td className="max-w-[180px] truncate">{methodLabel(w.method)}</td>
                    <td className="whitespace-nowrap text-right font-semibold tabular-nums">{money(Number(w.amount))}</td>
                    <td className="text-right"><span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_CLS[w.status] ?? "bg-secondary"}`}>{STATUS[w.status] ?? w.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </div>
    </div>
  );
}

function HelpTab() {
  const [f, setF] = useState({ subject: "", message: "" });
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState<{ id: string; subject: string; status: string; created_at: string }[]>([]);
  const load = () => void db.from("seller_support_requests").select("id, subject, status, created_at").order("created_at", { ascending: false }).limit(10).then(({ data }: { data: any[] | null }) => setList(data ?? []));
  useEffect(load, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (f.subject.trim().length < 3) return toast.error("Indiquez le sujet");
    if (f.message.trim().length < 10) return toast.error("Décrivez votre demande (10 caractères minimum)");
    setBusy(true);
    const { error } = await db.from("seller_support_requests").insert({ subject: f.subject.trim(), message: f.message.trim() });
    setBusy(false);
    if (error) return toast.error("Envoi impossible. Réessayez.");
    setF({ subject: "", message: "" });
    toast.success("Demande envoyée à l'équipe Amachia");
    load();
  }
  const STATUS: Record<string, string> = { open: "Envoyée", answered: "Répondue", closed: "Clôturée" };
  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="space-y-4">
        <h3 className="font-bold text-lg">Contacter l'équipe Amachia</h3>
        <label className="block"><span className="block text-sm mb-2">Sujet</span><input className={inputCls} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} maxLength={150} placeholder="Ex. : question sur un retrait" /></label>
        <label className="block"><span className="block text-sm mb-2">Message</span><textarea className={inputCls} rows={5} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} maxLength={4000} /></label>
        <button type="submit" disabled={busy} className={btn}>{busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Envoyer</button>
      </form>
      {list.length > 0 && (
        <div className="border-t border-border pt-5">
          <p className="mb-3 font-semibold">Mes demandes</p>
          <TableScroll minWidth={360} className="max-h-[360px] overflow-y-auto">
            <table className="amx-table text-sm">
              <thead><tr><th>Sujet</th><th>Date</th><th className="text-right">Statut</th></tr></thead>
              <tbody>{list.map((r) => (
                <tr key={r.id}>
                  <td className="max-w-[220px] truncate font-medium">{r.subject}</td>
                  <td className="whitespace-nowrap text-muted-foreground">{new Date(r.created_at).toLocaleDateString("fr-FR")}</td>
                  <td className="text-right"><span className="whitespace-nowrap rounded-full bg-secondary px-2.5 py-1 text-[11px]">{STATUS[r.status] ?? r.status}</span></td>
                </tr>
              ))}</tbody>
            </table>
          </TableScroll>
        </div>
      )}
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className={`w-12 h-7 shrink-0 rounded-full transition relative ${on ? "bg-primary" : "bg-secondary"}`}>
      <span className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${on ? "left-6" : "left-1"}`} />
    </button>
  );
}

/** Le moyen de retrait est enregistré comme un objet (type, numéro…) : on l'affiche en texte. */
function methodLabel(m: unknown): string {
  if (!m) return "—";
  if (typeof m === "string") return m;
  const o = m as { kind?: string; label?: string; account_number?: string; bank_name?: string };
  const kinds: Record<string, string> = { orange_money: "Orange Money", mtn_momo: "MTN MoMo", bank: "Virement bancaire" };
  const num = o.account_number ? ` · •••• ${String(o.account_number).slice(-4)}` : "";
  return `${o.label || kinds[o.kind ?? ""] || o.bank_name || "Compte"}${num}`;
}

/** Avis du vendeur sur Amachia : affiché (prénom + initiale, ville, catégorie, photo de boutique) sur la page d'accueil vendeur. */
function PlatformReviewTab({ uid }: { uid: string }) {
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [existing, setExisting] = useState<{ is_published: boolean; updated_at: string } | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void db.from("seller_platform_reviews").select("rating, body, is_published, updated_at").eq("seller_id", uid).maybeSingle()
      .then(({ data }: { data: { rating: number; body: string; is_published: boolean; updated_at: string } | null }) => {
        if (data) { setRating(data.rating); setBody(data.body); }
        setExisting(data ?? null);
      });
  }, [uid]);
  const len = body.trim().length;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!rating) return toast.error("Choisissez une note de 1 à 5 étoiles");
    if (len < 15) return toast.error("Votre avis doit faire au moins 15 caractères");
    setBusy(true);
    const { data, error } = await db.from("seller_platform_reviews").upsert({ seller_id: uid, rating, body: body.trim() }, { onConflict: "seller_id" }).select("is_published, updated_at").maybeSingle();
    setBusy(false);
    if (error) return toast.error("Enregistrement impossible. Réessayez.");
    setExisting(data);
    toast.success(existing ? "Votre avis a été mis à jour" : "Merci ! Votre avis est publié sur la page d'accueil Amachia Seller");
  }
  async function remove() {
    if (!(await askConfirm({ title: "Retirer votre avis ?", message: "Il ne sera plus affiché sur la page d'accueil.", danger: true }))) return;
    const { error } = await db.from("seller_platform_reviews").delete().eq("seller_id", uid);
    if (error) return toast.error("Suppression impossible.");
    setExisting(null); setRating(0); setBody("");
    toast.success("Avis retiré");
  }
  if (existing === undefined) return <div className="h-40 animate-pulse rounded-xl bg-secondary/40" />;
  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <h3 className="text-lg font-bold">Mon avis sur Amachia</h3>
        <p className="mt-1 text-sm text-muted-foreground">Racontez en quelques mots votre expérience de vendeur. Votre avis apparaît sur la page d'accueil Amachia Seller avec votre prénom et l'initiale de votre nom, votre ville, votre catégorie et la photo de votre boutique. Ni votre téléphone ni votre e-mail ne sont affichés.</p>
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold">Votre note</p>
        <div className="flex gap-1.5" role="radiogroup" aria-label="Note sur 5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={rating === n} onClick={() => setRating(n)} className={`grid h-11 w-11 place-items-center rounded-xl border text-xl transition ${n <= rating ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}>★</button>
          ))}
        </div>
      </div>
      <label className="block">
        <span className="mb-2 block text-sm font-semibold">Votre avis</span>
        <textarea value={body} onChange={(e) => setBody(e.target.value.slice(0, 240))} rows={4} placeholder="Ex. : Je publie mes produits le soir, je prépare les colis le matin, Amachia s'occupe de la livraison et du paiement." className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:border-primary focus:outline-none" />
        <span className={`mt-1 block text-right text-[11px] ${len < 15 ? "text-muted-foreground" : "text-emerald-400"}`}>{len}/240 · 15 caractères minimum</span>
      </label>
      {existing && <p className="text-xs text-muted-foreground">{existing.is_published ? "✓ Publié sur la page d'accueil" : "En attente de validation par Amachia"} · mis à jour le {new Date(existing.updated_at).toLocaleDateString("fr-FR")}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className={`${btn} cta-sweep`}>{busy ? "Enregistrement…" : existing ? "Mettre à jour mon avis" : "Publier mon avis"}</button>
        {existing && <button type="button" onClick={() => void remove()} className="rounded-full border border-border px-5 py-3 text-sm font-semibold text-muted-foreground hover:border-red-400 hover:text-red-400">Retirer mon avis</button>}
      </div>
    </form>
  );
}
