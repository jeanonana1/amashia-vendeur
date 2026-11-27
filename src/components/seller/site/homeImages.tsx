/**
 * Photos de la page d'accueil vendeur, choisies depuis l'admin (Avis vendeurs › Images de l'accueil).
 * Un emplacement sans photo n'affiche rien : la page garde son design actuel.
 * Aperçu des emplacements vides : ajouter ?apercu=images à l'adresse de la page.
 */
import { createContext, useContext, useEffect, useState } from "react";
import { imgProps } from "@/lib/img";

export type HomeImageSlot = "hero" | "etape1" | "etape2" | "etape3" | "etape4" | "prime" | "avis" | "cta";
export type HomeImages = Partial<Record<HomeImageSlot, { url: string; alt?: string }>>;

/** Libellés des emplacements (aperçu et admin). */
export const SLOT_LABELS: Record<HomeImageSlot, string> = {
  hero: "En-tête : vendeur·se dans sa boutique, téléphone en main",
  etape1: "Étape 1 : création du compte sur téléphone",
  etape2: "Étape 2 : photo d'un produit pour le publier",
  etape3: "Étape 3 : préparation du colis",
  etape4: "Étape 4 : paiement reçu (Mobile Money)",
  prime: "Livraison Prime : livreur à moto récupérant un colis",
  avis: "Avis : vendeur·se souriant·e dans sa boutique",
  cta: "Dernier appel : remise d'un colis Amachia à un client",
};

/** Lecture des photos (au rendu serveur et dans le navigateur) : jamais bloquant. */
export async function loadHomeImages(): Promise<HomeImages> {
  try {
    const base = import.meta.env.VITE_SUPABASE_URL as string;
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 2500);
    const r = await fetch(`${base}/rest/v1/rpc/seller_home_images`, { method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: "{}", signal: ctl.signal });
    clearTimeout(t);
    return r.ok ? ((await r.json()) as HomeImages) ?? {} : {};
  } catch {
    return {};
  }
}

const Ctx = createContext<HomeImages>({});
export const HomeImagesProvider = Ctx.Provider;

function usePreview() {
  const [on, setOn] = useState(false);
  useEffect(() => { setOn(new URLSearchParams(window.location.search).get("apercu") === "images"); }, []);
  return on;
}

/**
 * Photo d'un emplacement. `className` donne la forme (proportions, arrondis) ; la photo remplit le cadre
 * (object-cover). `shade` assombrit légèrement le bas pour rester lisible sur le fond sombre du site.
 */
export function HomePhoto({ slot, className = "", sizes, width = 828, priority = false, shade = true, original = false, children }: {
  slot: HomeImageSlot; className?: string; sizes?: string; width?: number; priority?: boolean; shade?: boolean; original?: boolean; children?: React.ReactNode;
}) {
  const img = useContext(Ctx)[slot];
  const preview = usePreview();
  if (!img?.url) {
    if (!preview) return null;
    return (
      <div className={`relative grid place-items-center overflow-hidden border-2 border-dashed border-primary/60 bg-primary/5 p-4 text-center ${className}`}>
        <p className="text-xs font-semibold text-primary">📷 {SLOT_LABELS[slot]}<br /><span className="font-normal text-muted-foreground">emplacement « {slot} »</span></p>
      </div>
    );
  }
  return (
    <div className={`relative overflow-hidden bg-secondary ${className}`}>
      {/* original : fichier d'origine, pleine résolution (aucun redimensionnement ni recompression) */}
      <img {...(original ? { src: img.url } : imgProps(img.url, { width, sizes }))} alt={img.alt || SLOT_LABELS[slot]} loading={priority ? "eager" : "lazy"} decoding="async"
        {...(priority ? { fetchPriority: "high" as const } : {})} className="absolute inset-0 h-full w-full object-cover" />
      {shade && <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/5 to-transparent" />}
      {children}
    </div>
  );
}

/** Toutes les photos choisies. */
export function useHomeImages() {
  return useContext(Ctx);
}

/** Vrai si l'emplacement a une photo (ou si l'aperçu des emplacements est actif). */
export function useHasHomeImage(slot: HomeImageSlot) {
  const img = useContext(Ctx)[slot];
  const preview = usePreview();
  return !!img?.url || preview;
}
