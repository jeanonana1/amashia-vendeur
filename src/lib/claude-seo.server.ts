import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

/**
 * Agent IA de rédaction de fiches produits (Claude, Anthropic).
 *
 * Deux étapes, côté serveur uniquement (la clé ANTHROPIC_API_KEY ne quitte jamais le serveur) :
 *  1. Recherche : Claude cherche sur le web comment les acheteurs camerounais / africains
 *     nomment et recherchent ce type de produit (mots-clés, vocabulaire local, titres
 *     des marketplaces). La recherche ne sert QU'AU vocabulaire, jamais aux caractéristiques.
 *  2. Rédaction : Claude rédige titre, description et métadonnées SEO à partir des SEULES
 *     données fournies par le vendeur + des mots-clés trouvés. Réponse au format JSON
 *     validé par schéma (aucune donnée inventée : ce qui manque est signalé au vendeur).
 */

const MODEL = "claude-opus-5-5";

export const InputSchema = z.object({
  productName: z.string().trim().min(1).max(300),
  category: z.string().max(200).optional(),
  brand: z.string().max(200).optional(),
  features: z.string().max(8000).optional(),
  color: z.string().max(500).optional(),
  material: z.string().max(200).optional(),
  size: z.string().max(500).optional(),
  usage: z.string().max(500).optional(),
  audience: z.string().max(500).optional(),
  price: z.string().max(80).optional(),
  /** caractéristiques techniques du formulaire produit (nom → valeur) */
  specs: z.array(z.object({ name: z.string().max(120), value: z.string().max(400) })).max(60).optional(),
  /** attributs du produit (Couleur, Taille…) avec leurs valeurs */
  attributes: z.array(z.object({ name: z.string().max(80), values: z.array(z.string().max(80)).max(60) })).max(20).optional(),
  /** description déjà saisie par le vendeur (texte brut) */
  currentDescription: z.string().max(8000).optional(),
});
export type SeoInput = z.infer<typeof InputSchema>;

/** Schéma de la fiche renvoyée par Claude (sortie structurée, validée par l'API). */
const SheetSchema = z.object({
  titles: z.array(z.object({ text: z.string(), score: z.number().int() })),
  recommendedTitle: z.string(),
  description: z.string(),
  slug: z.string(),
  metaTitle: z.string(),
  metaDescription: z.string(),
  tags: z.array(z.string()),
  keywords: z.object({ primary: z.string(), secondary: z.array(z.string()), longTail: z.array(z.string()) }),
  sellingPoints: z.array(z.string()),
  benefits: z.array(z.string()),
  ctas: z.array(z.string()),
  scores: z.object({
    seoGoogle: z.number().int(), seoMarketplace: z.number().int(), conversion: z.number().int(),
    content: z.number().int(), global: z.number().int(),
  }),
  improvements: z.array(z.string()),
  researchNotes: z.string(),
});

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
const esc = (s: string) => s.replace(/[\u0000-\u001f]/g, " ").trim();

/** Données du vendeur, présentées telles quelles (seule source autorisée pour les faits). */
function sellerFacts(d: SeoInput) {
  const lines: string[] = [];
  const add = (label: string, v?: string) => { if (v && v.trim()) lines.push(`- ${label} : ${esc(v)}`); };
  add("Nom du produit", d.productName);
  add("Catégorie", d.category);
  add("Marque", d.brand);
  add("Prix", d.price ? `${d.price} FCFA` : undefined);
  add("Couleur(s)", d.color);
  add("Matière", d.material);
  add("Taille / dimensions", d.size);
  add("Utilisation / contexte", d.usage);
  add("Public cible", d.audience);
  add("Points forts / caractéristiques", d.features);
  for (const a of d.attributes ?? []) if (a.values.length) add(`Option « ${a.name} »`, a.values.join(", "));
  for (const s of d.specs ?? []) if (s.name.trim() && s.value.trim()) add(`Caractéristique « ${s.name} »`, s.value);
  add("Description actuelle du vendeur", d.currentDescription);
  return lines.join("\n");
}

