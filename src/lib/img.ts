/**
 * Images optimisées : en production, les photos envoyées par les vendeurs
 * (stockage Supabase, souvent des PNG de 1 à 3 Mo) passent par l'optimiseur
 * d'images de Vercel, qui les redimensionne à la taille réellement affichée et
 * les convertit en WebP/AVIF (≈ 20 à 80 Ko au lieu de plusieurs Mo).
 * Le résultat est mis en cache sur le CDN : seule la première visite le calcule.
 * En développement, ou pour les autres images, l'adresse d'origine est conservée.
 */

/** Largeurs autorisées — doivent correspondre à `images.sizes` dans vite.config.ts. */
export const IMAGE_WIDTHS = [64, 128, 256, 384, 640, 828, 1080, 1600] as const;

const STORAGE = /^https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/public\//;

export function canOptimize(src: string | null | undefined): src is string {
  return !!src && import.meta.env.PROD && STORAGE.test(src);
}

function pick(width: number) {
  return IMAGE_WIDTHS.find((w) => w >= width) ?? IMAGE_WIDTHS[IMAGE_WIDTHS.length - 1];
}

/** Adresse de l'image à la largeur voulue (en pixels réels). */
export function imgUrl(src: string, width: number): string {
  if (!canOptimize(src)) return src;
  return `/_vercel/image?url=${encodeURIComponent(src)}&w=${pick(width)}&q=75`;
}

/** Attribut srcSet : le navigateur choisit la bonne taille selon l'écran. */
export function imgSrcSet(src: string, maxWidth = 1080): string | undefined {
  if (!canOptimize(src)) return undefined;
  return IMAGE_WIDTHS.filter((w) => w >= 64 && w <= maxWidth)
    .map((w) => `${imgUrl(src, w)} ${w}w`)
    .join(", ");
}

/** Propriétés prêtes à étaler sur une balise <img>. */
export function imgProps(src: string, opts: { width?: number; sizes?: string } = {}) {
  const width = opts.width ?? 640;
  return {
    src: imgUrl(src, width),
    srcSet: imgSrcSet(src, Math.max(256, pick(width * 2))),
    sizes: canOptimize(src) ? opts.sizes ?? `${width}px` : undefined,
  };
}
