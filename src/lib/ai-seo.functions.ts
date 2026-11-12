import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type SeoInput = {
  productName: string;
  category?: string;
  brand?: string;
  features?: string;
  color?: string;
  material?: string;
  size?: string;
  usage?: string;
  audience?: string;
  price?: string;
};

const clampScore = (v: unknown, fallback = 70) => {
  const n = Number(v);
  if (!isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
};
const asArray = (v: unknown): any[] => (Array.isArray(v) ? v : []);
const asStrings = (v: unknown): string[] =>
  asArray(v).map((x) => (typeof x === "string" ? x : String(x?.text ?? x?.value ?? ""))).filter(Boolean);

/** Never let a malformed model answer crash the UI: fill every field with a safe default. */
function normalize(raw: any, input: SeoInput) {
  const fallbackTitle = input.productName;
  let titles = asArray(raw?.titles)
    .map((t: any) => ({
      text: typeof t === "string" ? t : String(t?.text ?? ""),
      score: clampScore(typeof t === "object" ? t?.score : 80, 80),
    }))
    .filter((t) => t.text);
  if (titles.length === 0) titles = [{ text: String(raw?.recommendedTitle || fallbackTitle), score: 75 }];

  const kw = raw?.keywords ?? {};
  const sources = asArray(raw?.sources)
    .map((s: any) => (typeof s === "string" ? { title: s, url: "" } : { title: String(s?.title ?? s?.url ?? ""), url: String(s?.url ?? "") }))
    .filter((s) => s.title || s.url);

  return {
    titles,
    recommendedTitle: String(raw?.recommendedTitle || titles[0]?.text || fallbackTitle),
    description: String(raw?.description || `<p>${fallbackTitle}</p>`),
    slug: String(raw?.slug || fallbackTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")),
    metaTitle: String(raw?.metaTitle || titles[0]?.text || fallbackTitle).slice(0, 70),
    metaDescription: String(raw?.metaDescription || "").slice(0, 180),
    tags: asStrings(raw?.tags),
    keywords: {
      primary: String(kw?.primary || asStrings(kw?.secondary)[0] || fallbackTitle),
      secondary: asStrings(kw?.secondary),
      longTail: asStrings(kw?.longTail ?? kw?.long_tail),
    },
    sellingPoints: asStrings(raw?.sellingPoints ?? raw?.selling_points),
    benefits: asStrings(raw?.benefits),
    ctas: asStrings(raw?.ctas),
    scores: {
      seoGoogle: clampScore(raw?.scores?.seoGoogle),
      seoMarketplace: clampScore(raw?.scores?.seoMarketplace),
      conversion: clampScore(raw?.scores?.conversion),
      content: clampScore(raw?.scores?.content),
      global: clampScore(raw?.scores?.global),
    },
    improvements: asStrings(raw?.improvements),
    trends: asArray(raw?.trends)
      .map((t: any) => ({
        keyword: String(t?.keyword ?? t?.term ?? ""),
        demand: clampScore(t?.demand ?? t?.volume ?? t?.interest, 50),
        trend: String(t?.trend ?? "stable"),
      }))
      .filter((t) => t.keyword),
    sources,
    researchNotes: String(raw?.researchNotes || ""),
  };
}

/** Extract JSON even if the model wraps it in prose or a code fence. */
function parseJsonLoose(content: string) {
  const cleaned = content.replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch { /* fall through */ }
    }
  }
  return null;
}

export const generateSeoContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    productName: z.string().trim().min(1).max(300), category: z.string().max(200).optional(),
    brand: z.string().max(200).optional(), features: z.string().max(8000).optional(),
    color: z.string().max(200).optional(), material: z.string().max(200).optional(),
    size: z.string().max(200).optional(), usage: z.string().max(500).optional(),
    audience: z.string().max(500).optional(), price: z.string().max(80).optional(),
  }).parse(input))
  .handler(async ({ data }) => {
    const key = process.env['GOOGLE_API_KEY'];
    if (!key) throw new Error("Configuration IA manquante");

    const system = `Tu es un agent IA SEO officiel d'Amashia Marketplace, expert en référencement Google, Google Trends, Google Shopping et marketplaces (Amazon, Jumia, AliExpress, Cdiscount).

MÉTHODE : travaille sur les informations fournies. N'invente pas de volumes Google Trends, de pages consultées ni de recherches Amazon. Retourne trends et sources vides si aucune donnée vérifiable n'est fournie. Explique les limites dans researchNotes. Les scores sont des estimations éditoriales, pas des mesures de trafic.

Réponds UNIQUEMENT en JSON valide (aucun texte hors JSON), structure exacte :
{
  "titles": [{"text": "titre", "score": 87}],
  "recommendedTitle": "le meilleur titre",
  "description": "description HTML structurée",
  "slug": "url-optimisee",
  "metaTitle": "meta titre <60 chars",
  "metaDescription": "meta description <160 chars",
  "tags": ["tag1"],
  "keywords": {"primary": "mot-clé principal", "secondary": ["mc1"], "longTail": ["question 1"]},
  "trends": [{"keyword": "mc", "demand": 74, "trend": "hausse"}],
  "sources": [{"title": "Page consultée", "url": "https://…"}],
  "researchNotes": "ce qui a été vérifié / ce qui ne l'a pas été",
  "sellingPoints": ["puce"],
  "benefits": ["bénéfice"],
  "ctas": ["CTA"],
  "scores": {"seoGoogle": 78, "seoMarketplace": 72, "conversion": 69, "content": 81, "global": 75},
  "improvements": ["conseil"]
}

RÈGLES TITRES (CRITIQUE) :
- 5 titres. Chaque titre intègre TOUS les mots-clés pertinents pour le produit (primary + secondary + long-tail courts).
- Séparateur unique : " - " (tiret du 6 entouré d'espaces). Aucun autre séparateur.
- Max ≈ 90 caractères, pas de MAJUSCULES abusives, pas d'emoji.

RÈGLES DESCRIPTION (CRITIQUE) :
- HTML riche : <h3>, <p>, <ul><li>.
- Structure : Intro (problème) → Solution → Bénéfices (<ul>) → Caractéristiques (<ul>) → Cas d'usage → Pourquoi choisir → Conclusion.
- Intègre naturellement TOUS les mots-clés pertinents, sans spam. Ton humain, orienté conversion.`;

    const user = `Analyse ce produit (à partir des informations fournies) puis génère la fiche SEO optimale :

Nom : ${data.productName}
Catégorie : ${data.category || "non précisée"}
Marque : ${data.brand || "non précisée"}
Caractéristiques : ${data.features || "non précisées"}
Couleur : ${data.color || "n/a"}
Matière : ${data.material || "n/a"}
Taille : ${data.size || "n/a"}
Utilisation : ${data.usage || "n/a"}
Public cible : ${data.audience || "n/a"}
Prix : ${data.price || "n/a"} FCFA
Marché : Cameroun / Afrique francophone (fr)

Utilise ces informations sans inventer de données de recherche. JSON strict uniquement.`;

    const { generateGemini } = await import("@/lib/gemini.server");
    const result = await generateGemini(key, process.env.GOOGLE_TEXT_MODEL || "gemini-3.1-flash-lite", [{ text: `${system}\n\n${user}` }], { json: true, maxTokens: 2500 });
    const content = result.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("");
    if (!content) throw new Error("Réponse IA vide");
    const raw = parseJsonLoose(content);
    if (!raw) throw new Error("Réponse IA invalide (JSON)");
    return normalize(raw, data);
  });