const RESEARCH_SYSTEM = `Tu es le chargé de recherche SEO d'Amashia, marketplace camerounaise.
Ta mission : trouver comment les acheteurs au Cameroun et en Afrique francophone recherchent et nomment un produit, pour optimiser son référencement.

Cherche sur le web (Google, Jumia Cameroun, marketplaces et boutiques africaines francophones, forums, réseaux) :
- les mots et expressions que les acheteurs tapent réellement pour ce type de produit (y compris les appellations locales camerounaises courantes) ;
- la façon dont les annonces bien classées formulent leurs titres ;
- les questions que se posent les acheteurs avant d'acheter.

Règles strictes :
- Tu ne cherches que du VOCABULAIRE et des MOTS-CLÉS. Ne rapporte aucune caractéristique technique, prix, garantie ou promesse trouvée en ligne comme si elle concernait ce produit précis : ces informations viendront uniquement du vendeur.
- N'invente pas de volumes de recherche ni de chiffres. Si tu ne trouves rien de fiable, dis-le.
- Réponds en français, en notes brèves : 1) mots-clés principaux, 2) mots-clés secondaires et appellations locales, 3) requêtes longues / questions, 4) formulations de titres observées, 5) ce que tu n'as pas pu vérifier.`;

const WRITING_SYSTEM = `Tu es le rédacteur e-commerce officiel d'Amashia, marketplace du Cameroun : copywriter professionnel et expert SEO (Google et marketplaces).

SOURCE DES FAITS — RÈGLE ABSOLUE
- Les caractéristiques, matières, dimensions, compatibilités, contenus du colis, garanties, délais, origines et performances du produit viennent EXCLUSIVEMENT des « Données du vendeur ».
- La recherche de mots-clés ne sert qu'au vocabulaire et au référencement : n'en tire aucun fait sur le produit.
- N'invente rien. Si une information utile manque (dimensions, matière, garantie, contenu du colis…), ne l'écris pas : ajoute plutôt dans "improvements" une demande précise au vendeur (ex. « Indiquez la capacité en litres »).
- Ne promets ni livraison, ni retour, ni garantie, ni stock qui ne figurent pas dans les données.

TON ET LANGUE
- Français naturel tel qu'on le parle et le lit au Cameroun et en Afrique francophone : chaleureux, direct, concret, proche du client, tourné vers la vie quotidienne (la maison, la famille, le travail, le business, le quartier, la saison des pluies, les coupures d'électricité… seulement quand c'est pertinent pour CE produit).
- Prix en FCFA. Vouvoiement. Une ou deux expressions locales bien placées sont bienvenues, sans caricature ni pidgin forcé, et toujours compréhensibles par tous.
- Style de copywriter : accroche qui parle d'un besoin réel, bénéfices avant caractéristiques, phrases courtes, aucun remplissage, aucun superlatif creux (« meilleur du monde », « révolutionnaire »), pas d'emoji.

TITRES (5 propositions)
- Mot-clé principal au début, puis marque (si fournie), caractéristiques clés réelles, variante (couleur/taille) si utile.
- Séparateur unique « - » (tiret entouré d'espaces). Environ 60 à 90 caractères. Pas de MAJUSCULES abusives.
- "score" : ta note éditoriale de 0 à 100 (estimation, pas une mesure). "recommendedTitle" = le meilleur des cinq.

DESCRIPTION ("description", HTML simple)
- Balises autorisées uniquement : <h3>, <p>, <ul>, <li>, <strong>.
- Structure : accroche (besoin du client) → présentation du produit → <ul> des bénéfices → <ul> des caractéristiques (uniquement celles fournies) → usages concrets → pourquoi le choisir sur Amashia (sans promesse non fournie) → phrase de conclusion qui invite à commander.
- Intègre naturellement le mot-clé principal et plusieurs secondaires, sans bourrage.

AUTRES CHAMPS
- slug : minuscules, mots séparés par des tirets, sans accents.
- metaTitle ≤ 60 caractères ; metaDescription ≤ 155 caractères avec le mot-clé principal et une incitation à l'achat.
- tags : 6 à 12 mots-clés courts. keywords : principal, secondaires (5 à 10), requêtes longues (3 à 6).
- sellingPoints : 4 à 6 puces courtes ; benefits : 3 à 5 bénéfices client ; ctas : 3 appels à l'action courts.
- scores : estimations éditoriales de 0 à 100.
- improvements : informations manquantes à demander au vendeur et conseils concrets pour mieux vendre.
- researchNotes : 2 ou 3 phrases sur l'origine des mots-clés et ce qui n'a pas pu être vérifié.`;

