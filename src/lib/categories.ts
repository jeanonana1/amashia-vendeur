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
