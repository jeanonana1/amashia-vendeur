import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { SignupShell } from "@/components/seller/signup/SignupShell";
import { AuthSplit } from "@/components/seller/site/AuthSplit";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Send, Check, FileText, Loader2, LocateFixed } from "lucide-react";
import { IconMobileMoney as Smartphone, IconCarteBancaire as CreditCard, IconLocalisation as MapPin, IconPaiementSecurise as ShieldCheck, IconEmail as Mail, IconImporter as Upload, IconAppareilPhoto as Camera, IconFermer as X, IconBoutique as Store, IconAccueil as Home, IconHorloge as Clock } from "@/components/icons/AmachiaIcons";
import { OPEN_CITIES, isOpenCity, useCmLocations } from "@/lib/cmLocations";
import { accountHint, signInSeller, type AccountHint } from "@/lib/sellerLogin";
import { preferredLang, setSellerLang } from "@/lib/sellerLang";
import { PasswordInput } from "@/components/ui/password-input";
import { PhoneInput } from "@/components/seller/PhoneInput";
import { cmDigits, cmPhoneError, formatCm, toE164 } from "@/lib/phone";
import { Select } from "@/components/ui/app-select";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { compressImage, MAX_IMAGE_BYTES } from "@/lib/imageCompress";

type SearchParams = { type?: "particulier" | "entreprise" };