/** Génère la fiche (appelée uniquement côté serveur). */
export async function writeProductSheet(data: SeoInput) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("Agent IA non configuré : la clé ANTHROPIC_API_KEY doit être ajoutée au site vendeur.");
    }
    const client = new Anthropic({ timeout: 150_000, maxRetries: 1 });
    const facts = sellerFacts(data);

    try {
      // ---- Étape 1 : recherche des mots-clés sur le web (marché camerounais) ----
      let research = "";
      const sources: { title: string; url: string }[] = [];
      try {
        const messages: Anthropic.Beta.BetaMessageParam[] = [{
          role: "user",
          content: `Produit à référencer sur Amashia (Cameroun) :\n${facts}\n\nTrouve les mots-clés et le vocabulaire que les acheteurs camerounais utilisent pour ce type de produit.`,
        }];
        for (let turn = 0; turn < 3; turn++) {
          const res = await client.beta.messages.create({
            model: MODEL,
            max_tokens: 4000,
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
            output_config: { effort: "low" },
            system: RESEARCH_SYSTEM,
            tools: [{
              type: "web_search_20260209", name: "web_search", max_uses: 4,
              user_location: { type: "approximate", country: "CM", city: "Douala", timezone: "Africa/Douala" },
            }],
            messages,
          });
          for (const block of res.content) {
            if (block.type === "text") research += block.text;
            if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
              for (const r of block.content) {
                if (r.type === "web_search_result" && r.url && !sources.some((s) => s.url === r.url)) sources.push({ title: r.title || r.url, url: r.url });
              }
            }
          }
          if (res.stop_reason !== "pause_turn") break;
          messages.push({ role: "assistant", content: res.content }); // reprise du tour en pause
        }
      } catch (err) {
        // la recherche est un plus : sans elle, la rédaction se fait sur les seules données du vendeur
        console.error("Recherche SEO indisponible :", err instanceof Error ? err.message : err);
        research = "";
      }

      // ---- Étape 2 : rédaction de la fiche (JSON validé par schéma) ----
      const res = await client.beta.messages.parse({
        model: MODEL,
        max_tokens: 12000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium", format: zodOutputFormat(SheetSchema) },
        system: WRITING_SYSTEM,
        messages: [{
          role: "user",
          content: `Données du vendeur (seule source autorisée pour les faits sur le produit) :
${facts}

Recherche de mots-clés (vocabulaire uniquement, aucun fait produit) :
${research.trim() || "Aucune recherche disponible : choisis les mots-clés à partir du nom, de la catégorie et des données du vendeur, et indique-le dans researchNotes."}

Marché : Cameroun et Afrique francophone. Rédige la fiche produit complète.`,
        }],
      });

      if (res.stop_reason === "refusal") throw new Error("L'agent n'a pas pu rédiger cette fiche. Vérifiez les informations du produit.");
      if (res.stop_reason === "max_tokens") throw new Error("Fiche trop longue : réessayez avec des informations plus concises.");
      const sheet = res.parsed_output;
      if (!sheet) throw new Error("Réponse de l'agent illisible. Réessayez.");

      const titles = sheet.titles.filter((t) => t.text.trim()).slice(0, 5).map((t) => ({ text: t.text.trim(), score: clamp(t.score) }));
      return {
        ...sheet,
        titles: titles.length ? titles : [{ text: sheet.recommendedTitle || data.productName, score: 70 }],
        recommendedTitle: sheet.recommendedTitle || titles[0]?.text || data.productName,
        metaTitle: sheet.metaTitle.slice(0, 70),
        metaDescription: sheet.metaDescription.slice(0, 180),
        scores: {
          seoGoogle: clamp(sheet.scores.seoGoogle), seoMarketplace: clamp(sheet.scores.seoMarketplace),
          conversion: clamp(sheet.scores.conversion), content: clamp(sheet.scores.content), global: clamp(sheet.scores.global),
        },
        // aucune donnée de tendance inventée : seules les pages réellement consultées sont listées
        trends: [] as { keyword: string; demand: number; trend: string }[],
        sources: sources.slice(0, 8),
      };
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) throw new Error("Clé API Claude invalide : vérifiez ANTHROPIC_API_KEY.");
      if (err instanceof Anthropic.PermissionDeniedError) throw new Error("La clé API Claude n'a pas accès à ce service.");
      if (err instanceof Anthropic.RateLimitError) throw new Error("Trop de demandes en même temps. Réessayez dans une minute.");
      if (err instanceof Anthropic.APIConnectionTimeoutError) throw new Error("L'agent a mis trop de temps à répondre. Réessayez.");
      if (err instanceof Anthropic.APIError) {
        console.error("Erreur API Claude", err.status, err.message);
        throw new Error("L'agent IA est momentanément indisponible. Réessayez.");
      }
      throw err;
    }
}
