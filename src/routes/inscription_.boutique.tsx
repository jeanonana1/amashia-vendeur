import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, Loader2, LocateFixed, Store, ImagePlus, X } from "lucide-react";
import { AuthSplit } from "@/components/seller/site/AuthSplit";
import { SignupShell } from "@/components/seller/signup/SignupShell";
import { supabase } from "@/integrations/supabase/client";
import { Select } from "@/components/ui/app-select";
import { OPEN_CITIES, useCmLocations } from "@/lib/cmLocations";
import { compressImage, MAX_IMAGE_BYTES, tooHeavyMessage } from "@/lib/imageCompress";

export const Route = createFileRoute("/inscription_/boutique")({
  head: () => ({ meta: [{ title: "Créer ma boutique — Amachia Seller" }, { name: "robots", content: "noindex" }] }),
  component: ShopSetupPage,
});

type NameCheck = { available: boolean; name?: string; reason?: string; suggestions: string[] } | null;
const db = supabase as unknown as { rpc: (f: string, a?: unknown) => PromiseLike<{ data: unknown; error: { message: string } | null }> };
const inputCls = "w-full bg-background border border-border rounded-xl px-4 py-4 text-base sm:py-3 sm:text-sm focus:outline-none focus:border-primary";

/** Après la vérification de l'e-mail : informations de la boutique (nom unique, description, logo, bannière, localisation). */
function ShopSetupPage() {
  const navigate = useNavigate();
  const loc = useCmLocations();
  const [uid, setUid] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [check, setCheck] = useState<NameCheck>(null);
  const [checking, setChecking] = useState(false);
  const [description, setDescription] = useState("");
  const [logo, setLogo] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [uploading, setUploading] = useState<"logo" | "banner" | null>(null);
  const [city, setCity] = useState("");
  const [district, setDistrict] = useState("");
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [landmark, setLandmark] = useState("");
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const seq = useRef(0);

  // il faut être connecté (l'e-mail vient d'être vérifié) ; la boutique déjà créée est préremplie
  useEffect(() => {
    void supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { navigate({ to: "/connexion" as never, replace: true }); return; }
      setUid(data.user.id);
      const { data: p } = await supabase.from("seller_profiles").select("shop_name, shop_description, shop_logo_url, shop_banner_url, city, neighborhood").eq("id", data.user.id).maybeSingle();
      const sp = p as { shop_name: string | null; shop_description: string | null; shop_logo_url: string | null; shop_banner_url: string | null; city: string | null; neighborhood: string | null } | null;
      if (sp) {
        if (sp.shop_name) setName(sp.shop_name);
        if (sp.shop_description) setDescription(sp.shop_description);
        setLogo(sp.shop_logo_url); setBanner(sp.shop_banner_url);
        if (sp.city && OPEN_CITIES.includes(sp.city)) setCity(sp.city);
        if (sp.neighborhood) setDistrict(sp.neighborhood);
      }
    });
  }, [navigate]);

  // vérification du nom pendant la saisie (unique sur Amachia)
  useEffect(() => {
    const n = name.trim();
    if (!n) { setCheck(null); return; }
    const id = ++seq.current;
    setChecking(true);
    const t = window.setTimeout(() => {
      void db.rpc("shop_name_check", { _name: n }).then(({ data }) => {
        if (id !== seq.current) return;
        setChecking(false);
        setCheck(data as NameCheck);
      });
    }, 450);
    return () => window.clearTimeout(t);
  }, [name]);

  const upload = async (file: File | undefined, kind: "logo" | "banner") => {
    if (!file || !uid) return;
    if (!file.type.startsWith("image/")) return toast.error("Choisissez une image (JPG, PNG, WebP…).");
    if (file.size > MAX_IMAGE_BYTES) return toast.error(tooHeavyMessage());
    setUploading(kind);
    try {
      const small = await compressImage(file, kind === "banner" ? 2000 : 600);
      const ext = (small.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${uid}/shop-${kind}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("product-images").upload(path, small, { cacheControl: "31536000", contentType: small.type || "image/jpeg" });
      if (error) throw error;
      const url = supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
      if (kind === "logo") setLogo(url); else setBanner(url);
    } catch { toast.error("Envoi de l'image impossible. Vérifiez votre connexion et réessayez."); }
    finally { setUploading(null); }
  };

  const locate = () => {
    if (!navigator.geolocation) return toast.error("La localisation n'est pas disponible sur cet appareil.");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { setPos({ lat: p.coords.latitude, lng: p.coords.longitude }); setLocating(false); },
      (e) => { setLocating(false); toast.error(e.code === 1 ? "Autorisez la localisation dans votre navigateur." : "Position introuvable. Réessayez."); },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  };

  const save = async () => {
    if (!check?.available) return toast.error(check?.reason ?? "Choisissez un nom de boutique disponible.");
    if (!city || !district) return toast.error("Indiquez la ville et le quartier de la boutique.");
    setSaving(true);
    const { error } = await db.rpc("seller_setup_shop", {
      _name: name.trim(), _description: description, _logo: logo, _banner: banner,
      _region: loc?.regionOfCity[city] ?? null, _city: city, _neighborhood: district,
      _lat: pos?.lat ?? null, _lng: pos?.lng ?? null, _landmark: landmark || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Votre boutique est créée !");
    navigate({ to: "/dashboard", replace: true });
  };

  const districts = city ? loc?.districtsByCity[city] ?? [] : [];

  return (
    <AuthSplit wide>
      <SignupShell step={5}>
        <div className="space-y-6 animate-fade-up">
          <div>
            <h2 className="flex items-center gap-2 text-2xl font-extrabold"><Store className="text-primary" /> Votre boutique</h2>
            <p className="mt-1 text-sm text-muted-foreground">Ces informations s'affichent sur votre page boutique Amachia. Vous pourrez les modifier plus tard.</p>
          </div>

          {/* nom unique */}
          <div>
            <label className="mb-2 block text-base font-semibold sm:text-sm sm:font-medium" htmlFor="shop-name">Nom de la boutique *</label>
            <div className="relative">
              <input id="shop-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Ex. Mode Bastos"
                className={`${inputCls} pr-11 ${check?.available ? "border-emerald-500" : check && !check.available ? "border-destructive" : ""}`} />
              <span className="absolute right-3 top-1/2 -translate-y-1/2">
                {checking ? <Loader2 size={18} className="animate-spin text-muted-foreground" /> : check?.available ? <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-500 text-white"><Check size={14} /></span> : null}
              </span>
            </div>
            {check?.available && !checking && <p className="mt-1.5 flex items-center gap-1.5 text-sm font-semibold text-emerald-500"><Check size={15} /> « {check.name} » est disponible</p>}
            {check && !check.available && !checking && (
              <div className="mt-1.5">
                <p className="text-sm font-semibold text-destructive">{check.reason}</p>
                {check.suggestions.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs text-muted-foreground">Noms disponibles :</p>
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      {check.suggestions.map((sg) => (
                        <button key={sg} type="button" onClick={() => setName(sg)} className="rounded-full border border-emerald-500/50 bg-emerald-500/10 px-3 py-1.5 text-sm font-medium text-emerald-500 hover:bg-emerald-500/20">{sg}</button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="mb-2 block text-base font-semibold sm:text-sm sm:font-medium" htmlFor="shop-desc">Description</label>
            <textarea id="shop-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={600} rows={3}
              placeholder="Ce que vous vendez, votre spécialité, vos horaires…" className={`${inputCls} resize-none`} />
          </div>

          {/* logo + bannière */}
          <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
            <ImagePick label="Logo" ratio="aspect-square" url={logo} busy={uploading === "logo"} onPick={(f) => void upload(f, "logo")} onClear={() => setLogo(null)} />
            <ImagePick label="Bannière" ratio="aspect-[3/1]" url={banner} busy={uploading === "banner"} onPick={(f) => void upload(f, "banner")} onClear={() => setBanner(null)} />
          </div>

          {/* localisation */}
          <div className="space-y-4 rounded-2xl border border-border p-4">
            <p className="font-semibold">Localisation de la boutique</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium">Ville *</label>
                <Select title="Ville de la boutique" value={city} onChange={(e) => { setCity(e.target.value); setDistrict(""); }} className={inputCls}>
                  <option value="">Sélectionner</option>
                  {OPEN_CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">Quartier *</label>
                <Select title="Quartier" value={district} onChange={(e) => setDistrict(e.target.value)} className={inputCls} disabled={!city}>
                  <option value="">{city ? "Sélectionner" : "Choisissez d'abord la ville"}</option>
                  {districts.map((d) => <option key={d} value={d}>{d}</option>)}
                </Select>
              </div>
            </div>
            <div className="rounded-xl bg-secondary/60 p-3">
              <p className="text-sm font-semibold">Position GPS pour les livreurs <span className="font-normal text-muted-foreground">(facultatif)</span></p>
              <p className="mt-0.5 text-xs text-muted-foreground">À faire depuis votre boutique. Pas sur place ? Laissez vide : vous pourrez la partager plus tard depuis votre tableau de bord.</p>
              <button type="button" onClick={locate} disabled={locating} className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-full border border-border bg-card text-sm font-semibold">
                {locating ? <Loader2 size={16} className="animate-spin" /> : <LocateFixed size={16} className="text-primary" />}
                {pos ? "Position enregistrée ✓ (recommencer)" : "Utiliser ma position actuelle"}
              </button>
              {pos && <input value={landmark} onChange={(e) => setLandmark(e.target.value)} maxLength={200} placeholder="Repère pour le livreur (ex. face pharmacie)" className={`${inputCls} mt-2`} />}
            </div>
          </div>

          <button type="button" onClick={() => void save()} disabled={saving || !check?.available || !city || !district}
            className="cta-sweep flex w-full items-center justify-center gap-2 rounded-full bg-gradient-primary py-4 text-base font-semibold text-black shadow-elegant disabled:opacity-50 sm:py-3.5 sm:text-sm">
            {saving && <Loader2 size={16} className="animate-spin" />}Créer ma boutique
          </button>
        </div>
      </SignupShell>
    </AuthSplit>
  );
}

function ImagePick({ label, ratio, url, busy, onPick, onClear }: { label: string; ratio: string; url: string | null; busy: boolean; onPick: (f: File | undefined) => void; onClear: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="min-w-0">
      <p className="mb-2 text-sm font-medium">{label}</p>
      <div className={`relative ${ratio} w-full overflow-hidden rounded-xl border border-dashed border-border bg-background`}>
        {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : (
          <button type="button" onClick={() => ref.current?.click()} className="grid h-full w-full place-items-center text-sm text-muted-foreground hover:text-primary">
            <span className="flex flex-col items-center gap-1">{busy ? <Loader2 className="animate-spin" /> : <ImagePlus />}{busy ? "Envoi…" : "Ajouter"}</span>
          </button>
        )}
        {url && <button type="button" onClick={onClear} aria-label="Retirer" className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/60 text-white"><X size={14} /></button>}
      </div>
      <input ref={ref} type="file" accept="image/*" hidden onChange={(e) => { onPick(e.target.files?.[0]); e.target.value = ""; }} />
    </div>
  );
}