export const Route = createFileRoute("/inscription_/etapes")({
  validateSearch: (s: Record<string, unknown>): SearchParams => ({
    type: s.type === "entreprise" ? "entreprise" : "particulier",
  }),
  head: () => ({
    meta: [{ title: "Création de compte vendeur — Amachia Seller" }, { name: "description", content: "Création de compte vendeur : votre espace vendeur Amachia pour gérer votre activité." }, { property: "og:title", content: "Création de compte vendeur — Amachia Seller" }, { property: "og:description", content: "Création de compte vendeur : votre espace vendeur Amachia pour gérer votre activité." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }],
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
  // avancement de la création du compte (affiché sur le bouton) et documents déjà envoyés (pas renvoyés si on réessaie)
  const [progress, setProgress] = useState("");
  const uploadedDocs = useRef<Set<string>>(new Set());
  const [otpSent, setOtpSent] = useState(false);
  const [otpState, setOtp] = useState("");
  const [existing, setExisting] = useState(false); // e-mail déjà inscrit : pas de code, connexion avec le mot de passe
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);
  const [data, setData] = useState<FormState>({
    firstName: "", lastName: "", email: "", phone: "", password: "", confirm: "",
    categories: [],
    gender: "", birthDate: "",
    country: "Cameroun", city: "", language: "fr",
    paymentMethod: "",
    mmOperator: "MTN", mmNumber: "", mmHolder: "",
    cardNumber: "", cardName: "", cardExpiry: "", cardCvv: "",
    region: "", shopCity: "", neighborhood: "",
    shareLocation: false, latitude: null, longitude: null,
    acceptTerms: false, notifications: true,
    docs: {},
  });

  // langue proposée d'après le téléphone / l'ordinateur (ou le choix déjà fait)
  useEffect(() => { const l = preferredLang(); if (l !== "fr") setData((d) => ({ ...d, language: l })); }, []);
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

  // régions, villes et quartiers de la base (les quartiers ajoutés depuis l'admin apparaissent ici)
  const loc = useCmLocations();
  const regions = loc?.regions ?? [];
  const cities = useMemo(() => (loc && data.region ? loc.citiesByRegion[data.region] ?? [] : []), [loc, data.region]);
  const quartiers = useMemo(() => (loc && data.shopCity ? loc.districtsByCity[data.shopCity] ?? [] : []), [loc, data.shopCity]);
  const allCities = useMemo(() => (loc ? Object.keys(loc.regionOfCity).sort((a, b) => (isOpenCity(a) ? 0 : 1) - (isOpenCity(b) ? 0 : 1) || a.localeCompare(b, "fr")) : OPEN_CITIES), [loc]);
  // la ville de résidence pré-remplit la localisation de la boutique
  useEffect(() => {
    if (!loc || !data.city || data.shopCity || !isOpenCity(data.city)) return;
    setData((d) => ({ ...d, region: loc.regionOfCity[d.city] ?? d.region, shopCity: d.city }));
  }, [loc, data.city]); // eslint-disable-line react-hooks/exhaustive-deps
  const [locInfoOpen, setLocInfoOpen] = useState(false);

  // Compte déjà existant : détecté dès la saisie de l'e-mail ou du numéro
  const [hint, setHint] = useState<(AccountHint & { key: string }) | null>(null);
  const [hintOpen, setHintOpen] = useState(false);
  const dismissed = useRef(new Set<string>());
  useEffect(() => {
    if (step !== 1) return;
    const email = data.email.trim().toLowerCase();
    const digits = cmDigits(data.phone);
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
    const phoneOk = digits.length === 9 && !cmPhoneError(digits);
    if (!emailOk && !phoneOk) return;
    const t = window.setTimeout(async () => {
      const tries: [string, { email?: string; phone?: string }][] = [];
      if (emailOk) tries.push([`e:${email}`, { email }]);
      if (phoneOk) tries.push([`p:${digits}`, { phone: digits }]);
      for (const [key, q] of tries) {
        if (dismissed.current.has(key)) continue;
        const h = await accountHint(q);
        if (h.exists && h.is_seller) { setHint({ ...h, key }); setHintOpen(true); return; }
      }
    }, 650);
    return () => window.clearTimeout(t);
  }, [data.email, data.phone, step]);

  async function sendCode() {
    if (!data.acceptTerms) { toast.error("Vous devez accepter les conditions"); return; }
    if (cooldown > 0) return;
    setLoading(true);
    try {
      const metadata = { account_type: type, first_name: data.firstName, last_name: data.lastName, phone: formatCm(cmDigits(data.phone)), seller_profile: buildProfile() };
      const result = otpSent
        ? await supabase.auth.resend({ type: "signup", email: data.email, options: { emailRedirectTo: `${window.location.origin}/connexion` } })
        : await supabase.auth.signUp({ email: data.email, password: data.password, options: { data: metadata, emailRedirectTo: `${window.location.origin}/connexion` } });
      if (result.error) {
        if (/rate limit|security purposes|seconds/i.test(result.error.message)) throw new Error("Trop de demandes d'envoi : patientez une minute avant de redemander un code.");
        throw result.error;
      }
      if ("session" in result.data && result.data.session) {
        toast.error("La confirmation email doit être activée sur votre service d’identification.");
        return;
      }
      setOtpSent(true);
      setCooldown(60);
      if (!otpSent && "user" in result.data && result.data.user && result.data.user.identities?.length === 0) {
        setExisting(true);
        toast.info("Cet email a déjà un compte Amachia : continuez avec votre mot de passe.");
        return;
      }
      setOtp("");
      toast.success(otpSent ? "Un nouveau code vient d'être envoyé." : "Le code de vérification a été envoyé par email.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Envoi impossible.");
    } finally { setLoading(false); }
  }

  function buildProfile() {
    return {
      account_type: type,
      first_name: data.firstName, last_name: data.lastName, phone: formatCm(cmDigits(data.phone)),
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

  async function verifyCode(code?: string) {
    if (loading) return;
    const otp = code ?? otpState;
    setLoading(true);
    setProgress("Vérification du code…");
    const profile = buildProfile();
    try {
      // code à 6 chiffres reçu par e-mail (sinon : compte déjà existant ou lien déjà cliqué → mot de passe)
      let verified = false;
      if (!existing && otp.length === 6) {
        const { error: otpError } = await supabase.auth.verifyOtp({ email: data.email, token: otp, type: "signup" });
        if (!otpError) verified = true;
        else if (!/expired|invalid/i.test(otpError.message)) throw otpError;
      }
      const { error: signInError } = verified ? { error: null } : await supabase.auth.signInWithPassword({ email: data.email, password: data.password });
      if (signInError) {
        if (/not confirmed/i.test(signInError.message)) {
          throw new Error(otp.length === 6 ? "Code incorrect ou expiré. Vérifiez le dernier e-mail reçu ou demandez un nouveau code." : "Saisissez le code à 6 chiffres reçu par email.");
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
        // documents envoyés un par un, avec une limite de temps : la page ne reste jamais bloquée sans message
        const todo = docEntries.filter((e): e is [string, DocFile] => !!e[1] && !uploadedDocs.current.has(e[0]));
        let n = 0;
        for (const [docType, file] of todo) {
          n++;
          setProgress(`Envoi des documents ${n}/${todo.length}…`);
          const blob = await (await fetch(file.dataUrl)).blob();
          const ext = file.name.split(".").pop() || "jpg";
          const path = `${user.id}/${docType}-${Date.now()}.${ext}`;
          let upErr: unknown = null;
          for (let attempt = 0; attempt < 2; attempt++) {
            const res = await withTimeout(supabase.storage.from("seller-documents").upload(path, blob, { upsert: true, contentType: blob.type || undefined }), 60_000).catch((err: unknown) => ({ error: err }));
            upErr = res.error;
            if (!upErr) break;
          }
          if (upErr) throw new Error("L'envoi de vos documents n'a pas abouti (connexion trop lente). Vérifiez votre connexion puis appuyez à nouveau sur « Valider le code ».");
          await supabase.from("seller_documents").insert({ user_id: user.id, doc_type: docType, file_url: path });
          uploadedDocs.current.add(docType);
        }

        setProgress("Création de votre boutique…");
        const { error: profileError } = await withTimeout(supabase.from("seller_profiles").upsert({ id: user.id, ...profile } as never), 30_000);
        if (profileError) throw profileError;
      }
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Création du compte impossible");
      return;
    } finally {
      setLoading(false);
      setProgress("");
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
    <AuthSplit wide>
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
              <Field label="Numéro de téléphone *"><PhoneInput required value={data.phone} onChange={(v) => set("phone", v)} className={inputCls} /></Field>
              <Field label="Mot de passe *"><PasswordInput value={data.password} onChange={(e) => set("password", e.target.value)} className={inputCls} /></Field>
              <Field label="Confirmer le mot de passe *"><PasswordInput value={data.confirm} onChange={(e) => set("confirm", e.target.value)} className={inputCls} /></Field>
              <button onClick={() => {
                if (!data.firstName || !data.lastName || !data.email || !data.phone || !data.password) return toast.error("Veuillez remplir tous les champs");
                { const pe = cmPhoneError(cmDigits(data.phone)); if (pe) return toast.error(pe); }
                if (data.password.length < 6) return toast.error("Mot de passe trop court (min 6)");
                if (data.password !== data.confirm) return toast.error("Les mots de passe ne correspondent pas");
                if (hint && !dismissed.current.has(hint.key)) { setHintOpen(true); return; }
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
              <Field label="Genre *">
                <div className="grid grid-cols-2 gap-2">
                  {["Homme", "Femme"].map((g) => (
                    <button key={g} type="button" onClick={() => set("gender", g)} className={`flex items-center justify-center gap-2 rounded-xl border py-3 text-sm font-semibold transition ${data.gender === g ? "border-primary bg-primary/15 text-primary" : "border-border bg-background hover:border-primary/50"}`}>
                      <span className={`grid h-4 w-4 place-items-center rounded-full border-2 ${data.gender === g ? "border-primary" : "border-muted-foreground/40"}`}>{data.gender === g && <span className="h-2 w-2 rounded-full bg-primary" />}</span>{g}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Date de naissance *"><BirthDate value={data.birthDate} onChange={(v) => set("birthDate", v)} /></Field>
              <div className="grid md:grid-cols-2 gap-4">
                <Field label="Pays *">
                  <Select title="Pays" value={data.country} onChange={(e) => { set("country", e.target.value); set("region", ""); set("shopCity", ""); set("neighborhood", ""); }} className={inputCls}>
                    <option value="">Sélectionner</option>
                    <option value="Cameroun">Cameroun</option>
                    {["Sénégal", "Côte d'Ivoire", "Bénin", "Togo", "Gabon"].map((c) => <option key={c} value={c}>{c} — bientôt</option>)}
                  </Select>
                </Field>
                <Field label="Ville (résidence) *">
                  <Select title="Ville de résidence" value={data.city} onChange={(e) => set("city", e.target.value)} className={inputCls} disabled={data.country !== "Cameroun"}>
                    <option value="">{data.country === "Cameroun" ? "Sélectionner" : "Choisissez d'abord le Cameroun"}</option>
                    {allCities.map((c) => <option key={c} value={c}>{isOpenCity(c) ? c : `${c} — bientôt`}</option>)}
                  </Select>
                </Field>
              </div>
              {data.country && data.country !== "Cameroun" && <SoonNote place={data.country} />}
              {data.city && !isOpenCity(data.city) && <SoonNote place={data.city} />}
              <Field label="Langue préférée">
                <Select title="Langue préférée" value={data.language} onChange={(e) => { set("language", e.target.value); setSellerLang(e.target.value === "en" ? "en" : "fr"); }} className={inputCls}>
                  <option value="fr">Français</option><option value="en">English</option>
                </Select>
              </Field>
              <NavBtns back={back} next={() => {
                if (data.categories.length === 0) return toast.error("Sélectionnez au moins une catégorie");
                if (!data.gender) return toast.error("Sélectionnez votre genre");
                if (!data.birthDate) return toast.error("Indiquez votre date de naissance complète");
                { const age = (Date.now() - new Date(data.birthDate).getTime()) / (365.25 * 864e5); if (age < 18) return toast.error("Vous devez avoir au moins 18 ans pour ouvrir une boutique"); }
                if (!data.country || !data.city) return toast.error("Pays et ville requis");
                if (data.country !== "Cameroun" || !isOpenCity(data.city)) return toast.error("Pour le moment, Amachia accepte uniquement les vendeurs de Yaoundé et de Douala");
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
                    <Select value={data.mmOperator} onChange={(e) => set("mmOperator", e.target.value)} className={inputCls}>
                      <option>MTN Mobile Money</option><option>Orange Money</option><option>Moov Money</option><option>Wave</option>
                    </Select>
                  </Field>
                  <Field label="Numéro Mobile Money *"><PhoneInput required value={data.mmNumber} onChange={(v) => set("mmNumber", v)} className={inputCls} /></Field>
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
                if (data.paymentMethod === "mobile") { const pe = cmPhoneError(cmDigits(data.mmNumber)); if (pe) return toast.error(pe); }
                if (data.paymentMethod === "card" && (!data.cardNumber || !data.cardName || !data.cardExpiry || !data.cardCvv)) return toast.error("Renseignez tous les champs de carte");
                next();
              }} disabled={!data.paymentMethod} />
            </div>
          )}

          {/* STEP 5 — Localisation */}
          {step === 5 && (
            <div className="space-y-5 animate-fade-up">
              <h2 className="text-2xl font-extrabold flex items-center gap-2"><MapPin className="text-primary" /> Localisation de la boutique</h2>

              <Field label="Région *">
                <Select title="Région" value={data.region} onChange={(e) => { set("region", e.target.value); set("shopCity", ""); set("neighborhood", ""); }} className={inputCls} disabled={!loc}>
                  <option value="">{loc ? "Sélectionner une région" : "Chargement…"}</option>
                  {regions.map((r) => <option key={r} value={r}>{(loc?.citiesByRegion[r] ?? []).some(isOpenCity) ? r : `${r} — bientôt`}</option>)}
                </Select>
              </Field>

              <Field label="Ville *">
                <Select title="Ville de la boutique" value={data.shopCity} onChange={(e) => { set("shopCity", e.target.value); set("neighborhood", ""); }} className={inputCls} disabled={!data.region}>
                  <option value="">{data.region ? "Sélectionner une ville" : "Choisissez d'abord une région"}</option>
                  {cities.map((c) => <option key={c} value={c}>{isOpenCity(c) ? c : `${c} — bientôt`}</option>)}
                </Select>
              </Field>
              {data.region && !cities.some(isOpenCity) && <SoonNote place={`la région ${data.region}`} />}
              {data.shopCity && !isOpenCity(data.shopCity) && <SoonNote place={data.shopCity} />}

              <Field label="Quartier *">
                <Select title={data.shopCity ? `Quartier · ${data.shopCity}` : "Quartier"} value={data.neighborhood} onChange={(e) => set("neighborhood", e.target.value)} className={inputCls} disabled={!data.shopCity || !isOpenCity(data.shopCity)}>
                  <option value="">{data.shopCity ? `Sélectionner un quartier (${quartiers.length})` : "Choisissez d'abord une ville"}</option>
                  {quartiers.map((q) => <option key={q} value={q}>{q}</option>)}
                </Select>
              </Field>

              {/* Position GPS de la boutique (lieu de récupération des colis) */}
              <div className="overflow-hidden rounded-2xl border border-border bg-background">
                <div className="flex items-start gap-3 p-4">
                  <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${data.shareLocation ? "bg-primary text-black" : "bg-primary/15 text-primary"}`}><LocateFixed size={20} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">Position GPS de récupération</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">Le livreur Amachia viendra récupérer vos colis à cette position exacte.</p>
                  </div>
                </div>
                {data.shareLocation && data.latitude && data.longitude && (
                  <div className="mx-4 mb-3 flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-400">
                    <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-emerald-400" />
                    <span className="min-w-0">Position enregistrée : <span className="tabular-nums">{data.latitude.toFixed(5)}, {data.longitude.toFixed(5)}</span></span>
                  </div>
                )}
                {data.shareLocation && !data.latitude && (
                  <div className="mx-4 mb-3 flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="animate-spin" size={14} /> Recherche de votre position…</div>
                )}
                <button type="button" onClick={() => (data.shareLocation ? set("shareLocation", false) : setLocInfoOpen(true))}
                  className="flex w-full items-center justify-between gap-3 border-t border-border bg-card/60 px-4 py-3 text-left text-sm font-semibold">
                  <span>{data.shareLocation ? "Partage de la position activé" : "Partager ma position"}</span>
                  <span role="switch" aria-checked={data.shareLocation} className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${data.shareLocation ? "bg-primary" : "bg-secondary"}`}>
                    <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${data.shareLocation ? "left-6" : "left-1"}`} />
                  </span>
                </button>
              </div>

              <NavBtns back={back} next={() => {
                if (!data.region || !data.shopCity || !data.neighborhood) return toast.error("Région, ville et quartier requis");
                if (!isOpenCity(data.shopCity)) return toast.error("Pour le moment, Amachia accepte uniquement les boutiques de Yaoundé et de Douala");
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
                    <p className="text-xs text-muted-foreground">Un code à 6 chiffres sera envoyé à <span className="text-primary font-semibold">{data.email}</span></p>
                  </div>
                </div>
                {!otpSent ? (
                  <button onClick={sendCode} disabled={loading || !data.acceptTerms} className="w-full py-3 rounded-full bg-primary text-black font-semibold hover:brightness-95 transition flex items-center justify-center gap-2 disabled:opacity-50">
                    <Send size={16} /> {loading ? "Envoi..." : "Recevoir mon code"}
                  </button>
                ) : existing ? (
                  <p className="text-sm">Cette adresse a déjà un compte Amachia. Cliquez sur <span className="font-semibold">« Continuer »</span> pour vous connecter avec votre mot de passe.</p>
                ) : (
                  <div className="space-y-4 text-sm">
                    <p>📩 Saisissez le code reçu par email (pensez à vérifier les spams et l'onglet Promotions).</p>
                    <div className="flex justify-center">
                      <InputOTP maxLength={6} value={otpState} onChange={(v) => setOtp(v.replace(/\D/g, ""))} inputMode="numeric" autoFocus
                        onComplete={(v: string) => { if (/^\d{6}$/.test(v) && !loading) void verifyCode(v); }}>
                        <InputOTPGroup>
                          {[0, 1, 2, 3, 4, 5].map((i) => <InputOTPSlot key={i} index={i} className="w-11 h-12 text-lg font-bold" />)}
                        </InputOTPGroup>
                      </InputOTP>
                    </div>
                    <div className="text-center">
                      <button onClick={sendCode} disabled={loading || cooldown > 0} className="text-sm text-primary hover:underline disabled:opacity-60 disabled:no-underline">
                        {cooldown > 0 ? `Renvoyer un code dans ${cooldown} s` : "Renvoyer un code"}
                      </button>
                    </div>
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
              <NavBtns back={back} next={() => void verifyCode()} disabled={!otpSent || loading || (!existing && otpState.length !== 6)} nextLabel={loading ? (progress || "Vérification...") : existing ? "Continuer" : "Valider le code"} />
            </div>
          )}

          {/* STEP 7 — Done */}
          {step === 7 && (
            <div className="text-center py-8 animate-fade-up">
              <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-primary grid place-items-center text-black shadow-elegant">
                <Check size={40} />
              </div>
              <h2 className="text-3xl font-extrabold mb-3">Compte créé avec succès !</h2>
              <p className="text-muted-foreground mb-8">Bienvenue sur Amachia Seller, {data.firstName} ! Redirection vers votre tableau de bord…</p>
              <button onClick={() => navigate({ to: "/dashboard" })} className="px-10 py-3.5 rounded-full bg-gradient-primary text-black font-semibold shadow-elegant hover:shadow-glow transition">
                Accéder à mon compte
              </button>
            </div>
          )}
        </SignupShell>
        {hint && hintOpen && (
          <ExistingAccountModal hint={hint} email={data.email.trim()} phone={cmDigits(data.phone)} password={data.password}
            onClose={() => { dismissed.current.add(hint.key); setHintOpen(false); }}
            onLogged={() => navigate({ to: "/dashboard", replace: true })} />
        )}
        {locInfoOpen && (
          <LocationInfoModal onCancel={() => setLocInfoOpen(false)} onConfirm={() => { setLocInfoOpen(false); set("shareLocation", true); }} />
        )}
    </AuthSplit>
  );
}

const inputCls = "w-full bg-background border border-border rounded-xl px-4 py-4 text-base sm:py-3 sm:text-sm focus:outline-none focus:border-primary disabled:opacity-50";
const ctaCls = "cta-sweep w-full py-3.5 rounded-full bg-gradient-primary text-black font-semibold shadow-elegant hover:shadow-glow transition";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-base font-semibold mb-2 sm:text-sm sm:font-medium">{label}</label>{children}</div>;
}

function NavBtns({ back, next, disabled, nextLabel = "Continuer" }: { back: () => void; next: () => void; disabled?: boolean; nextLabel?: string }) {
  return (
    <div className="grid grid-cols-2 gap-3 pt-2">
      <button onClick={back} className="py-4 text-base sm:py-3.5 sm:text-sm rounded-full bg-secondary text-foreground font-semibold hover:opacity-90 transition">Précédent</button>
      <button onClick={next} disabled={disabled} className="cta-sweep py-4 text-base sm:py-3.5 sm:text-sm rounded-full bg-gradient-primary text-black font-semibold shadow-elegant hover:shadow-glow transition disabled:opacity-50 disabled:cursor-not-allowed">{nextLabel}</button>
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
  async function handle(original: File | undefined) {
    if (!original) return;
    const isImage = original.type.startsWith("image/");
    if (original.size > (isImage ? MAX_IMAGE_BYTES : 5 * 1024 * 1024)) { toast.error(isImage ? "Photo trop lourde (20 Mo maximum)" : "Fichier trop volumineux (5 Mo maximum)"); return; }
    // photo de téléphone (3 à 15 Mo) réduite à quelques centaines de Ko, texte de la pièce toujours lisible
    const f = isImage ? await compressImage(original, 2000, 0.85) : original;
    const reader = new FileReader();
    reader.onload = () => onFile({ name: f.name, dataUrl: reader.result as string });
    reader.readAsDataURL(f);
  }
  return (
    <div className="min-w-0">
      <label className="block text-sm font-medium mb-2">{label}</label>
      {file ? (
        <div className="flex w-full min-w-0 max-w-full items-center gap-3 overflow-hidden rounded-xl border border-border bg-background p-3">
          {file.dataUrl.startsWith("data:image") ? (
            <img src={file.dataUrl} alt="" className="block h-16 w-16 min-w-16 max-w-16 shrink-0 rounded-lg bg-white object-cover" />
          ) : (
            <div className="grid h-16 w-16 shrink-0 place-items-center rounded-lg bg-secondary"><FileText size={20} /></div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{file.name}</p>
            <p className="text-xs text-emerald-400">✓ Prêt à être téléversé</p>
          </div>
          <button type="button" onClick={() => onFile(undefined)} aria-label="Retirer" className="w-8 h-8 shrink-0 grid place-items-center rounded-lg hover:bg-destructive/20 text-destructive"><X size={14} /></button>
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

const dateCls = "w-full bg-background border border-border rounded-xl px-2.5 py-3 text-sm focus:outline-none focus:border-primary sm:px-3";
const MONTHS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

/** Date de naissance en trois menus Amachia : jour, mois, année. */
function BirthDate({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [y0, m0, d0] = value ? value.split("-") : ["", "", ""];
  const [parts, setParts] = useState({ d: d0 ? String(Number(d0)) : "", m: m0 ? String(Number(m0)) : "", y: y0 || "" });
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 80 }, (_, i) => String(thisYear - 18 - i));
  const daysIn = parts.m && parts.y ? new Date(Number(parts.y), Number(parts.m), 0).getDate() : 31;
  const update = (p: typeof parts) => {
    if (p.d && Number(p.d) > (p.m && p.y ? new Date(Number(p.y), Number(p.m), 0).getDate() : 31)) p = { ...p, d: "" };
    setParts(p);
    onChange(p.d && p.m && p.y ? `${p.y}-${p.m.padStart(2, "0")}-${p.d.padStart(2, "0")}` : "");
  };
  return (
    <div className="grid grid-cols-[0.85fr_1.5fr_1.1fr] gap-1.5 sm:gap-2">
      <Select title="Jour de naissance" value={parts.d} onChange={(e) => update({ ...parts, d: e.target.value })} className={dateCls}>
        <option value="">Jour</option>
        {Array.from({ length: daysIn }, (_, i) => String(i + 1)).map((d) => <option key={d} value={d}>{d}</option>)}
      </Select>
      <Select title="Mois de naissance" value={parts.m} onChange={(e) => update({ ...parts, m: e.target.value })} className={dateCls}>
        <option value="">Mois</option>
        {MONTHS.map((m, i) => <option key={m} value={String(i + 1)}>{m}</option>)}
      </Select>
      <Select title="Année de naissance" value={parts.y} onChange={(e) => update({ ...parts, y: e.target.value })} className={dateCls}>
        <option value="">Année</option>
        {years.map((y) => <option key={y} value={y}>{y}</option>)}
      </Select>
    </div>
  );
}

function SoonNote({ place }: { place: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/10 p-3.5 text-sm">
      <Clock size={18} className="mt-0.5 shrink-0 text-primary" />
      <p><b>Amachia arrive bientôt {/^(la|le|les) /i.test(place) ? "dans" : "à"} {place} !</b><br /><span className="text-muted-foreground">Pour le moment, nous accueillons uniquement les vendeurs de <b className="text-foreground">Yaoundé</b> et de <b className="text-foreground">Douala</b>.</span></p>
    </div>
  );
}

/** Compte déjà existant : nom du titulaire + connexion directe. */
function ExistingAccountModal({ hint, email, phone, password, onClose, onLogged }: { hint: AccountHint; email: string; phone: string; password: string; onClose: () => void; onLogged: () => void }) {
  const [pwd, setPwd] = useState(password);
  const [busy, setBusy] = useState(false);
  const initials = (hint.name || "A").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  async function login() {
    if (!pwd) return toast.error("Entrez votre mot de passe");
    setBusy(true);
    const err = hint.via === "phone" ? await signInSeller({ phone, password: pwd }) : await signInSeller({ email, password: pwd });
    setBusy(false);
    if (err) return toast.error(err);
    toast.success(`Bon retour ${hint.name?.split(" ")[0] ?? ""} !`);
    onLogged();
  }
  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div className="app-select-sheet w-full max-w-md rounded-t-3xl border border-border bg-card p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-4">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-primary text-lg font-extrabold text-black">{initials}</span>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Vous avez déjà un compte vendeur</p>
            <p className="truncate text-xl font-extrabold">Bonjour {hint.name || ""} 👋</p>
          </div>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">Un compte Amachia Seller existe déjà avec {hint.via === "phone" ? "ce numéro de téléphone" : "cette adresse e-mail"}. Connectez-vous directement :</p>
        <div className="mt-4"><PasswordInput value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="Votre mot de passe" className={inputCls} onKeyDown={(e) => { if (e.key === "Enter") void login(); }} /></div>
        <button onClick={() => void login()} disabled={busy} className="cta-sweep mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary font-bold text-black disabled:opacity-60">{busy ? <Loader2 size={16} className="animate-spin" /> : null}Me connecter</button>
        <div className="mt-3 flex items-center justify-between text-xs">
          <a href="/connexion" className="font-semibold text-primary hover:underline">Mot de passe oublié ?</a>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">Ce n'est pas moi</button>
        </div>
      </div>
    </div>
  );
}

/** Avant de partager la position : explication du lieu de récupération des colis. */
function LocationInfoModal({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4" onClick={onCancel}>
      <div className="app-select-sheet w-full max-w-md rounded-t-3xl border border-border bg-card p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/15 text-primary"><MapPin size={26} /></span>
        <h3 className="mt-4 text-xl font-extrabold">Où sont vos produits ?</h3>
        <p className="mt-2 text-sm text-muted-foreground">Votre position GPS sera l'adresse où <b className="text-foreground">le livreur Amachia viendra récupérer vos colis</b>.</p>
        <div className="mt-4 grid gap-2">
          <p className="flex items-center gap-3 rounded-xl bg-secondary/60 p-3 text-sm"><Store size={18} className="shrink-0 text-primary" /><span>Soyez dans votre <b>boutique</b>…</span></p>
          <p className="flex items-center gap-3 rounded-xl bg-secondary/60 p-3 text-sm"><Home size={18} className="shrink-0 text-primary" /><span>… ou <b>chez vous</b>, si vos produits y sont stockés.</span></p>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Si vous n'êtes pas sur place maintenant, choisissez « Plus tard » : vous pourrez l'enregistrer depuis votre espace vendeur.</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button onClick={onCancel} className="h-12 rounded-full bg-secondary font-semibold">Plus tard</button>
          <button onClick={onConfirm} className="cta-sweep h-12 rounded-full bg-primary font-bold text-black">J'y suis, partager</button>
        </div>
      </div>
    </div>
  );
}

/** Échoue au bout de `ms` millisecondes au lieu d'attendre indéfiniment (réseau mobile coupé). */
function withTimeout<T>(p: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("La connexion est trop lente. Vérifiez votre réseau puis réessayez.")), ms);
    Promise.resolve(p).then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}
