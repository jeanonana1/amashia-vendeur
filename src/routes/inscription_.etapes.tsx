import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Header } from "@/components/seller/Header";
import { Footer } from "@/components/seller/Footer";
import { SignupShell } from "@/components/seller/signup/SignupShell";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Smartphone, CreditCard, MapPin, ShieldCheck, Mail, Send, Check, FileText, Upload, Camera, X, Loader2 } from "lucide-react";
import { getRegions, getCities, getQuartiers } from "@/lib/locations";
import { PasswordInput } from "@/components/ui/password-input";

type SearchParams = { type?: "particulier" | "entreprise" };

export const Route = createFileRoute("/inscription_/etapes")({
  validateSearch: (s: Record<string, unknown>): SearchParams => ({
    type: s.type === "entreprise" ? "entreprise" : "particulier",
  }),
  head: () => ({
    meta: [{ title: "Création de compte vendeur — Amashia Seller" }, { name: "description", content: "Création de compte vendeur : votre espace vendeur Amashia pour gérer votre activité." }, { property: "og:title", content: "Création de compte vendeur — Amashia Seller" }, { property: "og:description", content: "Création de compte vendeur : votre espace vendeur Amashia pour gérer votre activité." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }],
  }),
  component: Page,
});

const CATEGORIES = [
  "Mode & Vêtements",
  "Électronique",
  "Beauté & Cosmétiques",
  "Alimentation",
  "Maison & Décoration",
  "Services",
  "Bijoux & Accessoires",
  "Sports & Loisirs",
];

interface DocFile { name: string; dataUrl: string; }
interface DocsState {
  // particulier
  cniRecto?: DocFile;
  cniVerso?: DocFile;
  niu?: string;
  // entreprise
  rccm?: DocFile;          // Registre du Commerce
  niuDoc?: DocFile;        // Attestation NIU / contribuable
  patente?: DocFile;       // Patente / licence
  cniGerant?: DocFile;     // CNI du gérant
}

interface FormState {
  firstName: string; lastName: string; email: string; phone: string; password: string; confirm: string;
  categories: string[];
  gender: string; birthDate: string;
  country: string; city: string; language: string;
  paymentMethod: "mobile" | "card" | "";
  // mobile money
  mmOperator: string; mmNumber: string; mmHolder: string;
  // card
  cardNumber: string; cardName: string; cardExpiry: string; cardCvv: string;
  // location
  region: string; shopCity: string; neighborhood: string;
  shareLocation: boolean; latitude: number | null; longitude: number | null;
  acceptTerms: boolean; notifications: boolean;
  docs: DocsState;
}

