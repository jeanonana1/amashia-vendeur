import { createFileRoute } from "@tanstack/react-router";
import { imgProps, imgUrl } from "@/lib/img";
import { useEffect, useRef, useState } from "react";
import { DashboardLayout } from "@/components/seller/dashboard/DashboardLayout";
import { Star, Loader2, Check, ExternalLink, LocateFixed } from "lucide-react";
import { IconBoutique as Store, IconLocalisation as MapPin, IconTelephone as Phone, IconEmail as Mail, IconVoir as Eye, IconFavoris as Heart, IconModifier as Edit, IconAppareilPhoto as Camera, IconFermer as X, IconLivreurMoto as Bike } from "@/components/icons/AmachiaIcons";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ensureSellerProfile } from "@/lib/sellerProfile";
import { compressImage, MAX_IMAGE_BYTES, tooHeavyMessage } from "@/lib/imageCompress";
import { MARKETPLACE_URL, num, useSellerStats } from "@/lib/sellerStats";

export const Route = createFileRoute("/dashboard/boutique")({
  head: () => ({ meta: [{ title: "Ma Boutique — Amachia Seller" }, { name: "description", content: "Ma Boutique : votre espace vendeur Amachia pour gérer votre activité." }, { property: "og:title", content: "Ma Boutique — Amachia Seller" }, { property: "og:description", content: "Ma Boutique : votre espace vendeur Amachia pour gérer votre activité." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: BoutiquePage,
});

const ALL_CATEGORIES = [
  "Mode & Vêtements", "Beauté & Cosmétiques", "Électronique", "Maison & Décoration",
  "Alimentation", "Bébé & Enfant", "Sports & Loisirs", "Santé & Bien-être",
  "Bijoux & Accessoires", "Auto & Moto", "Art & Artisanat", "Services"
];

type Profile = {
  id: string;
  account_type: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  shop_name: string | null;
  shop_description: string | null;
  shop_logo_url: string | null;
  shop_banner_url: string | null;
  shop_email: string | null;
  shop_address: string | null;
  neighborhood: string | null;
  city: string | null;
  region: string | null;
  category: string | null;
  categories: string[] | null;
};

function BoutiquePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [uploading, setUploading] = useState<"logo" | "banner" | null>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const bannerInput = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    shop_name: "",
    shop_description: "",
    city: "",
    categories: [] as string[],
  });
  const [saving, setSaving] = useState(false);
  // vraies statistiques de la boutique (avis, abonnés, visites des 30 derniers jours)
  const { stats, reload: reloadStats } = useSellerStats(30, 120_000);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setEmail(user.email ?? "");
      await ensureSellerProfile(user); // crée la fiche si elle n'existe pas encore
      const { data } = await supabase.from("seller_profiles").select("*").eq("id", user.id).maybeSingle();
      if (data) {
        const p = data as Profile;
        setProfile(p);
        const cats = (p.categories && p.categories.length > 0) ? p.categories : (p.category ? [p.category] : []);
        setForm({
          shop_name: p.shop_name || `${p.first_name ?? "Ma"} Boutique`,
          shop_description: p.shop_description || "",
          city: p.city || "",
          categories: cats,
        });
      }
      setLoading(false);
    })();
  }, []);

  const isEntreprise = profile?.account_type === "entreprise";

  async function uploadAsset(file: File, kind: "logo" | "banner") {
    if (!profile) return;
    if (!file.type.startsWith("image/")) { toast.error("Choisissez une image (JPG, PNG, WebP…)."); return; }
    if (file.size > MAX_IMAGE_BYTES) { toast.error(tooHeavyMessage()); return; }
    setUploading(kind);
    try {
      // redimensionnée et compressée avant l'envoi (couverture large, logo carré plus petit)
      file = await compressImage(file, kind === "banner" ? 2000 : 600);
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      // RLS exige que le 1er dossier == auth.uid()
      const path = `${profile.id}/shop-${kind}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("product-images").upload(path, file, { cacheControl: "31536000", contentType: file.type || "image/jpeg" });
      if (error) throw error;
      const { data: pub } = supabase.storage.from("product-images").getPublicUrl(path);
      const url = `${pub.publicUrl}?v=${Date.now()}`;
      const column = kind === "logo" ? "shop_logo_url" : "shop_banner_url";
      const { error: upErr } = await supabase.from("seller_profiles").upsert({ id: profile.id, [column]: url } as never);
      if (upErr) throw upErr;
      setProfile({ ...profile, [column]: url } as Profile);
      void reloadStats();
      toast.success(kind === "logo" ? "Logo mis à jour sur Amachia" : "Bannière mise à jour sur Amachia");
    } catch (e: any) {
      console.error("[upload]", e);
      toast.error(`Envoi de l'image impossible : ${e?.message || "erreur inconnue"}`);
    } finally {
      setUploading(null);
    }
  }

  async function saveInfos() {
    if (!profile) { toast.error("Profil vendeur introuvable : rechargez la page."); return; }
    const name = form.shop_name.trim();
    if (name.length < 2) { toast.error("Indiquez le nom de votre boutique (2 caractères minimum)."); return; }
    setSaving(true);
    try {
      const payload: any = {
        shop_name: name.slice(0, 80),
        shop_description: form.shop_description.trim().slice(0, 2000),
        city: form.city.trim() || null,
        categories: form.categories,
      };
      if (form.categories[0]) payload.category = form.categories[0];
      const { error } = await supabase.from("seller_profiles").upsert({ id: profile.id, ...payload } as never);
      if (error) throw error;
      setProfile({ ...profile, ...payload });
      setEditing(false);
      void reloadStats();
      toast.success("Boutique mise à jour : les changements sont visibles sur Amachia.");
    } catch (e: any) {
      console.error("[boutique]", e);
      toast.error(`Enregistrement impossible : ${e?.message || "erreur inconnue"}`);
    } finally {
      setSaving(false);
    }
  }

  function toggleCategory(cat: string) {
    setForm((f) => {
      if (isEntreprise) {
        return { ...f, categories: f.categories.includes(cat) ? f.categories.filter((c) => c !== cat) : [...f.categories, cat] };
      }
      return { ...f, categories: f.categories[0] === cat ? [] : [cat] };
    });
  }

  if (loading) {
    return (
      <DashboardLayout title="Ma Boutique" subtitle="Personnalisez et gérez votre vitrine">
        <div className="grid place-items-center py-20"><Loader2 className="animate-spin text-primary" /></div>
      </DashboardLayout>
    );
  }

  const cats = (profile?.categories && profile.categories.length > 0) ? profile.categories : (profile?.category ? [profile.category] : []);
  const location = [profile?.neighborhood, profile?.city, profile?.region].filter(Boolean).join(", ") || "Cameroun";
  const contactEmail = profile?.shop_email || email;
  const contactPhone = profile?.phone || "—";

  return (
    <DashboardLayout title="Ma Boutique" subtitle="Personnalisez et gérez votre vitrine">
      {/* Header card */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden mb-6">
        <div
          className="relative h-56 sm:h-64 md:h-80 bg-gradient-primary bg-center bg-cover"
          style={profile?.shop_banner_url ? { backgroundImage: `url(${imgUrl(profile.shop_banner_url, 1600)})` } : undefined}
        >
          <div className="absolute bottom-4 right-4 flex items-center gap-2">
            <span className="hidden md:inline px-3 py-1.5 rounded-full bg-black/60 backdrop-blur text-white text-[11px]">Recommandé : 1600 × 600 px (réduite automatiquement)</span>
            <button
              onClick={() => bannerInput.current?.click()}
              disabled={uploading === "banner"}
              className="px-4 py-2 rounded-full bg-black/60 backdrop-blur text-white text-sm flex items-center gap-2 hover:bg-black/80 disabled:opacity-50"
            >
              {uploading === "banner" ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
              Modifier la couverture
            </button>
          </div>
          <input
            ref={bannerInput} type="file" accept="image/*" className="hidden"
            onChange={(e) => { if (e.target.files?.[0]) uploadAsset(e.target.files[0], "banner"); e.target.value = ""; }}
          />
        </div>

        {/* Profile row — fixed overlap */}
        <div className="px-6 pb-6 pt-4 flex flex-col md:flex-row md:items-end gap-5">
          <div className="relative -mt-14 md:-mt-16 self-start md:self-auto">
            <div className="w-24 h-24 md:w-28 md:h-28 rounded-2xl bg-card border-4 border-card grid place-items-center overflow-hidden shadow-elegant relative">
              {profile?.shop_logo_url ? (
                <img {...imgProps(profile.shop_logo_url, { width: 128 })} alt="logo" className="w-full h-full object-cover" />
              ) : (
                <Store className="text-primary" size={40} />
              )}
              <button
                onClick={() => logoInput.current?.click()}
                disabled={uploading === "logo"}
                className="absolute top-1 right-1 w-7 h-7 rounded-full bg-primary/95 text-white grid place-items-center shadow-lg hover:scale-105 transition disabled:opacity-50"
                title="Modifier le logo"
                aria-label="Modifier le logo"
              >
                {uploading === "logo" ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />}
              </button>
            </div>
            <input
              ref={logoInput} type="file" accept="image/*" className="hidden"
              onChange={(e) => { if (e.target.files?.[0]) uploadAsset(e.target.files[0], "logo"); e.target.value = ""; }}
            />
            <p className="text-[10px] text-muted-foreground text-center mt-2">Logo carré 512×512 px</p>
          </div>

          <div className="flex-1 min-w-0 md:pt-3">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-2xl font-extrabold truncate">{profile?.shop_name || form.shop_name}</h2>
              {stats?.shop && (
                <a href={`${MARKETPLACE_URL}/seller/${stats.shop.slug}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary hover:bg-primary/25">
                  Voir sur Amachia <ExternalLink size={12} />
                </a>
              )}
            </div>
            <p className="text-muted-foreground text-sm mt-1">
              {(cats[0] || "Catégorie non définie")} • {location}
            </p>
            <div className="flex flex-wrap items-center gap-4 mt-2 text-sm">
              <span className="flex items-center gap-1">
                <Star size={14} className={stats?.rating ? "text-amber-400 fill-amber-400" : "text-muted-foreground"} />
                {stats?.rating ? `${String(stats.rating).replace(".", ",")} (${num(stats.reviews)} avis)` : "Pas encore d'avis"}
              </span>
              <span className="flex items-center gap-1 text-muted-foreground"><Eye size={14} /> {num(stats?.visits ?? 0)} visites (30 j)</span>
              <span className="flex items-center gap-1 text-muted-foreground"><Heart size={14} /> {num(stats?.followers ?? 0)} abonné{(stats?.followers ?? 0) > 1 ? "s" : ""}</span>
            </div>
          </div>

          <button
            onClick={() => setEditing(true)}
            className="px-5 py-2.5 rounded-full bg-gradient-primary text-black text-sm font-semibold flex items-center gap-2 self-start md:self-auto"
          >
            <Edit size={14} /> Modifier
          </button>
        </div>
      </div>

      {/* Info grid */}
      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-card border border-border rounded-2xl p-6">
          <h3 className="font-bold mb-4">Description</h3>
          <p className="text-muted-foreground text-sm leading-relaxed whitespace-pre-line">
            {profile?.shop_description?.trim() || "Aucune description pour le moment. Cliquez sur Modifier pour présenter votre boutique."}
          </p>
          <h3 className="font-bold mt-6 mb-4">
            Catégorie{cats.length > 1 ? "s" : ""} {isEntreprise && <span className="text-xs font-normal text-muted-foreground">(Entreprise : illimité)</span>}
          </h3>
          {cats.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {cats.map((c) => (
                <span key={c} className="px-3 py-1.5 rounded-full bg-secondary text-sm">{c}</span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Aucune catégorie sélectionnée.</p>
          )}
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
          <h3 className="font-bold">Contact</h3>
          <div className="flex items-start gap-3 text-sm"><MapPin size={16} className="text-primary mt-0.5" /> <span className="break-words">{location}</span></div>
          <div className="flex items-center gap-3 text-sm"><Phone size={16} className="text-primary" /> {contactPhone}</div>
          <div className="flex items-center gap-3 text-sm break-all"><Mail size={16} className="text-primary shrink-0" /> {contactEmail}</div>
          <p className="text-xs text-muted-foreground pt-2 border-t border-border">
            Ces informations sont synchronisées avec votre page <span className="font-semibold">Paramètres</span>.
          </p>
        </div>
      </div>

      <PickupCard />

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-center p-4" onClick={() => setEditing(false)}>
          <div className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-border sticky top-0 bg-card">
              <h3 className="font-bold text-lg">Modifier ma boutique</h3>
              <button onClick={() => setEditing(false)} className="w-8 h-8 grid place-items-center rounded-full hover:bg-secondary"><X size={16} /></button>
            </div>
            <div className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-semibold mb-2">Nom de la boutique</label>
                <input
                  value={form.shop_name} onChange={(e) => setForm({ ...form, shop_name: e.target.value })}
                  className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Ville</label>
                <input
                  value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })}
                  placeholder="Ex. Yaoundé, Douala…"
                  className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Description</label>
                <textarea
                  value={form.shop_description} onChange={(e) => setForm({ ...form, shop_description: e.target.value })}
                  rows={5}
                  placeholder="Présentez votre boutique en quelques lignes…"
                  className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">
                  Catégorie{isEntreprise ? "s" : ""} {!isEntreprise && <span className="text-xs font-normal text-muted-foreground">(Particulier : 1 seule)</span>}
                </label>
                <div className="flex flex-wrap gap-2">
                  {ALL_CATEGORIES.map((c) => {
                    const active = form.categories.includes(c);
                    return (
                      <button
                        key={c} type="button" onClick={() => toggleCategory(c)}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition flex items-center gap-1 ${active ? "bg-primary text-black border-primary" : "bg-secondary border-border hover:border-primary/50"}`}
                      >
                        {active && <Check size={12} />} {c}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-6 border-t border-border sticky bottom-0 bg-card">
              <button onClick={() => setEditing(false)} className="px-5 py-2.5 rounded-full bg-secondary text-sm font-semibold">Annuler</button>
              <button onClick={saveInfos} disabled={saving} className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-primary text-black text-sm font-semibold disabled:opacity-60">
                {saving && <Loader2 size={14} className="animate-spin" />} {saving ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

type Pickup = { lat: number | null; lng: number | null; address: string | null; updated_at: string | null; city: string | null };

/** Point de retrait : les commandes de la boutique sont proposées en priorité aux livreurs les plus proches de cette position. */
function PickupCard() {
  const [pk, setPk] = useState<Pickup | null>(null);
  const [loading, setLoading] = useState(true);
  const [pos, setPos] = useState<{ lat: number; lng: number; acc: number } | null>(null);
  const [address, setAddress] = useState("");
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data } = await supabase.rpc("seller_pickup" as never);
    const v = (data ?? null) as Pickup | null;
    setPk(v); setAddress(v?.address ?? ""); setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const locate = () => {
    if (!navigator.geolocation) return toast.error("La localisation n'est pas disponible sur cet appareil.");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { setPos({ lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy) }); setLocating(false); },
      (e) => { setLocating(false); toast.error(e.code === 1 ? "Autorisez la localisation dans votre navigateur pour enregistrer la position de la boutique." : "Position introuvable. Réessayez à l'extérieur ou près d'une fenêtre."); },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  };
  const save = async () => {
    const lat = pos?.lat ?? pk?.lat, lng = pos?.lng ?? pk?.lng;
    if (lat == null || lng == null) return toast.error("Utilisez d'abord votre position actuelle, depuis la boutique.");
    setSaving(true);
    const { error } = await supabase.rpc("seller_set_pickup" as never, { _lat: lat, _lng: lng, _address: address.trim() || null } as never);
    setSaving(false);
    if (error) return toast.error(error.message.replace(/^.*?:\s(?=[A-ZÀ-Ü])/, ""));
    toast.success("Point de retrait enregistré", { description: "Vos commandes seront proposées aux livreurs les plus proches." });
    setPos(null); void load();
  };

  const shown = pos ?? (pk?.lat != null && pk?.lng != null ? { lat: pk.lat, lng: pk.lng, acc: 0 } : null);
  const osm = shown ? `https://www.openstreetmap.org/?mlat=${shown.lat}&mlon=${shown.lng}#map=17/${shown.lat}/${shown.lng}` : null;
  const map = shown ? `https://www.openstreetmap.org/export/embed.html?bbox=${shown.lng - 0.004},${shown.lat - 0.003},${shown.lng + 0.004},${shown.lat + 0.003}&layer=mapnik&marker=${shown.lat},${shown.lng}` : null;

  return (
    <div className="mt-5 bg-card border border-border rounded-2xl p-4 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary"><Bike size={20} /></span>
        <div className="min-w-0">
          <h3 className="font-bold">Position de ma boutique (point de retrait)</h3>
          <p className="text-sm text-muted-foreground">Les livreurs viennent récupérer vos colis ici. Chaque nouvelle commande est proposée d'abord au livreur le plus proche de cette position, ce qui accélère vos livraisons.</p>
        </div>
      </div>
      {loading ? <div className="mt-4 h-24 animate-pulse rounded-xl bg-secondary" /> : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            {pk?.lat == null && !pos && <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">Position non renseignée : vos commandes sont proposées à tous les livreurs de la ville, ce qui peut être plus lent.</p>}
            {pk?.lat != null && !pos && <p className="flex items-center gap-2 text-sm"><Check size={16} className="text-green-600" />Position enregistrée{pk.updated_at ? ` le ${new Date(pk.updated_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}` : ""}</p>}
            {pos && <p className="text-sm text-muted-foreground">Nouvelle position détectée (précision ± {pos.acc} m). Vérifiez la carte puis enregistrez.</p>}
            <button type="button" onClick={locate} disabled={locating} className="flex h-11 w-full items-center justify-center gap-2 rounded-full border border-border bg-secondary text-sm font-semibold disabled:opacity-60">
              {locating ? <Loader2 size={16} className="animate-spin" /> : <LocateFixed size={16} className="text-primary" />}Utiliser ma position actuelle (dans la boutique)
            </button>
            <label className="block text-sm font-medium">Repère pour le livreur
              <input value={address} onChange={(e) => setAddress(e.target.value)} maxLength={200} placeholder="Ex. Marché Mokolo, porte 3, face pharmacie" className="mt-1.5 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary" />
            </label>
            <button type="button" onClick={() => void save()} disabled={saving || (!shown)} className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-bold text-black disabled:opacity-50">
              {saving && <Loader2 size={16} className="animate-spin" />}Enregistrer le point de retrait
            </button>
          </div>
          {map ? (
            <div className="overflow-hidden rounded-xl border border-border">
              <iframe title="Position de la boutique" src={map} className="h-56 w-full" loading="lazy" />
              {osm && <a href={osm} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1 py-2 text-xs font-semibold text-primary">Agrandir la carte <ExternalLink size={12} /></a>}
            </div>
          ) : <div className="grid h-56 place-items-center rounded-xl border border-dashed border-border text-center text-sm text-muted-foreground"><span className="flex flex-col items-center gap-2 px-6"><MapPin size={22} />La carte s'affichera une fois la position détectée.</span></div>}
        </div>
      )}
    </div>
  );
}
