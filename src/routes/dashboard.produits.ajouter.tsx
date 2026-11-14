import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { imgProps } from "@/lib/img";
import { useEffect, useRef, useState } from "react";
import { DashboardLayout } from "@/components/seller/dashboard/DashboardLayout";
import { ArrowLeft, ArrowRight, Upload, X, Check, Package, Layers, Cloud, Boxes, Plus, Trash2, FileText, TrendingUp, ChevronLeft, ChevronRight, Star, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { RichTextEditor } from "@/components/seller/dashboard/RichTextEditor";
import { ColorPicker, ColorSwatch, colorParts } from "@/components/seller/dashboard/ColorPicker";
import { compressImage } from "@/lib/imageCompress";
import { AiSeoModal } from "@/components/seller/dashboard/AiSeoModal";
import { AiImageModal } from "@/components/seller/dashboard/AiImageModal";

type ProductSearch = { id?: string };

// Preset attributes with their default values
const ATTR_PRESETS: Record<string, { values: string[]; type: "text" | "color" | "size" }> = {
  "Taille": { values: ["XS", "S", "M", "L", "XL", "XXL", "3XL"], type: "size" },
  "Pointure": { values: ["36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46"], type: "size" },
  "Couleur": { values: [], type: "color" },
  "Matière": { values: ["Coton", "Polyester", "Cuir", "Soie", "Laine", "Lin", "Jean", "Nylon", "Velours"], type: "text" },
  "Style": { values: ["Casual", "Sport", "Élégant", "Vintage", "Moderne"], type: "text" },
  "Capacité": { values: ["32 Go", "64 Go", "128 Go", "256 Go", "512 Go", "1 To", "2 To"], type: "text" },
  "Mémoire RAM": { values: ["2 Go", "4 Go", "6 Go", "8 Go", "12 Go", "16 Go", "32 Go"], type: "text" },
  "Poids": { values: [], type: "text" },
  "Volume": { values: [], type: "text" },
  "Genre": { values: ["Homme", "Femme", "Unisexe", "Enfant"], type: "text" },
  "Personnalisé": { values: [], type: "text" },
};

export const Route = createFileRoute("/dashboard/produits/ajouter")({
  head: () => ({ meta: [{ title: "Ajouter un produit — Amashia Seller" }, { name: "description", content: "Ajouter un produit : votre espace vendeur Amashia pour gérer votre activité." }, { property: "og:title", content: "Ajouter un produit — Amashia Seller" }, { property: "og:description", content: "Ajouter un produit : votre espace vendeur Amashia pour gérer votre activité." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  validateSearch: (search: Record<string, unknown>): ProductSearch => ({
    id: typeof search.id === "string" ? search.id : undefined,
  }),
  component: AddProductPage,
});

/** L'attribut est-il une couleur (« Couleur », « Couleurs », « Color ») ? */
function isColorAttr(name: string) {
  return /^(couleurs?|colou?rs?)$/i.test(name.trim());
}

const inp = "w-full bg-background border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary";
const STEPS = ["Type", "Infos", "Médias", "Attributs", "Prix & Stock", "Aperçu"];
type ProductType = "simple" | "variable" | "virtual" | "bundle";
const TYPES = [
  { id: "simple", label: "Produit simple", desc: "Un seul SKU, prix fixe", icon: Package },
  { id: "variable", label: "Produit variable", desc: "Variantes (taille, couleur)", icon: Layers },
  { id: "virtual", label: "Produit virtuel", desc: "Téléchargeable / service", icon: Cloud },
  { id: "bundle", label: "Bundle / Pack", desc: "Plusieurs produits groupés", icon: Boxes },
] as const;

const SPEC_PRESETS: Record<string, string[]> = {
  "Électronique": ["Marque", "Modèle", "Mémoire RAM", "Stockage", "Processeur", "Écran", "Batterie", "Caméra", "Système d'exploitation", "Connectivité", "Garantie"],
  "Téléphones & Tablettes": ["Marque", "Modèle", "Mémoire RAM", "Stockage", "Écran", "Batterie", "Caméra", "OS", "Réseau", "Garantie"],
  "Ordinateurs": ["Marque", "Processeur", "RAM", "Stockage", "Carte graphique", "Écran", "Autonomie", "Système", "Garantie"],
  "Électroménager": ["Marque", "Modèle", "Puissance", "Capacité", "Consommation", "Dimensions", "Garantie"],
  "Mode": ["Marque", "Matière", "Coupe", "Saison", "Entretien", "Pays d'origine"],
  "Chaussures": ["Marque", "Pointure", "Matière", "Type de semelle", "Saison", "Entretien"],
  "Beauté": ["Marque", "Type de peau", "Volume", "Ingrédients", "Parfum", "Date de péremption"],
  "Maison & Décoration": ["Marque", "Dimensions", "Poids", "Matériau", "Couleur", "Style"],
  "Cuisine & Ustensiles": ["Marque", "Matière", "Capacité", "Dimensions", "Compatible lave-vaisselle"],
  "Alimentation": ["Marque", "Poids", "Ingrédients", "Date de péremption", "Conservation", "Origine"],
  "Bijoux & Accessoires": ["Matière", "Poids", "Pierre", "Longueur", "Certification"],
  "Bébé & Enfants": ["Marque", "Âge recommandé", "Matière", "Sécurité", "Entretien"],
  "Sport & Loisirs": ["Marque", "Matière", "Poids", "Dimensions", "Niveau"],
  "Automobile & Moto": ["Marque", "Modèle compatible", "Année", "Référence"],
  "Agriculture & Élevage": ["Marque", "Capacité", "Puissance", "Matériau", "Utilisation"],
  "Services": ["Durée", "Disponibilité", "Zone couverte"],
  "default": ["Marque", "Modèle", "Couleur", "Poids", "Dimensions", "Garantie"],
};

// Detect the product family from the TITLE to propose the right technical specs
const TITLE_SPECS: { re: RegExp; specs: string[] }[] = [
  { re: /(t[ée]l[ée]phone|smartphone|iphone|samsung galaxy|tecno|infinix|itel|redmi|xiaomi|oppo|huawei|pixel)/i, specs: ["Marque", "Modèle", "Mémoire RAM", "Stockage", "Écran", "Batterie", "Caméra", "Processeur", "OS", "Réseau", "Double SIM", "Garantie"] },
  { re: /(tablette|ipad)/i, specs: ["Marque", "Modèle", "Écran", "Mémoire RAM", "Stockage", "Batterie", "Connectivité", "OS", "Garantie"] },
  { re: /(ordinateur|laptop|pc portable|macbook|desktop)/i, specs: ["Marque", "Modèle", "Processeur", "RAM", "Stockage", "Carte graphique", "Écran", "Autonomie", "Système", "Poids", "Garantie"] },
  { re: /(t[ée]l[ée]vision|tv |smart tv|[ée]cran)/i, specs: ["Marque", "Modèle", "Taille d'écran", "Résolution", "Type de dalle", "Connectique", "Smart TV", "Garantie"] },
  { re: /(casque|[ée]couteur|airpods|enceinte|haut-parleur)/i, specs: ["Marque", "Modèle", "Type", "Autonomie", "Bluetooth", "Réduction de bruit", "Étanchéité", "Garantie"] },
  { re: /(montre|smartwatch)/i, specs: ["Marque", "Modèle", "Taille du boîtier", "Matière du bracelet", "Autonomie", "Étanchéité", "Capteurs", "Garantie"] },
  { re: /(chaussure|basket|sneaker|sandale|escarpin|nike|adidas|puma)/i, specs: ["Marque", "Modèle", "Pointure", "Matière", "Type de semelle", "Couleur", "Saison", "Entretien"] },
  { re: /(robe|chemise|t-shirt|pantalon|jean|veste|pull|jupe|costume|ensemble)/i, specs: ["Marque", "Matière", "Coupe", "Taille", "Couleur", "Saison", "Entretien", "Pays d'origine"] },
  { re: /(sac|valise|portefeuille|ceinture)/i, specs: ["Marque", "Matière", "Dimensions", "Capacité", "Nombre de compartiments", "Fermeture", "Couleur"] },
  { re: /(cr[èe]me|parfum|huile|savon|shampoing|maquillage|s[ée]rum)/i, specs: ["Marque", "Volume", "Type de peau", "Ingrédients", "Parfum", "Utilisation", "Date de péremption"] },
  { re: /(r[ée]frig[ée]rateur|cong[ée]lateur|machine [àa] laver|micro-onde|climatiseur|ventilateur|cuisini[èe]re|four)/i, specs: ["Marque", "Modèle", "Puissance", "Capacité", "Consommation", "Dimensions", "Installation", "Garantie"] },
  { re: /(mixeur|blender|bouilloire|ustensile|casserole|marmite|po[êe]le)/i, specs: ["Marque", "Matière", "Capacité", "Puissance", "Dimensions", "Compatible lave-vaisselle"] },
  { re: /(meuble|canap[ée]|table|chaise|lit|matelas|[ée]tag[èe]re)/i, specs: ["Marque", "Matériau", "Dimensions", "Poids", "Couleur", "Style", "Montage requis"] },
  { re: /(bijou|collier|bracelet|bague|boucle)/i, specs: ["Matière", "Pierre", "Longueur", "Poids", "Certification", "Couleur"] },
  { re: /(riz|huile|farine|sucre|caf[ée]|th[ée]|jus|miel|[ée]pice)/i, specs: ["Marque", "Poids", "Ingrédients", "Origine", "Conservation", "Date de péremption"] },
  { re: /(b[ée]b[ée]|jouet|couche|poussette|biberon)/i, specs: ["Marque", "Âge recommandé", "Matière", "Dimensions", "Sécurité", "Entretien"] },
  { re: /(v[ée]lo|ballon|halt[èe]re|tapis de course|sport)/i, specs: ["Marque", "Matière", "Poids", "Dimensions", "Niveau", "Garantie"] },
  { re: /(voiture|moto|pneu|batterie auto|pi[èe]ce)/i, specs: ["Marque", "Modèle compatible", "Année", "Référence", "Dimensions", "Garantie"] },
];

function specsForProduct(title: string, category?: string): string[] {
  const t = (title || "").toLowerCase();
  const hit = TITLE_SPECS.find((x) => x.re.test(t));
  if (hit) return hit.specs;
  return (category && SPEC_PRESETS[category]) || SPEC_PRESETS.default!;
}


// Example values adapted to each characteristic name (used as placeholders)
const SPEC_EXAMPLES: Record<string, string> = {
  "Marque": "Nike, Samsung, Apple…",
  "Modèle": "iPhone 15 Pro, Galaxy S24…",
  "Couleur": "Noir mat, Bleu, Rouge…",
  "Poids": "1.2 kg",
  "Dimensions": "20 × 15 × 5 cm",
  "Garantie": "12 mois",
  "Mémoire RAM": "8 Go",
  "RAM": "8 Go",
  "Stockage": "256 Go",
  "Capacité": "500 ml",
  "Processeur": "Intel Core i7, Snapdragon 8 Gen 3",
  "Écran": "6.7 pouces AMOLED 120 Hz",
  "Batterie": "5000 mAh",
  "Caméra": "50 MP + 12 MP + 10 MP",
  "Système d'exploitation": "Android 14, iOS 17",
  "OS": "Android 14",
  "Connectivité": "Wi-Fi 6, 5G, Bluetooth 5.3",
  "Réseau": "4G / 5G",
  "Carte graphique": "NVIDIA RTX 4060",
  "Autonomie": "10 heures",
  "Système": "Windows 11",
  "Puissance": "1200 W",
  "Consommation": "A+++",
  "Matière": "Coton, Cuir véritable…",
  "Coupe": "Slim, Regular, Oversize",
  "Saison": "Printemps / Été",
  "Entretien": "Lavage machine 30°C",
  "Pays d'origine": "Cameroun, France, Chine…",
  "Pointure": "36–46",
  "Type de semelle": "Caoutchouc antidérapant",
  "Type de peau": "Peau sèche, mixte, grasse",
  "Volume": "250 ml",
  "Ingrédients": "Aloe vera, Beurre de karité…",
  "Parfum": "Vanille, Fleur d'oranger",
  "Date de péremption": "12/2026",
  "Matériau": "Bois massif, Métal, Verre…",
  "Style": "Moderne, Vintage, Scandinave",
  "Compatible lave-vaisselle": "Oui / Non",
  "Conservation": "À l'abri de la lumière",
  "Origine": "Cameroun",
  "Pierre": "Diamant, Émeraude…",
  "Longueur": "45 cm",
  "Certification": "925 Silver, 18 carats",
  "Âge recommandé": "3–6 ans",
  "Sécurité": "Sans BPA, Norme CE",
  "Niveau": "Débutant, Intermédiaire, Pro",
  "Modèle compatible": "Toyota Corolla 2015–2020",
  "Année": "2020",
  "Référence": "REF-12345",
  "Utilisation": "Extérieur / Intérieur",
  "Durée": "1 heure",
  "Disponibilité": "Lun–Sam, 8h–18h",
  "Zone couverte": "Douala, Yaoundé",
};

/** prices : prix facultatif par valeur (ex. { "Noir": "15000" }) ; vide = prix de base du produit */
type Attr = { name: string; values: string[]; prices?: Record<string, string> };
type Spec = { name: string; value: string };
type Variant = { id: string; combo: Record<string, string>; price: string; stock: string; sku: string };
type BundleItem = { product_id?: string; name: string; qty: string };
type VFile = { name: string; url: string };
type VariantImageGroup = { id: string; label: string; color: string; images: string[] };


const fmtFCFA = (n: number | string) => {
  const v = Number(n || 0);
  if (!isFinite(v)) return "0";
  return new Intl.NumberFormat("fr-FR").format(Math.round(v));
};
const DRAFT_KEY = (id?: string) => `amashia-product-draft-${id || "new"}`;

function AddProductPage() {
  const navigate = useNavigate();
  const { id: editId } = useSearch({ from: "/dashboard/produits/ajouter" });
  const fileRef = useRef<HTMLInputElement>(null);
  const vfileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(0);
  const [type, setType] = useState<ProductType>("simple");
  const [form, setForm] = useState({ name: "", category: "", price: "", compare_at_price: "", purchase_price: "", stock: "", description: "", sku: "", status: "active" });
  const [images, setImages] = useState<{ file?: File; preview: string; existing?: boolean }[]>([]);
  const [attrs, setAttrs] = useState<Attr[]>([]);
  const [specs, setSpecs] = useState<Spec[]>([]);
  const [newAttr, setNewAttr] = useState({ name: "", values: "" });
  const [customAttrName, setCustomAttrName] = useState("");
  const [valueDraft, setValueDraft] = useState("");
  const [variantImages, setVariantImages] = useState<VariantImageGroup[]>([]);
  // Couleurs choisies dans l'attribut « Couleur » : une zone de photos par couleur
  const colorValues = attrs.filter((a) => isColorAttr(a.name)).flatMap((a) => a.values);
  const colorKey = colorValues.join("|");
  useEffect(() => {
    setVariantImages((prev) => {
      const next = colorValues.map((v) => {
        const existing = prev.find((g) => g.label.toLowerCase() === v.toLowerCase());
        const css = colorParts(v).css;
        return existing ?? { id: crypto.randomUUID(), label: v, color: css.startsWith("#") ? css : "", images: [] };
      });
      const same = next.length === prev.length && next.every((g, i) => g === prev[i]);
      return same ? prev : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorKey]);
  const [uploadingVI, setUploadingVI] = useState<string | null>(null);



  const [variants, setVariants] = useState<Variant[]>([]);
  const [bundleItems, setBundleItems] = useState<BundleItem[]>([]);
  const [virtualFiles, setVirtualFiles] = useState<VFile[]>([]);
  const [uploadingVF, setUploadingVF] = useState(false);
  const [saving, setSaving] = useState(false);
  const [myProducts, setMyProducts] = useState<{ id: string; name: string; price: number }[]>([]);
  const [autoSavedAt, setAutoSavedAt] = useState<Date | null>(null);
  const [dbDraftId, setDbDraftId] = useState<string | null>(editId ?? null);
  // Verrous anti-doublon : identifiant du brouillon connu immédiatement, création
  // en cours, et blocage de l'enregistrement auto pendant la publication.
  const draftIdRef = useRef<string | null>(editId ?? null);
  const draftInsertRef = useRef<Promise<void> | null>(null);
  const finalSavingRef = useRef(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiImgOpen, setAiImgOpen] = useState(false);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // Load existing for edit mode + load my products list (for bundle) + restore local draft
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: list } = await supabase.from("seller_products").select("id,name,price").eq("user_id", user.id).limit(100);
      setMyProducts((list as any) || []);
      if (editId) {
        const { data: p } = await supabase.from("seller_products").select("*").eq("id", editId).maybeSingle();
        if (p) {
          setType(((p as any).product_type || "simple") as ProductType);
          setForm({
            name: p.name || "", category: p.category || "", price: String(p.price ?? ""),
            compare_at_price: String((p as any).compare_at_price ?? ""),
            purchase_price: String((p as any).purchase_price ?? ""), stock: String(p.stock ?? ""),
            description: p.description || "", sku: p.sku || "", status: p.status === "draft" ? "active" : (p.status || "active"),
          });
          setImages(((p.images as string[]) || []).map((u: string) => ({ preview: u, existing: true })));
          setAttrs(((p as any).attributes as Attr[]) || []);
          setSpecs(((p as any).specifications as Spec[]) || []);
          setBundleItems(((p as any).bundle_items as BundleItem[]) || []);
          setVirtualFiles(((p as any).virtual_files as VFile[]) || []);
          setVariantImages(((p as any).variant_images as VariantImageGroup[]) || []);

        }
      } else {
        // New product: always start fresh. Existing drafts are accessible
        // from the products list (status = "draft"). Clear any stale local cache
        // to avoid re-hydrating an old draft and creating duplicate DB rows.
        try { localStorage.removeItem(DRAFT_KEY()); } catch { /* ignore */ }
      }
    })();
  }, [editId]);

  // Autosave draft to localStorage + DB (debounced) — persists as draft product
  // Only creates a DB draft once the name is meaningful (≥3 chars) to avoid ghost products.
  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const name = form.name.trim();
        const hasMeaningfulContent = name.length >= 3;
        if (!hasMeaningfulContent && !editId && !dbDraftId) return;
        if (!editId) localStorage.setItem(DRAFT_KEY(), JSON.stringify({ form, type, attrs, specs, bundleItems }));

        if (!hasMeaningfulContent) { setAutoSavedAt(new Date()); return; }
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const existingImages = images.filter((i) => i.existing).map((i) => i.preview);
        const payload: any = {
          user_id: user.id,
          name,
          category: form.category || null,
          price: Math.max(0, Number(form.price) || 0),
          compare_at_price: form.compare_at_price ? Math.max(0, Number(form.compare_at_price)) : null,
          purchase_price: form.purchase_price ? Math.max(0, Number(form.purchase_price)) : null,
          stock: Math.max(0, parseInt(form.stock || "0", 10) || 0),
          description: form.description || null,
          sku: form.sku || null,
          product_type: type,
          images: existingImages,
          attributes: attrs as any,
          specifications: specs as any,
          bundle_items: bundleItems as any,
          variant_images: variantImages as any,
          status: editId ? form.status : "draft",
        };
        if (finalSavingRef.current) return;
        if (draftInsertRef.current) await draftInsertRef.current; // une création est déjà en cours
        if (finalSavingRef.current) return;
        if (draftIdRef.current) {
          await supabase.from("seller_products").update(payload).eq("id", draftIdRef.current);
        } else {
          draftInsertRef.current = (async () => {
            const { data: created } = await supabase.from("seller_products").insert(payload).select("id").maybeSingle();
            if (created?.id) { draftIdRef.current = created.id; setDbDraftId(created.id); }
          })();
          try { await draftInsertRef.current; } finally { draftInsertRef.current = null; }
        }
        setAutoSavedAt(new Date());
      } catch { /* ignore */ }
    }, 2000);
    return () => clearTimeout(t);
  }, [form, type, attrs, specs, bundleItems, images, variantImages, editId, dbDraftId]);


  // Specs presets when category changes
  function suggestSpecs(silent = false) {
    const preset = specsForProduct(form.name, form.category);
    setSpecs((prev) => {
      const existing = new Set(prev.filter((s) => s.name).map((s) => s.name));
      const additions = preset.filter((n) => !existing.has(n)).map((name) => ({ name, value: "" }));
      if (!additions.length) return prev;
      return [...prev.filter((s) => s.name || s.value), ...additions];
    });
    if (!silent) toast.success("Caractéristiques adaptées au produit");
  }


  function addImages(files: FileList | null) {
    if (!files) return;
    const items = Array.from(files).slice(0, 5).map((file) => ({ file, preview: URL.createObjectURL(file) }));
    setImages((prev) => [...prev, ...items].slice(0, 8));
  }

  async function addVirtualFile(files: FileList | null) {
    if (!files || !files[0]) return;
    const f = files[0];
    if (f.size > 50 * 1024 * 1024) return toast.error("Fichier trop volumineux (50 Mo max)");
    setUploadingVF(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Connectez-vous");
      const path = `${user.id}/virtual-${Date.now()}-${f.name}`;
      const { error } = await supabase.storage.from("product-images").upload(path, f, { upsert: true });
      if (error) throw error;
      const { data: pub } = supabase.storage.from("product-images").getPublicUrl(path);
      setVirtualFiles([...virtualFiles, { name: f.name, url: pub.publicUrl }]);
      toast.success("Fichier ajouté");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUploadingVF(false);
    }
  }


  // Reçoit une COPIE des fichiers : le champ est vidé juste après la sélection,
  // ce qui viderait aussi la liste d'origine avant l'envoi.
  async function addVariantImages(groupId: string, files: File[]) {
    if (!files.length) return;
    setUploadingVI(groupId);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Connectez-vous");
      const urls: string[] = [];
      for (const f of files.slice(0, 6)) {
        if (!f.type.startsWith("image/")) continue;
        if (f.size > 30 * 1024 * 1024) { toast.error(`${f.name} dépasse 30 Mo`); continue; }
        const small = await compressImage(f, 1600);
        const ext = small.name.split(".").pop() || "jpg";
        const path = `${user.id}/variant-${groupId}-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error } = await supabase.storage.from("product-images").upload(path, small, { cacheControl: "31536000", contentType: small.type || "image/jpeg" });
        if (error) throw error;
        const { data: pub } = supabase.storage.from("product-images").getPublicUrl(path);
        urls.push(pub.publicUrl);
      }
      if (!urls.length) return;
      setVariantImages((prev) => prev.map((g) => (g.id === groupId ? { ...g, images: [...g.images, ...urls].slice(0, 8) } : g)));
      toast.success(`${urls.length} image(s) ajoutée(s)`);
    } catch (e: any) {
      toast.error(e.message || "Échec de l'envoi");
    } finally {
      setUploadingVI(null);
    }
  }


  function addAttr() {
    const name = (newAttr.name === "Personnalisé" ? customAttrName.trim() : newAttr.name).trim();
    const values = newAttr.values.split(",").map((s) => s.trim()).filter(Boolean);
    if (!name) return toast.error("Donnez un nom à l'attribut");
    if (!values.length) return toast.error("Ajoutez au moins une valeur");
    setAttrs((prev) => {
      const i = prev.findIndex((a) => a.name.toLowerCase() === name.toLowerCase());
      if (i >= 0) {
        const merged = Array.from(new Set([...prev[i]!.values, ...values]));
        return prev.map((a, j) => (j === i ? { ...a, name, values: merged } : a));
      }
      return [...prev, { name, values }];
    });
    setNewAttr({ name: "", values: "" });
    setCustomAttrName("");
    toast.success(`Attribut « ${name} » ajouté`);
  }

  function generateVariants() {
    if (attrs.length === 0) return;
    const combos: Record<string, string>[] = [{}];
    for (const a of attrs) {
      const next: Record<string, string>[] = [];
      for (const c of combos) for (const v of a.values) next.push({ ...c, [a.name]: v });
      combos.splice(0, combos.length, ...next);
    }
    setVariants(combos.map((c) => ({ id: crypto.randomUUID(), combo: c, price: form.price, stock: "0", sku: "" })));
    toast.success(`${combos.length} variantes générées`);
  }

  // Propose technical specs adapted to the product title when entering the Attributs step
  useEffect(() => {
    if (step === 3 && form.name.trim().length >= 3 && specs.length === 0) suggestSpecs(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, form.name]);

  const priceNum = Math.max(0, Number(form.price) || 0);

  const costNum = Math.max(0, Number(form.purchase_price) || 0);
  const compareNum = Math.max(0, Number(form.compare_at_price) || 0);
  const profit = Math.max(0, priceNum - costNum);
  const margin = priceNum > 0 ? ((profit / priceNum) * 100).toFixed(1) : "0";

  async function submit(asDraft = false) {
    if (!form.name || !form.price) return toast.error("Nom et prix requis");
    if (finalSavingRef.current) return; // double-clic sur « Publier »
    finalSavingRef.current = true;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Connectez-vous");

      const urls: string[] = [];
      for (const img of images) {
        if (img.existing) { urls.push(img.preview); continue; }
        if (!img.file) continue;
        const toSend = await compressImage(img.file, 1600);
        const ext = toSend.name.split(".").pop() || "jpg";
        const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: upErr } = await supabase.storage.from("product-images").upload(path, toSend, { cacheControl: "31536000", contentType: toSend.type || "image/jpeg" });
        if (!upErr) {
          const { data } = supabase.storage.from("product-images").getPublicUrl(path);
          urls.push(data.publicUrl);
        }
      }

      const payload: any = {
        user_id: user.id, name: form.name, description: form.description || null,
        price: priceNum, compare_at_price: form.compare_at_price ? Number(form.compare_at_price) : null,
        purchase_price: costNum, stock: Number(form.stock || 0),
        category: form.category || null, sku: form.sku || null,
        status: asDraft ? "draft" : form.status, images: urls,
        product_type: type, attributes: attrs, specifications: specs.filter((s) => s.name && s.value),
        bundle_items: bundleItems, virtual_files: virtualFiles, variant_images: variantImages,
      };

      // Le brouillon enregistré automatiquement pendant la saisie devient le
      // produit final (au lieu de créer un second produit en double).
      // attend la fin d'une éventuelle création de brouillon en cours, puis met à jour ce brouillon
      if (draftInsertRef.current) await draftInsertRef.current;
      const targetId = editId || draftIdRef.current || dbDraftId;
      if (targetId) {
        const { error } = await supabase.from("seller_products").update(payload).eq("id", targetId);
        if (error) throw error;
        toast.success(editId ? "Produit mis à jour" : asDraft ? "Brouillon enregistré" : "Produit publié !");
      } else {
        const { error } = await supabase.from("seller_products").insert(payload);
        if (error) throw error;
        toast.success(asDraft ? "Brouillon enregistré" : "Produit publié !");
      }
      try { localStorage.removeItem(DRAFT_KEY()); } catch { /* ignore */ }
      navigate({ to: "/dashboard/produits" });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      finalSavingRef.current = false;
      setSaving(false);
    }
  }

  const canNext = () => {
    if (step === 1) return !!form.name;
    if (step === 4) return !!form.price;
    return true;
  };

  return (
    <DashboardLayout title={editId ? "Modifier le produit" : "Ajouter un produit"} subtitle="Création en plusieurs étapes">
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <Link to="/dashboard/produits" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"><ArrowLeft size={16} /> Retour</Link>
        {!editId && (
          <div className="flex items-center gap-2 text-xs">
            {autoSavedAt ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-400 font-semibold"><Check size={12} /> Brouillon auto-enregistré · {autoSavedAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary text-muted-foreground">Auto-sauvegarde activée</span>
            )}
            <button
              type="button"
              onClick={() => { try { localStorage.removeItem(DRAFT_KEY()); } catch { /* ignore */ } setAutoSavedAt(null); toast.success("Brouillon local effacé"); }}
              className="px-3 py-1.5 rounded-full bg-secondary hover:bg-secondary/70 text-muted-foreground"
            >Effacer</button>
          </div>
        )}
      </div>

      <div className="bg-card border border-border rounded-2xl p-4 mb-6 overflow-x-auto">
        <div className="flex items-center gap-2 min-w-max">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <button onClick={() => setStep(i)} className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold ${i === step ? "bg-gradient-primary text-white" : i < step ? "bg-emerald-500/20 text-emerald-400" : "bg-secondary text-muted-foreground"}`}>
                {i < step ? <Check size={12} /> : <span className="w-4 h-4 grid place-items-center rounded-full bg-white/20 text-[10px]">{i + 1}</span>}
                {s}
              </button>
              {i < STEPS.length - 1 && <span className="text-muted-foreground">›</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {step === 0 && (
            <div className="bg-card border border-border rounded-2xl p-6">
              <h3 className="font-bold mb-4">Choisissez le type de produit</h3>
              <div className="grid sm:grid-cols-2 gap-3">
                {TYPES.map((t) => {
                  const Icon = t.icon; const active = type === t.id;
                  return (
                    <button key={t.id} onClick={() => setType(t.id as ProductType)} className={`p-4 rounded-2xl border text-left transition ${active ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`}>
                      <div className={`w-11 h-11 rounded-xl grid place-items-center mb-3 ${active ? "bg-gradient-primary text-white" : "bg-secondary"}`}><Icon size={20} /></div>
                      <p className="font-bold">{t.label}</p>
                      <p className="text-xs text-muted-foreground mt-1">{t.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <h3 className="font-bold">Informations générales</h3>
                <button
                  type="button"
                  onClick={() => setAiOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-primary text-white text-xs font-bold shadow-elegant hover:opacity-90"
                  title="Générer une fiche SEO optimisée par l'agent IA Amashia"
                >
                  <Sparkles size={14} /> Générer avec l'IA
                </button>
              </div>
              <p className="text-xs text-muted-foreground -mt-2">L'agent SEO génère titre, description à puces, mots-clés, meta et score de conversion.</p>
              <div><label className="block text-sm mb-2">Nom du produit *</label><input value={form.name} onChange={(e) => set("name", e.target.value)} className={inp} /></div>
              <div>
                <label className="block text-sm mb-2">Description</label>
                <RichTextEditor value={form.description} onChange={(v) => set("description", v)} placeholder="Décrivez votre produit... utilisez la barre pour formater, ajouter des listes, titres, etc." />
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div><label className="block text-sm mb-2">Catégorie</label>
                  <select value={form.category} onChange={(e) => set("category", e.target.value)} className={inp}>
                    <option value="">Sélectionner</option>
                    {Object.keys(SPEC_PRESETS).filter((k) => k !== "default").map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div><label className="block text-sm mb-2">SKU</label><input value={form.sku} onChange={(e) => set("sku", e.target.value)} className={inp} /></div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="bg-card border border-border rounded-2xl p-6">
                <h3 className="font-bold mb-1">Images du produit</h3>
                <p className="text-xs text-muted-foreground mb-4">La 1ʳᵉ image sert d'image principale. Utilisez les flèches pour réorganiser.</p>
                {images.length > 0 && (
                  <div className="grid grid-cols-3 md:grid-cols-4 gap-3 mb-4">
                    {images.map((img, i) => (
                      <div key={i} className="relative group border border-border rounded-xl overflow-hidden">
                        <img {...imgProps(img.preview, { width: 256 })} className="w-full aspect-square object-cover" />
                        {i === 0 && (
                          <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-primary text-white text-[10px] font-bold flex items-center gap-1"><Star size={10} /> Principale</span>
                        )}
                        <button type="button" onClick={() => setImages(images.filter((_, j) => j !== i))} className="absolute top-2 right-2 w-6 h-6 grid place-items-center rounded-full bg-destructive text-white opacity-90 hover:opacity-100"><X size={12} /></button>
                        <div className="absolute inset-x-0 bottom-0 flex justify-between p-1.5 bg-gradient-to-t from-black/70 to-transparent">
                          <button
                            type="button"
                            disabled={i === 0}
                            onClick={() => { const n = [...images];[n[i - 1], n[i]] = [n[i], n[i - 1]]; setImages(n); }}
                            className="w-7 h-7 grid place-items-center rounded-lg bg-white/90 text-black disabled:opacity-30 hover:bg-white"
                            title="Reculer d'une position"
                          ><ChevronLeft size={14} /></button>
                          <span className="text-white text-[10px] font-bold self-center">{i + 1}/{images.length}</span>
                          <button
                            type="button"
                            disabled={i === images.length - 1}
                            onClick={() => { const n = [...images];[n[i + 1], n[i]] = [n[i], n[i + 1]]; setImages(n); }}
                            className="w-7 h-7 grid place-items-center rounded-lg bg-white/90 text-black disabled:opacity-30 hover:bg-white"
                            title="Avancer d'une position"
                          ><ChevronRight size={14} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] items-stretch">
                  <button type="button" onClick={() => fileRef.current?.click()} className="w-full border-2 border-dashed border-border rounded-2xl p-10 text-center hover:border-primary transition cursor-pointer">
                    <Upload className="mx-auto mb-3 text-muted-foreground" size={32} />
                    <p className="font-semibold">Cliquez pour ajouter des images</p>
                    <p className="text-xs text-muted-foreground mt-1">PNG, JPG • 1000×1000 px recommandé (max 8)</p>
                  </button>
                  <button type="button" onClick={() => setAiImgOpen(true)} className="sm:w-52 rounded-2xl bg-gradient-primary text-white p-6 text-center font-semibold text-sm flex flex-col items-center justify-center gap-2 hover:opacity-90">
                    <Sparkles size={22} />
                    Générer avec l'IA
                    <span className="text-[11px] font-normal opacity-90">Vos photos sous les meilleurs angles</span>
                  </button>
                </div>
                <input ref={fileRef} type="file" multiple accept="image/*" hidden onChange={(e) => addImages(e.target.files)} />

              </div>

              {type === "virtual" && (
                <div className="bg-card border border-border rounded-2xl p-6">
                  <h3 className="font-bold mb-4 flex items-center gap-2"><FileText size={16} /> Fichiers téléchargeables</h3>
                  {virtualFiles.length > 0 && (
                    <div className="space-y-2 mb-4">
                      {virtualFiles.map((f, i) => (
                        <div key={i} className="flex items-center gap-3 border border-border rounded-xl p-3">
                          <FileText size={16} className="text-primary" />
                          <span className="flex-1 text-sm truncate">{f.name}</span>
                          <a href={f.url} target="_blank" className="text-xs text-primary">Voir</a>
                          <button onClick={() => setVirtualFiles(virtualFiles.filter((_, j) => j !== i))} className="text-destructive"><Trash2 size={14} /></button>
                        </div>
                      ))}
                    </div>
                  )}
                  <button type="button" disabled={uploadingVF} onClick={() => vfileRef.current?.click()} className="w-full border-2 border-dashed border-border rounded-2xl p-8 text-center hover:border-primary disabled:opacity-50">
                    <Upload className="mx-auto mb-2 text-muted-foreground" size={24} />
                    <p className="font-semibold text-sm">{uploadingVF ? "Upload en cours..." : "Ajouter un fichier (PDF, ZIP, MP3, etc. — max 50 Mo)"}</p>
                  </button>
                  <input ref={vfileRef} type="file" hidden onChange={(e) => addVirtualFile(e.target.files)} />
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              {/* Caractéristiques (specs) */}
              <div className="bg-card border border-border rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold">Caractéristiques techniques</h3>
                  <button onClick={() => suggestSpecs()} className="text-xs px-3 py-1.5 rounded-full bg-secondary font-semibold">⚡ Pré-remplir</button>
                </div>
                {specs.length === 0 && <p className="text-sm text-muted-foreground mb-3">Cliquez sur « Pré-remplir » pour charger les caractéristiques typiques de la catégorie « {form.category || "votre produit"} ».</p>}
                <div className="space-y-2">
                  {specs.map((s, i) => (
                    <div key={i} className="grid grid-cols-[1fr_1.5fr_auto] gap-2">
                      <input placeholder="Nom (ex: RAM)" value={s.name} onChange={(e) => setSpecs(specs.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} className={inp} />
                      <input placeholder={SPEC_EXAMPLES[s.name] ? `ex: ${SPEC_EXAMPLES[s.name]}` : "Valeur"} value={s.value} onChange={(e) => setSpecs(specs.map((x, j) => j === i ? { ...x, value: e.target.value } : x))} className={inp} />
                      <button onClick={() => setSpecs(specs.filter((_, j) => j !== i))} className="w-10 grid place-items-center rounded-xl bg-destructive/10 text-destructive"><Trash2 size={14} /></button>
                    </div>
                  ))}
                </div>
                <button onClick={() => setSpecs([...specs, { name: "", value: "" }])} className="mt-3 w-full py-2.5 rounded-xl border border-dashed border-border text-sm flex items-center justify-center gap-2"><Plus size={14} /> Ajouter une caractéristique</button>
              </div>

              {/* Attributs (variantes) */}
              {(type === "variable" || type === "simple") && (
                <div className="bg-card border border-border rounded-2xl p-6">
                  <h3 className="font-bold mb-4">Attributs {type === "variable" && <span className="text-xs text-primary font-normal">(génèrent les variantes)</span>}</h3>
                  {attrs.length > 0 && (
                    <div className="space-y-2 mb-4">
                      {attrs.map((a, i) => {
                        const setPrice = (v: string, price: string) =>
                          setAttrs(attrs.map((x, j) => (j === i ? { ...x, prices: { ...(x.prices ?? {}), [v]: price.replace(/[^0-9]/g, "") } } : x)));
                        const removeValue = (v: string) =>
                          setAttrs(attrs.flatMap((x, j) => {
                            if (j !== i) return [x];
                            const values = x.values.filter((y) => y !== v);
                            const prices = { ...(x.prices ?? {}) }; delete prices[v];
                            return values.length ? [{ ...x, values, prices }] : [];
                          }));
                        return (
                          <div key={i} className="border border-border rounded-xl p-3">
                            <div className="flex items-center gap-3">
                              <p className="flex-1 font-semibold text-sm">{a.name}</p>
                              <button onClick={() => setAttrs(attrs.filter((_, j) => j !== i))} className="w-7 h-7 grid place-items-center rounded-lg bg-destructive/10 text-destructive" aria-label={`Supprimer ${a.name}`}><Trash2 size={12} /></button>
                            </div>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">Prix différent pour une valeur ? Indiquez-le ; laissez vide pour garder le prix du produit{priceNum > 0 ? ` (${priceNum.toLocaleString("fr-FR")} FCFA)` : ""}.</p>
                            <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                              {a.values.map((v) => (
                                <div key={v} className="flex items-center gap-2 rounded-lg bg-secondary/60 py-1 pl-1.5 pr-1">
                                  {isColorAttr(a.name) ? <ColorSwatch value={v} size={18} /> : null}
                                  <span className="min-w-0 flex-1 truncate text-xs font-medium">{isColorAttr(a.name) ? colorParts(v).name : v}</span>
                                  <div className="relative w-28 shrink-0">
                                    <input
                                      inputMode="numeric"
                                      value={a.prices?.[v] ?? ""}
                                      onChange={(e) => setPrice(v, e.target.value)}
                                      placeholder={priceNum > 0 ? String(priceNum) : "Prix"}
                                      aria-label={`Prix pour ${v}`}
                                      className="h-8 w-full rounded-lg border border-border bg-background pl-2 pr-11 text-xs"
                                    />
                                    <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">FCFA</span>
                                  </div>
                                  <button onClick={() => removeValue(v)} className="grid h-6 w-6 shrink-0 place-items-center rounded text-muted-foreground hover:text-destructive" aria-label={`Retirer ${v}`}><X size={12} /></button>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {(() => {
                    const preset = ATTR_PRESETS[newAttr.name];
                    const isColor = preset?.type === "color";
                    const selected = newAttr.values ? newAttr.values.split(",").map(s => s.trim()).filter(Boolean) : [];
                    const toggle = (v: string) => {
                      const next = selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v];
                      setNewAttr({ ...newAttr, values: next.join(", ") });
                    };
                    const effName = newAttr.name === "Personnalisé" ? customAttrName.trim() : newAttr.name;
                    return (
                      <div className="space-y-3">
                        <div className="grid grid-cols-[1fr_auto] gap-2">
                          <select value={newAttr.name} onChange={(e) => { setNewAttr({ name: e.target.value, values: "" }); setCustomAttrName(""); }} className={inp}>
                            <option value="">— Sélectionner un attribut —</option>
                            {Object.keys(ATTR_PRESETS).map((n) => <option key={n} value={n}>{n}</option>)}
                          </select>
                          <button onClick={addAttr} disabled={!effName || !newAttr.values} className="px-4 rounded-xl bg-gradient-primary text-white text-sm font-semibold flex items-center gap-1 disabled:opacity-40"><Plus size={14} /> Ajouter</button>
                        </div>

                        {newAttr.name === "Personnalisé" && (
                          <input
                            autoFocus
                            placeholder="Nom de l'attribut personnalisé (ex : Taille, Parfum, Longueur…)"
                            value={customAttrName}
                            onChange={(e) => setCustomAttrName(e.target.value)}
                            className={inp}
                          />
                        )}

                        {newAttr.name && (
                          <div className="border border-border rounded-xl p-3 bg-background/50">
                            <p className="text-xs font-semibold mb-2 text-muted-foreground">Valeurs pour « {effName || "attribut personnalisé"} »</p>

                            {isColor && <ColorPicker selected={selected} onToggle={toggle} />}


                            {!isColor && preset && preset.values.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {preset.values.map((v) => {
                                  const on = selected.includes(v);
                                  return (
                                    <button key={v} type="button" onClick={() => toggle(v)} className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${on ? "border-primary bg-primary text-white" : "border-border hover:border-primary/50"}`}>
                                      {v}
                                    </button>
                                  );
                                })}
                              </div>
                            )}

                            {/* Live preview of the values entered */}
                            {!isColor && selected.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {selected.map((v) => (
                                  <span key={v} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold">
                                    {v}
                                    <button type="button" onClick={() => toggle(v)} className="text-destructive"><X size={11} /></button>
                                  </span>
                                ))}
                              </div>
                            )}

                            {!isColor && (
                              <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
                                <input
                                  value={valueDraft}
                                  onChange={(e) => setValueDraft(e.target.value)}
                                  placeholder={preset?.values.length ? "+ Ajouter une valeur personnalisée" : "Saisissez une valeur (ex : 42, Rouge, 500 ml)"}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      const v = valueDraft.trim();
                                      if (v && !selected.includes(v)) toggle(v);
                                      setValueDraft("");
                                    }
                                  }}
                                  className={inp}
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    const v = valueDraft.trim();
                                    if (!v) return;
                                    if (!selected.includes(v)) toggle(v);
                                    setValueDraft("");
                                  }}
                                  disabled={!valueDraft.trim()}
                                  className="px-4 rounded-xl bg-secondary text-sm font-semibold flex items-center gap-1 disabled:opacity-40"
                                >
                                  <Plus size={14} /> Valeur
                                </button>
                              </div>
                            )}
                          </div>
                        )}

                      </div>
                    );
                  })()}
                  {type === "variable" && attrs.length > 0 && (
                    <button onClick={generateVariants} className="mt-4 w-full py-2.5 rounded-xl bg-secondary text-sm font-semibold">Générer les variantes</button>
                  )}
                </div>
              )}

              {/* Images par couleur : uniquement si l'attribut « Couleur » est renseigné */}
              {colorValues.length > 0 && (
                <div className="bg-card border border-border rounded-2xl p-6">
                  <h3 className="font-bold mb-1">Images par couleur</h3>
                  <p className="text-xs text-muted-foreground mb-4">
                    Ajoutez les photos du produit dans chaque couleur. Sur Amashia, le client verra une vignette par couleur
                    et les photos changeront quand il choisit une couleur. Sans photo, la couleur s'affiche en pastille ronde.
                  </p>
                  <div className="space-y-3">
                    {variantImages.map((g) => (
                      <div key={g.id} className="border border-border rounded-xl p-3">
                        <div className="flex items-center gap-2 mb-3">
                          <ColorSwatch value={g.label} size={22} />
                          <span className="flex-1 min-w-0 truncate font-semibold text-sm">{colorParts(g.label).name}</span>
                          <span className="text-[11px] text-muted-foreground">{g.images.length} photo{g.images.length > 1 ? "s" : ""}</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {g.images.map((u) => (
                            <div key={u} className="relative w-20 h-20 rounded-xl overflow-hidden border border-border">
                              <img {...imgProps(u, { width: 128 })} alt={g.label} className="w-full h-full object-cover" />
                              <button
                                onClick={() => setVariantImages((prev) => prev.map((x) => x.id === g.id ? { ...x, images: x.images.filter((i) => i !== u) } : x))}
                                className="absolute top-1 right-1 w-5 h-5 grid place-items-center rounded-full bg-destructive text-white"
                                aria-label="Retirer la photo"
                              >
                                <X size={10} />
                              </button>
                            </div>
                          ))}
                          <label className="w-20 h-20 rounded-xl border border-dashed border-border grid place-items-center cursor-pointer text-muted-foreground hover:border-primary hover:text-primary transition">
                            {uploadingVI === g.id ? (
                              <span className="text-[10px]">Envoi…</span>
                            ) : (
                              <span className="flex flex-col items-center gap-1"><Upload size={16} /><span className="text-[10px]">Ajouter</span></span>
                            )}
                            <input type="file" accept="image/*" multiple className="hidden" disabled={uploadingVI === g.id} onChange={(e) => { const picked = Array.from(e.currentTarget.files ?? []); e.currentTarget.value = ""; void addVariantImages(g.id, picked); }} />
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}



              {type === "variable" && variants.length > 0 && (
                <div className="bg-card border border-border rounded-2xl p-6">
                  <h3 className="font-bold mb-4">Variantes ({variants.length})</h3>
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {variants.map((v, i) => (
                      <div key={v.id} className="border border-border rounded-xl p-3 grid grid-cols-[1fr_auto_auto] gap-2 items-center text-sm">
                        <div className="text-xs">{Object.entries(v.combo).map(([k, val]) => `${k}: ${val}`).join(" / ")}</div>
                        <input placeholder="Prix" value={v.price} onChange={(e) => setVariants(variants.map((x, j) => j === i ? { ...x, price: e.target.value } : x))} className="w-24 bg-background border border-border rounded-lg px-2 py-1.5 text-xs" />
                        <input placeholder="Stock" value={v.stock} onChange={(e) => setVariants(variants.map((x, j) => j === i ? { ...x, stock: e.target.value } : x))} className="w-20 bg-background border border-border rounded-lg px-2 py-1.5 text-xs" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {type === "bundle" && (
                <div className="bg-card border border-border rounded-2xl p-6">
                  <h3 className="font-bold mb-1">Composition du pack</h3>
                  <p className="text-xs text-muted-foreground mb-4">Sélectionnez des produits de votre catalogue ou ajoutez-en manuellement.</p>
                  {bundleItems.map((b, i) => (
                    <div key={i} className="grid grid-cols-[1fr_80px_auto] gap-2 mb-2">
                      {myProducts.length > 0 ? (
                        <select value={b.product_id || ""} onChange={(e) => {
                          const p = myProducts.find((x) => x.id === e.target.value);
                          setBundleItems(bundleItems.map((x, j) => j === i ? { ...x, product_id: e.target.value, name: p?.name || x.name } : x));
                        }} className={inp}>
                          <option value="">— Saisir manuellement —</option>
                          {myProducts.map((p) => <option key={p.id} value={p.id}>{p.name} ({fmtFCFA(p.price)} FCFA)</option>)}
                        </select>
                      ) : (
                        <input placeholder="Nom du produit" value={b.name} onChange={(e) => setBundleItems(bundleItems.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} className={inp} />
                      )}
                      {!b.product_id && <input placeholder="Nom" value={b.name} onChange={(e) => setBundleItems(bundleItems.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} className={inp + " col-span-1"} />}
                      <input type="number" placeholder="Qté" value={b.qty} onChange={(e) => setBundleItems(bundleItems.map((x, j) => j === i ? { ...x, qty: e.target.value } : x))} className={inp} />
                      <button onClick={() => setBundleItems(bundleItems.filter((_, j) => j !== i))} className="w-10 grid place-items-center rounded-xl bg-destructive/10 text-destructive"><Trash2 size={14} /></button>
                    </div>
                  ))}
                  <button onClick={() => setBundleItems([...bundleItems, { name: "", qty: "1" }])} className="w-full py-2.5 rounded-xl border border-dashed border-border text-sm flex items-center justify-center gap-2"><Plus size={14} /> Ajouter au pack</button>
                </div>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
              <h3 className="font-bold">Prix & Stock</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm mb-2">Prix de vente (FCFA) *</label>
                  <input type="number" value={form.price} onChange={(e) => set("price", e.target.value)} className={inp} />
                  <p className="text-[11px] text-muted-foreground mt-1">Prix affiché et payé par le client.</p>
                </div>
                <div>
                  <label className="block text-sm mb-2">Prix normal (FCFA)</label>
                  <input type="number" value={form.compare_at_price} onChange={(e) => set("compare_at_price", e.target.value)} className={inp} placeholder="Optionnel" />
                  <p className="text-[11px] text-muted-foreground mt-1">Affiché <span className="line-through">barré</span> à côté du prix de vente pour montrer la réduction.</p>
                </div>
              </div>

              {form.compare_at_price && Number(form.compare_at_price) > priceNum && priceNum > 0 && (
                <div className="rounded-xl p-3 bg-primary/10 border border-primary/30 text-sm">
                  <span className="text-muted-foreground line-through mr-2">{fmtFCFA(form.compare_at_price)} FCFA</span>
                  <span className="font-bold text-primary">{fmtFCFA(priceNum)} FCFA</span>
                  <span className="ml-2 px-2 py-0.5 rounded-full bg-primary text-white text-xs font-bold">
                    -{Math.round((1 - priceNum / Number(form.compare_at_price)) * 100)}%
                  </span>
                </div>
              )}

              <div className="border-t border-border pt-4">
                <label className="block text-sm mb-2">Prix d'achat (FCFA)</label>
                <input type="number" value={form.purchase_price} onChange={(e) => set("purchase_price", e.target.value)} className={inp} />
                <p className="text-[11px] text-muted-foreground mt-1">Sert au calcul automatique de vos bénéfices et de la marge.</p>
              </div>

              {priceNum > 0 && costNum > 0 && (
                <div className="rounded-xl p-4 bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-3">
                  <TrendingUp className="text-emerald-400" size={20} />
                  <div className="flex-1 text-sm">
                    <p className="font-bold text-emerald-400">Bénéfice estimé : {fmtFCFA(profit)} FCFA</p>
                    <p className="text-xs text-muted-foreground">Marge : {margin}%</p>
                  </div>
                </div>
              )}
              {type !== "virtual" && <div><label className="block text-sm mb-2">Quantité en stock</label><input type="number" value={form.stock} onChange={(e) => set("stock", e.target.value)} className={inp} /></div>}
              <div><label className="block text-sm mb-2">Statut</label>
                <select value={form.status} onChange={(e) => set("status", e.target.value)} className={inp}>
                  <option value="active">Actif (publié)</option><option value="draft">Brouillon</option>
                </select>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
              <h3 className="font-bold mb-2">Vérification & bénéfices</h3>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-secondary rounded-xl p-3"><p className="text-xs text-muted-foreground">Prix de vente</p><p className="font-bold text-primary">{fmtFCFA(priceNum)} FCFA</p></div>
                <div className="bg-secondary rounded-xl p-3"><p className="text-xs text-muted-foreground">Prix d'achat</p><p className="font-bold">{fmtFCFA(costNum)} FCFA</p></div>
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3"><p className="text-xs text-muted-foreground">Bénéfice ({margin}%)</p><p className="font-bold text-emerald-400">{fmtFCFA(profit)} FCFA</p></div>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <button onClick={() => submit(false)} disabled={saving} className="flex-1 py-3.5 rounded-full bg-gradient-primary text-white font-semibold shadow-elegant disabled:opacity-50">
                  {saving ? "Enregistrement..." : editId ? "Mettre à jour" : "Publier le produit"}
                </button>
                <button onClick={() => submit(true)} disabled={saving} className="flex-1 py-3.5 rounded-full bg-secondary font-semibold disabled:opacity-50">Brouillon</button>
              </div>
            </div>
          )}

          <div className="flex justify-between">
            <button disabled={step === 0} onClick={() => setStep(step - 1)} className="px-5 py-2.5 rounded-full bg-secondary text-sm font-semibold disabled:opacity-40 flex items-center gap-2"><ArrowLeft size={14} /> Précédent</button>
            {step < STEPS.length - 1 && (
              <button disabled={!canNext()} onClick={() => setStep(step + 1)} className="px-5 py-2.5 rounded-full bg-gradient-primary text-white text-sm font-semibold disabled:opacity-40 flex items-center gap-2">Suivant <ArrowRight size={14} /></button>
            )}
          </div>
        </div>

        {/* Live preview */}
        <div className="lg:sticky lg:top-6 lg:self-start space-y-4">
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="aspect-square bg-secondary relative">
              {images[0] ? <img {...imgProps(images[0].preview, { width: 384 })} className="w-full h-full object-cover" /> : <div className="w-full h-full grid place-items-center text-muted-foreground text-sm">Aperçu image</div>}
              <span className="absolute top-3 left-3 px-3 py-1 rounded-full bg-primary text-white text-xs font-bold">{type}</span>
            </div>
            <div className="p-4 space-y-2">
              <p className="font-bold">{form.name || "Nom du produit"}</p>
              {form.category && <p className="text-xs text-muted-foreground">{form.category}</p>}
              <div className="flex items-baseline gap-2 flex-wrap">
                <p className="text-2xl font-extrabold text-primary">{priceNum ? fmtFCFA(priceNum) + " FCFA" : "—"}</p>
                {form.compare_at_price && Number(form.compare_at_price) > priceNum && (
                  <span className="text-sm text-muted-foreground line-through">{fmtFCFA(form.compare_at_price)} FCFA</span>
                )}
              </div>
              {specs.filter((s) => s.name && s.value).length > 0 && (
                <div className="pt-2 border-t border-border">
                  <p className="text-xs font-semibold mb-1">Caractéristiques</p>
                  <ul className="text-[11px] text-muted-foreground space-y-0.5">
                    {specs.filter((s) => s.name && s.value).slice(0, 5).map((s, i) => <li key={i}><span className="text-foreground">{s.name}:</span> {s.value}</li>)}
                  </ul>
                </div>
              )}
            </div>
          </div>
          {priceNum > 0 && costNum > 0 && (
            <div className="bg-card border border-border rounded-2xl p-4">
              <p className="text-xs font-semibold mb-2 flex items-center gap-1"><TrendingUp size={12} /> Analytique bénéfices</p>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-muted-foreground">Bénéfice unitaire</span><span className="font-bold text-emerald-400">{fmtFCFA(profit)} FCFA</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Marge</span><span className="font-bold">{margin}%</span></div>
              </div>
            </div>
          )}
        </div>
      </div>
      {aiOpen && (
        <AiSeoModal
          initialName={form.name}
          initialCategory={form.category}
          initialPrice={form.price}
          specs={specs}
          attributes={attrs.map((x) => ({ name: x.name, values: x.values.map((v) => (isColorAttr(x.name) ? colorParts(v).name : v)) }))}
          currentDescription={form.description}
          onClose={() => setAiOpen(false)}
          onApply={({ name, description }) => setForm((f) => ({ ...f, name, description }))}
        />
      )}
      {aiImgOpen && (
        <AiImageModal
          productName={form.name}
          category={form.category}
          description={form.description}
          formImages={images}
          onFormImageUploaded={(preview, url) => setImages((prev) => prev.map((img) => (img.preview === preview ? { preview: url, existing: true } : img)))}
          onAddUrls={(urls) => setImages((prev) => [...prev, ...urls.filter((u) => !prev.some((p) => p.preview === u)).map((u) => ({ preview: u, existing: true }))].slice(0, 8))}
          onClose={() => setAiImgOpen(false)}
        />
      )}
    </DashboardLayout>
  );
}