function Page() {
  const { type } = Route.useSearch();
  const isBusiness = type === "entreprise";
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [data, setData] = useState<FormState>({
    firstName: "", lastName: "", email: "", phone: "", password: "", confirm: "",
    categories: [],
    gender: "", birthDate: "",
    country: "", city: "", language: "fr",
    paymentMethod: "",
    mmOperator: "MTN", mmNumber: "", mmHolder: "",
    cardNumber: "", cardName: "", cardExpiry: "", cardCvv: "",
    region: "", shopCity: "", neighborhood: "",
    shareLocation: false, latitude: null, longitude: null,
    acceptTerms: false, notifications: true,
    docs: {},
  });

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setData((d) => ({ ...d, [k]: v }));
  const next = () => setStep((s) => Math.min(7, s + 1));
  const back = () => (step > 1 ? setStep((s) => s - 1) : navigate({ to: "/inscription" }));

  // Geolocation in real time
  useEffect(() => {
    if (!data.shareLocation) return;
    if (!navigator.geolocation) { toast.error("Géolocalisation non supportée"); return; }
    const id = navigator.geolocation.watchPosition(
      (pos) => setData((d) => ({ ...d, latitude: pos.coords.latitude, longitude: pos.coords.longitude })),
      (err) => { toast.error("Localisation refusée: " + err.message); setData((d) => ({ ...d, shareLocation: false })); },
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [data.shareLocation]);

  const regions = useMemo(() => getRegions(data.country), [data.country]);
  const cities = useMemo(() => getCities(data.country, data.region), [data.country, data.region]);
  const quartiers = useMemo(() => getQuartiers(data.country, data.region, data.shopCity), [data.country, data.region, data.shopCity]);

  async function sendCode() {
    if (!data.acceptTerms) { toast.error("Vous devez accepter les conditions"); return; }
    setLoading(true);
    try {
      const metadata = { account_type: type, first_name: data.firstName, last_name: data.lastName, phone: data.phone, seller_profile: buildProfile() };
      const result = otpSent
        ? await supabase.auth.resend({ type: "signup", email: data.email, options: { emailRedirectTo: `${window.location.origin}/connexion` } })
        : await supabase.auth.signUp({ email: data.email, password: data.password, options: { data: metadata, emailRedirectTo: `${window.location.origin}/connexion` } });
      if (result.error) throw result.error;
      if ("session" in result.data && result.data.session) {
        toast.error("La confirmation email doit être activée sur votre service d’identification.");
        return;
      }
      setOtpSent(true);
      if (!otpSent && "user" in result.data && result.data.user && result.data.user.identities?.length === 0) {
        toast.info("Cet email a déjà un compte Amashia. Cliquez sur « J'ai confirmé mon email » pour continuer avec votre mot de passe.");
        return;
      }
      toast.success("Le lien de confirmation a été envoyé par email.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Envoi impossible.");
    } finally { setLoading(false); }
  }

  function buildProfile() {
    return {
      account_type: type,
      first_name: data.firstName, last_name: data.lastName, phone: data.phone,
      category: data.categories[0] || null,
      categories: data.categories,
      niu: data.docs.niu || null,
      gender: data.gender || null,
      birth_date: data.birthDate || null,
      country: data.country, city: data.city, language: data.language,
      payment_method: data.paymentMethod,
      shop_address: data.latitude && data.longitude ? `${data.latitude},${data.longitude}` : null,
      neighborhood: data.neighborhood,
      region: data.region,
      share_location: data.shareLocation,
    };
  }

  async function verifyCode() {
    setLoading(true);
    const profile = buildProfile();
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: data.email, password: data.password });
      if (signInError) {
        if (/not confirmed/i.test(signInError.message)) {
          throw new Error("Email pas encore confirmé : cliquez d'abord sur le lien reçu par email, puis revenez ici.");
        }
        if (/invalid login credentials/i.test(signInError.message)) {
          throw new Error("Mot de passe incorrect pour ce compte. Revenez à l'étape 1 pour le corriger.");
        }
        throw signInError;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Upload docs
        const docEntries: Array<[string, DocFile | undefined]> = [
          ["cni_recto", data.docs.cniRecto],
          ["cni_verso", data.docs.cniVerso],
          ["rccm", data.docs.rccm],
          ["niu_doc", data.docs.niuDoc],
          ["patente", data.docs.patente],
          ["cni_gerant", data.docs.cniGerant],
        ];
        for (const [docType, file] of docEntries) {
          if (!file) continue;
          const blob = await (await fetch(file.dataUrl)).blob();
          const ext = file.name.split(".").pop() || "jpg";
          const path = `${user.id}/${docType}-${Date.now()}.${ext}`;
          const { error: upErr } = await supabase.storage.from("seller-documents").upload(path, blob, { upsert: true });
          if (!upErr) {
            await supabase.from("seller_documents").insert({ user_id: user.id, doc_type: docType, file_url: path });
          }
        }

        const { error: profileError } = await supabase.from("seller_profiles").upsert({ id: user.id, ...profile } as never);
        if (profileError) throw profileError;
      }
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Création du compte impossible");
      return;
    } finally {
      setLoading(false);
    }
    setStep(7);
    toast.success("Compte créé, ouverture du tableau de bord");
    navigate({ to: "/dashboard", replace: true });
  }

  function toggleCategory(cat: string) {
    setData((d) => {
      if (isBusiness) {
        return { ...d, categories: d.categories.includes(cat) ? d.categories.filter((c) => c !== cat) : [...d.categories, cat] };
      } else {
        return { ...d, categories: d.categories[0] === cat ? [] : [cat] };
      }
    });
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="flex-1 grid place-items-center py-16 px-6">
        <SignupShell step={step} onBack={back}>
          {/* STEP 1 */}
          {step === 1 && (
            <div className="space-y-5 animate-fade-up">
              <h2 className="text-2xl font-extrabold mb-4">Informations de base</h2>
              <div className="grid md:grid-cols-2 gap-4">
                <Field label="Prénom *"><input value={data.firstName} onChange={(e) => set("firstName", e.target.value)} className={inputCls} /></Field>
                <Field label="Nom *"><input value={data.lastName} onChange={(e) => set("lastName", e.target.value)} className={inputCls} /></Field>
              </div>
              <Field label="Adresse email *"><input type="email" value={data.email} onChange={(e) => set("email", e.target.value)} className={inputCls} /></Field>
              <Field label="Numéro de téléphone *"><input value={data.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+237..." className={inputCls} /></Field>
              <Field label="Mot de passe *"><PasswordInput value={data.password} onChange={(e) => set("password", e.target.value)} className={inputCls} /></Field>
              <Field label="Confirmer le mot de passe *"><PasswordInput value={data.confirm} onChange={(e) => set("confirm", e.target.value)} className={inputCls} /></Field>
              <button onClick={() => {
                if (!data.firstName || !data.lastName || !data.email || !data.phone || !data.password) return toast.error("Veuillez remplir tous les champs");
                if (data.password.length < 6) return toast.error("Mot de passe trop court (min 6)");
                if (data.password !== data.confirm) return toast.error("Les mots de passe ne correspondent pas");
                next();
              }} className={ctaCls}>Continuer</button>
            </div>
          )}

          {/* STEP 2 — Détails + Catégories */}
          {step === 2 && (
            <div className="space-y-5 animate-fade-up">
              <h2 className="text-2xl font-extrabold mb-2">Détails personnels</h2>
              <Field label={isBusiness ? "Catégories d'activité * (plusieurs autorisées)" : "Catégorie d'activité * (une seule)"}>
                <div className="grid grid-cols-2 gap-2">
                  {CATEGORIES.map((c) => {
                    const active = data.categories.includes(c);
                    return (
                      <button key={c} type="button" onClick={() => toggleCategory(c)}
                        className={`text-left text-sm px-3 py-2.5 rounded-xl border transition ${active ? "border-primary bg-primary/15 text-foreground" : "border-border bg-background hover:border-primary/50"}`}>
                        {active && "✓ "}{c}
                      </button>
                    );
                  })}
                </div>
              </Field>
              <Field label="Genre (optionnel)">
                <select value={data.gender} onChange={(e) => set("gender", e.target.value)} className={inputCls}>
                  <option value="">Sélectionner</option><option>Homme</option><option>Femme</option><option>Autre</option>
                </select>
              </Field>
              <Field label="Date de naissance"><input type="date" value={data.birthDate} onChange={(e) => set("birthDate", e.target.value)} className={inputCls} /></Field>
              <div className="grid md:grid-cols-2 gap-4">
                <Field label="Pays *">
                  <select value={data.country} onChange={(e) => { set("country", e.target.value); set("region", ""); set("shopCity", ""); set("neighborhood", ""); }} className={inputCls}>
                    <option value="">Sélectionner</option>
                    <option>Cameroun</option><option>Sénégal</option><option>Côte d'Ivoire</option><option>Bénin</option><option>Togo</option>
                  </select>
                </Field>
                <Field label="Ville (résidence) *"><input value={data.city} onChange={(e) => set("city", e.target.value)} className={inputCls} /></Field>
              </div>
              <Field label="Langue préférée">
                <select value={data.language} onChange={(e) => set("language", e.target.value)} className={inputCls}>
                  <option value="fr">Français</option><option value="en">English</option>
                </select>
              </Field>
              <NavBtns back={back} next={() => {
                if (data.categories.length === 0) return toast.error("Sélectionnez au moins une catégorie");
                if (!data.country || !data.city) return toast.error("Pays et ville requis");
                next();
              }} />
            </div>
          )}

          {/* STEP 3 — Documents */}
          {step === 3 && (
            <div className="space-y-5 animate-fade-up">
              <h2 className="text-2xl font-extrabold flex items-center gap-2"><FileText className="text-primary" /> Documents officiels</h2>
              <p className="text-sm text-muted-foreground">{isBusiness ? "Téléversez les documents officiels de votre entreprise." : "Téléversez votre Carte Nationale d'Identité (CNI)."}</p>

              {!isBusiness ? (
                <>
                  <DocUpload label="CNI - Recto *" file={data.docs.cniRecto} onFile={(f) => setData((d) => ({ ...d, docs: { ...d.docs, cniRecto: f } }))} />
                  <DocUpload label="CNI - Verso *" file={data.docs.cniVerso} onFile={(f) => setData((d) => ({ ...d, docs: { ...d.docs, cniVerso: f } }))} />
                  <Field label="Numéro NIU (optionnel)">
                    <input value={data.docs.niu || ""} onChange={(e) => setData((d) => ({ ...d, docs: { ...d.docs, niu: e.target.value } }))} placeholder="Ex: P123456789X" className={inputCls} />
                  </Field>
                </>
              ) : (
                <>
                  <DocUpload label="Registre du Commerce (RCCM) *" file={data.docs.rccm} onFile={(f) => setData((d) => ({ ...d, docs: { ...d.docs, rccm: f } }))} />
                  <DocUpload label="Attestation NIU (Numéro Identifiant Unique) *" file={data.docs.niuDoc} onFile={(f) => setData((d) => ({ ...d, docs: { ...d.docs, niuDoc: f } }))} />
                  <DocUpload label="Patente / Licence d'exploitation" file={data.docs.patente} onFile={(f) => setData((d) => ({ ...d, docs: { ...d.docs, patente: f } }))} />
                  <DocUpload label="CNI du gérant *" file={data.docs.cniGerant} onFile={(f) => setData((d) => ({ ...d, docs: { ...d.docs, cniGerant: f } }))} />
                </>
              )}

              <NavBtns back={back} next={() => {
                if (!isBusiness && (!data.docs.cniRecto || !data.docs.cniVerso)) return toast.error("Le recto et le verso de la CNI sont obligatoires");
                if (isBusiness && (!data.docs.rccm || !data.docs.niuDoc || !data.docs.cniGerant)) return toast.error("RCCM, NIU et CNI du gérant requis");
                next();
              }} />
            </div>
          )}

          {/* STEP 4 — Paiement */}
          {step === 4 && (
            <div className="space-y-5 animate-fade-up">
              <h2 className="text-2xl font-extrabold flex items-center gap-2"><CreditCard className="text-primary" /> Mode de paiement</h2>
              <p className="text-muted-foreground text-sm">Choisissez comment recevoir vos paiements</p>
              <div className="grid md:grid-cols-2 gap-4">
                <PayCard active={data.paymentMethod === "mobile"} onClick={() => set("paymentMethod", "mobile")} icon={<Smartphone className="text-emerald-500" />} title="Mobile Money" subtitle="MTN, Orange, etc." />
                <PayCard active={data.paymentMethod === "card"} onClick={() => set("paymentMethod", "card")} icon={<CreditCard className="text-primary" />} title="Carte bancaire" subtitle="Visa, Mastercard" />
              </div>

              {data.paymentMethod === "mobile" && (
                <div className="space-y-4 bg-background border border-border rounded-2xl p-5 animate-fade-up">
                  <Field label="Opérateur *">
                    <select value={data.mmOperator} onChange={(e) => set("mmOperator", e.target.value)} className={inputCls}>
                      <option>MTN Mobile Money</option><option>Orange Money</option><option>Moov Money</option><option>Wave</option>
                    </select>
                  </Field>
                  <Field label="Numéro Mobile Money *"><input value={data.mmNumber} onChange={(e) => set("mmNumber", e.target.value.replace(/\D/g, ""))} placeholder="6XXXXXXXX" className={inputCls} /></Field>
                  <Field label="Nom du bénéficiaire *"><input value={data.mmHolder} onChange={(e) => set("mmHolder", e.target.value)} placeholder="Nom complet enregistré sur le compte" className={inputCls} /></Field>
                </div>
              )}

              {data.paymentMethod === "card" && (
                <div className="space-y-4 bg-background border border-border rounded-2xl p-5 animate-fade-up">
                  <Field label="Numéro de carte *"><input value={data.cardNumber} onChange={(e) => set("cardNumber", e.target.value.replace(/\D/g, "").slice(0, 19))} placeholder="0000 0000 0000 0000" className={inputCls} /></Field>
                  <Field label="Nom sur la carte *"><input value={data.cardName} onChange={(e) => set("cardName", e.target.value)} className={inputCls} /></Field>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Date d'expiration (MM/AA) *"><input value={data.cardExpiry} onChange={(e) => set("cardExpiry", e.target.value)} placeholder="12/27" className={inputCls} /></Field>
                    <Field label="CVV *"><input value={data.cardCvv} onChange={(e) => set("cardCvv", e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="123" className={inputCls} /></Field>
                  </div>
                </div>
              )}

              {!data.paymentMethod && (
                <div className="border border-primary/40 bg-primary/10 rounded-xl p-4 text-sm">⚠️ Veuillez sélectionner un mode de paiement</div>
              )}

              <NavBtns back={back} next={() => {
                if (!data.paymentMethod) return;
                if (data.paymentMethod === "mobile" && (!data.mmNumber || !data.mmHolder)) return toast.error("Renseignez votre numéro et nom Mobile Money");
                if (data.paymentMethod === "card" && (!data.cardNumber || !data.cardName || !data.cardExpiry || !data.cardCvv)) return toast.error("Renseignez tous les champs de carte");
                next();
              }} disabled={!data.paymentMethod} />
            </div>
          )}

          {/* STEP 5 — Localisation */}
          {step === 5 && (
            <div className="space-y-5 animate-fade-up">
              <h2 className="text-2xl font-extrabold flex items-center gap-2"><MapPin className="text-primary" /> Localisation de la boutique</h2>

              {/* Share location en haut */}
              <div className="bg-background border border-border rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/15 grid place-items-center"><MapPin className="text-primary" size={18} /></div>
                    <div>
                      <p className="font-semibold text-sm">Partager ma localisation en temps réel</p>
                      <p className="text-xs text-muted-foreground">Permet aux clients de vous trouver facilement</p>
                    </div>
                  </div>
                  <button onClick={() => set("shareLocation", !data.shareLocation)} className={`w-12 h-7 rounded-full transition relative ${data.shareLocation ? "bg-primary" : "bg-secondary"}`}>
                    <span className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${data.shareLocation ? "left-6" : "left-1"}`} />
                  </button>
                </div>
                {data.shareLocation && data.latitude && data.longitude && (
                  <div className="text-xs bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-lg p-3 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    Position acquise : {data.latitude.toFixed(5)}, {data.longitude.toFixed(5)}
                  </div>
                )}
                {data.shareLocation && !data.latitude && (
                  <div className="text-xs flex items-center gap-2 text-muted-foreground"><Loader2 className="animate-spin" size={14} /> Acquisition de votre position…</div>
                )}
              </div>

              <Field label="Région *">
                <select value={data.region} onChange={(e) => { set("region", e.target.value); set("shopCity", ""); set("neighborhood", ""); }} className={inputCls} disabled={!data.country}>
                  <option value="">{data.country ? "Sélectionner une région" : "Sélectionnez d'abord un pays (étape 2)"}</option>
                  {regions.map((r) => <option key={r}>{r}</option>)}
                </select>
              </Field>

              <Field label="Ville *">
                <select value={data.shopCity} onChange={(e) => { set("shopCity", e.target.value); set("neighborhood", ""); }} className={inputCls} disabled={!data.region}>
                  <option value="">{data.region ? "Sélectionner une ville" : "Choisissez d'abord une région"}</option>
                  {cities.map((c) => <option key={c}>{c}</option>)}
                </select>
              </Field>

              <Field label="Quartier *">
                <select value={data.neighborhood} onChange={(e) => set("neighborhood", e.target.value)} className={inputCls} disabled={!data.shopCity}>
                  <option value="">{data.shopCity ? "Sélectionner un quartier" : "Choisissez d'abord une ville"}</option>
                  {quartiers.map((q) => <option key={q}>{q}</option>)}
                </select>
              </Field>

              <NavBtns back={back} next={() => {
                if (!data.region || !data.shopCity || !data.neighborhood) return toast.error("Région, ville et quartier requis");
                next();
              }} />
            </div>
          )}

          {/* STEP 6 — OTP */}
          {step === 6 && (
            <div className="space-y-5 animate-fade-up">
              <h2 className="text-2xl font-extrabold flex items-center gap-2"><ShieldCheck className="text-primary" /> Vérification et sécurité</h2>
              <div className="bg-background border border-border rounded-2xl p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/15 grid place-items-center"><Mail className="text-primary" size={18} /></div>
                  <div>
                    <p className="font-bold text-sm">Vérification par email</p>
                    <p className="text-xs text-muted-foreground">Un lien de confirmation sera envoyé à <span className="text-primary font-semibold">{data.email}</span></p>
                  </div>
                </div>
                {!otpSent ? (
                  <button onClick={sendCode} disabled={loading || !data.acceptTerms} className="w-full py-3 rounded-full bg-primary/20 border border-primary/40 text-primary font-semibold hover:bg-primary/30 transition flex items-center justify-center gap-2 disabled:opacity-50">
                    <Send size={16} /> {loading ? "Envoi..." : "Envoyer le lien de confirmation"}
                  </button>
                ) : (
                  <div className="space-y-3 text-sm">
                    <p>📩 Ouvrez l'email reçu à <span className="font-semibold">{data.email}</span> et cliquez sur le lien de confirmation (pensez à vérifier les spams).</p>
                    <p>Revenez ensuite sur cette page et cliquez sur <span className="font-semibold">« J'ai confirmé mon email »</span>.</p>
                    <button onClick={sendCode} disabled={loading} className="text-sm text-primary hover:underline">Renvoyer l'email</button>
                  </div>
                )}
              </div>
              <label className="flex items-start gap-3 text-sm cursor-pointer">
                <input type="checkbox" checked={data.acceptTerms} onChange={(e) => set("acceptTerms", e.target.checked)} className="mt-1 accent-primary" />
                <span>J'accepte les <a className="text-primary">conditions d'utilisation</a> et la <a className="text-primary">politique de confidentialité</a></span>
              </label>
              <label className="flex items-start gap-3 text-sm cursor-pointer">
                <input type="checkbox" checked={data.notifications} onChange={(e) => set("notifications", e.target.checked)} className="mt-1 accent-primary" />
                <span>Recevoir des notifications sur les offres et nouveautés</span>
              </label>
              <NavBtns back={back} next={verifyCode} disabled={!otpSent || loading} nextLabel={loading ? "Vérification..." : "J'ai confirmé mon email"} />
            </div>
          )}

          {/* STEP 7 — Done */}
          {step === 7 && (
            <div className="text-center py-8 animate-fade-up">
              <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-primary grid place-items-center text-white shadow-elegant">
                <Check size={40} />
              </div>
              <h2 className="text-3xl font-extrabold mb-3">Compte créé avec succès !</h2>
              <p className="text-muted-foreground mb-8">Bienvenue sur Amashia Seller, {data.firstName} ! Redirection vers votre tableau de bord…</p>
              <button onClick={() => navigate({ to: "/dashboard" })} className="px-10 py-3.5 rounded-full bg-gradient-primary text-white font-semibold shadow-elegant hover:shadow-glow transition">
                Accéder à mon compte
              </button>
            </div>
          )}
        </SignupShell>
      </main>
      <Footer />
    </div>
  );
}

const inputCls = "w-full bg-background border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary disabled:opacity-50";
const ctaCls = "w-full py-3.5 rounded-full bg-gradient-primary text-white font-semibold shadow-elegant hover:shadow-glow transition";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-sm font-medium mb-2">{label}</label>{children}</div>;
}

function NavBtns({ back, next, disabled, nextLabel = "Continuer" }: { back: () => void; next: () => void; disabled?: boolean; nextLabel?: string }) {
  return (
    <div className="grid grid-cols-2 gap-3 pt-2">
      <button onClick={back} className="py-3.5 rounded-full bg-secondary text-foreground font-semibold hover:opacity-90 transition">Précédent</button>
      <button onClick={next} disabled={disabled} className="py-3.5 rounded-full bg-gradient-primary text-white font-semibold shadow-elegant hover:shadow-glow transition disabled:opacity-50 disabled:cursor-not-allowed">{nextLabel}</button>
    </div>
  );
}

function PayCard({ active, onClick, icon, title, subtitle }: { active: boolean; onClick: () => void; icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <button onClick={onClick} className={`text-left p-5 rounded-2xl border-2 transition ${active ? "border-primary bg-primary/10" : "border-border bg-background hover:border-primary/50"}`}>
      <div className="w-10 h-10 rounded-xl bg-secondary grid place-items-center mb-3">{icon}</div>
      <p className="font-bold">{title}</p>
      <p className="text-xs text-muted-foreground">{subtitle}</p>
    </button>
  );
}

function DocUpload({ label, file, onFile }: { label: string; file?: DocFile; onFile: (f: DocFile | undefined) => void }) {
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  function handle(f: File | undefined) {
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { toast.error("Fichier trop volumineux (max 5MB)"); return; }
    const reader = new FileReader();
    reader.onload = () => onFile({ name: f.name, dataUrl: reader.result as string });
    reader.readAsDataURL(f);
  }
  return (
    <div>
      <label className="block text-sm font-medium mb-2">{label}</label>
      {file ? (
        <div className="bg-background border border-border rounded-xl p-3 flex items-center gap-3">
          {file.dataUrl.startsWith("data:image") ? (
            <img src={file.dataUrl} alt={file.name} className="w-14 h-14 rounded-lg object-cover" />
          ) : (
            <div className="w-14 h-14 rounded-lg bg-secondary grid place-items-center"><FileText size={20} /></div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{file.name}</p>
            <p className="text-xs text-emerald-400">✓ Prêt à être téléversé</p>
          </div>
          <button onClick={() => onFile(undefined)} className="w-8 h-8 grid place-items-center rounded-lg hover:bg-destructive/20 text-destructive"><X size={14} /></button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => galleryRef.current?.click()} className="py-3 rounded-xl border border-dashed border-border hover:border-primary text-sm flex items-center justify-center gap-2">
            <Upload size={16} /> Galerie
          </button>
          <button type="button" onClick={() => cameraRef.current?.click()} className="py-3 rounded-xl border border-dashed border-border hover:border-primary text-sm flex items-center justify-center gap-2">
            <Camera size={16} /> Photo
          </button>
        </div>
      )}
      <input ref={galleryRef} type="file" accept="image/*,application/pdf" hidden onChange={(e) => handle(e.target.files?.[0])} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => handle(e.target.files?.[0])} />
    </div>
  );
}
