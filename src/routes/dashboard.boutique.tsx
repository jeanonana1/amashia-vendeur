import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { DashboardLayout } from "@/components/seller/dashboard/DashboardLayout";
import { Store, MapPin, Phone, Mail, Star, Eye, Heart, Edit, Camera, Loader2, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/boutique")({
  head: () => ({ meta: [{ title: "Ma Boutique — Amashia Seller" }, { name: "description", content: "Ma Boutique : votre espace vendeur Amashia pour gérer votre activité." }, { property: "og:title", content: "Ma Boutique — Amashia Seller" }, { property: "og:description", content: "Ma Boutique : votre espace vendeur Amashia pour gérer votre activité." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
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
    categories: [] as string[],
  });

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setEmail(user.email ?? "");
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      if (data) {
        const p = data as Profile;
        setProfile(p);
        const cats = (p.categories && p.categories.length > 0) ? p.categories : (p.category ? [p.category] : []);
        setForm({
          shop_name: p.shop_name || `${p.first_name ?? "Ma"} Boutique`,
          shop_description: p.shop_description || "",
          categories: cats,
        });
      }
      setLoading(false);
    })();
  }, []);

  const isEntreprise = profile?.account_type === "entreprise";

  async function uploadAsset(file: File, kind: "logo" | "banner") {
    if (!profile) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Image trop lourde (5 Mo max)"); return; }
    setUploading(kind);
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      // RLS exige que le 1er dossier == auth.uid()
      const path = `${profile.id}/shop-${kind}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("product-images").upload(path, file, { upsert: true, cacheControl: "3600", contentType: file.type });
      if (error) throw error;
      const { data: pub } = supabase.storage.from("product-images").getPublicUrl(path);
      const url = `${pub.publicUrl}?v=${Date.now()}`;
      const column = kind === "logo" ? "shop_logo_url" : "shop_banner_url";
      const { error: upErr } = await supabase.from("profiles").update({ [column]: url } as any).eq("id", profile.id);
      if (upErr) throw upErr;
      setProfile({ ...profile, [column]: url } as Profile);
      toast.success(kind === "logo" ? "Logo mis à jour" : "Bannière mise à jour");
    } catch (e: any) {
      console.error("[upload]", e);
      toast.error(e?.message || "Échec de l'upload");
    } finally {
      setUploading(null);
    }
  }

  async function saveInfos() {
    if (!profile) return;
    try {
      const payload: any = {
        shop_name: form.shop_name,
        shop_description: form.shop_description,
        categories: form.categories,
      };
      if (!isEntreprise && form.categories[0]) payload.category = form.categories[0];
      const { error } = await supabase.from("profiles").update(payload).eq("id", profile.id);
      if (error) throw error;
      setProfile({ ...profile, ...payload });
      setEditing(false);
      toast.success("Boutique mise à jour");
    } catch (e: any) {
      toast.error(e.message || "Erreur");
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
          className="relative h-48 md:h-56 bg-gradient-primary bg-center bg-cover"
          style={profile?.shop_banner_url ? { backgroundImage: `url(${profile.shop_banner_url})` } : undefined}
        >
          <div className="absolute bottom-4 right-4 flex items-center gap-2">
            <span className="hidden md:inline px-3 py-1.5 rounded-full bg-black/60 backdrop-blur text-white text-[11px]">Recommandé : 1600 × 480 px • &lt; 5 Mo</span>
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
                <img src={profile.shop_logo_url} alt="logo" className="w-full h-full object-cover" />
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

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-2xl font-extrabold truncate">{profile?.shop_name || form.shop_name}</h2>
              <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-semibold">Vérifiée</span>
            </div>
            <p className="text-muted-foreground text-sm mt-1">
              {(cats[0] || "Catégorie non définie")} • {location}
            </p>
            <div className="flex flex-wrap items-center gap-4 mt-2 text-sm">
              <span className="flex items-center gap-1"><Star size={14} className="text-amber-400 fill-amber-400" /> 4.8 (235 avis)</span>
              <span className="flex items-center gap-1 text-muted-foreground"><Eye size={14} /> 12.5k vues</span>
              <span className="flex items-center gap-1 text-muted-foreground"><Heart size={14} /> 1.2k abonnés</span>
            </div>
          </div>

          <button
            onClick={() => setEditing(true)}
            className="px-5 py-2.5 rounded-full bg-gradient-primary text-white text-sm font-semibold flex items-center gap-2 self-start md:self-auto"
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
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition flex items-center gap-1 ${active ? "bg-primary text-white border-primary" : "bg-secondary border-border hover:border-primary/50"}`}
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
              <button onClick={saveInfos} className="px-5 py-2.5 rounded-full bg-gradient-primary text-white text-sm font-semibold">Enregistrer</button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
