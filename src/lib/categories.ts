/**
 * Catégories du site Amashia, regroupées comme elles apparaissent aux acheteurs
 * (même répartition que la fonction de publication seller_category_slug en base).
 * Les valeurs sont celles du formulaire produit : une catégorie choisie ici
 * est donc reprise telle quelle.
 */
export const SITE_CATEGORY_GROUPS: { group: string; categories: string[] }[] = [
  { group: "Électronique", categories: ["Électronique", "Téléphones & Tablettes", "Ordinateurs"] },
  { group: "Mode", categories: ["Mode", "Chaussures", "Bijoux & Accessoires", "Bébé & Enfants"] },
  { group: "Beauté & Soins", categories: ["Beauté"] },
  { group: "Cuisine & Maison", categories: ["Électroménager", "Cuisine & Ustensiles"] },
  {
    group: "Maison & Jardin",
    categories: ["Maison & Décoration", "Alimentation", "Sport & Loisirs", "Automobile & Moto", "Agriculture & Élevage", "Services"],
  },
];

export const SITE_CATEGORIES = SITE_CATEGORY_GROUPS.flatMap((g) => g.categories);

// ---------------------------------------------------------------------------
// Classification gérée depuis l'espace admin Amashia (catégories, sous-catégories,
// marques, attributs). La liste ci-dessus ne sert plus que de secours hors connexion.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Taxonomy = {
  categories: { slug: string; name: string; subcategories: { slug: string; name: string }[] }[];
  brands: { name: string }[];
  attributes: { name: string; kind: "text" | "color" | "size"; values: string[] }[];
};
let cache: Taxonomy | null = null;
let pending: Promise<Taxonomy | null> | null = null;

export function loadTaxonomy(): Promise<Taxonomy | null> {
  if (pending) return pending;
  pending = (supabase as unknown as { rpc: (f: string) => Promise<{ data: unknown }> }).rpc("catalog_taxonomy")
    .then(({ data }) => { if (data && typeof data === "object") cache = data as Taxonomy; return cache; })
    .catch(() => cache)
    .finally(() => { pending = null; });
  return pending;
}

export function useTaxonomy() {
  const [t, setT] = useState<Taxonomy | null>(cache);
  useEffect(() => { let on = true; void loadTaxonomy().then((x) => on && x && setT(x)); return () => { on = false; }; }, []);
  // groupes « Rubrique > catégories » du formulaire produit
  const groups = t?.categories.length
    ? t.categories.filter((c) => c.subcategories.length).map((c) => ({ group: c.name, categories: c.subcategories.map((s) => s.name) }))
    : SITE_CATEGORY_GROUPS;
  return { taxonomy: t, groups, categories: groups.flatMap((g) => g.categories) };
}
