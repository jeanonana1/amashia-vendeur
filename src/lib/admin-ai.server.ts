import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

/**
 * IA de l'espace admin Amachia (appelée par admin.amachia / amashia-admin).
 * Toutes les données viennent des fonctions admin de la base, appelées avec la session de l'administrateur connecté :
 * les droits (double authentification, sections autorisées) sont vérifiés par la base à chaque appel.
 */
const MODEL = "claude-opus-5-5";
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const ANON = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

export class AdminAiError extends Error { constructor(message: string, public status = 400) { super(message); } }

/** Appel d'une fonction admin avec la session de l'administrateur. */
export async function adminRpc(jwt: string, fn: string, args: Record<string, unknown> = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const t = await r.text();
  if (!r.ok) { let m = "Accès refusé"; try { m = JSON.parse(t).message || m; } catch { /* ignore */ } throw new AdminAiError(m, r.status === 401 ? 401 : 403); }
  try { return JSON.parse(t); } catch { return t; }
}

// ---------------------------------------------------------------- Optimisation d'une fiche produit
const ProductRewrite = z.object({
  title: z.string().describe("Nouveau titre en français, 40 à 90 caractères : marque + modèle + caractéristique principale"),
  description: z.string().describe("Nouvelle description en français, HTML simple (<p>, <ul>, <li>, <strong>), 120 à 220 mots, uniquement avec les faits fournis"),
  changes: z.array(z.string()).describe("3 à 6 améliorations apportées, phrases courtes"),
  missing: z.array(z.string()).describe("Informations absentes que le vendeur devrait ajouter (photos, caractéristiques…)"),
});

const OPTIMIZE_SYSTEM = `Tu optimises des fiches produits pour Amachia, place de marché en ligne au Cameroun (amachia.com).
Objectif : un titre et une description en français, clairs, vendeurs et bien référencés dans Google, pour des acheteurs camerounais.

RÈGLES ABSOLUES
- N'utilise QUE les faits fournis (titre actuel, description, marque, caractéristiques, catégorie, prix). N'invente jamais une caractéristique, une garantie, une compatibilité, un délai ou une promotion.
- Traduis en français ce qui est en anglais. Garde les noms de marque et de modèle tels quels.
- Titre : marque + modèle + caractéristique principale, sans majuscules abusives ni emojis ni prix.
- Description : une phrase d'accroche, puis une liste à puces des caractéristiques et bénéfices réels, puis une phrase de conclusion. Ton professionnel et chaleureux.
- Si une information manque pour bien vendre, ne la comble pas : liste-la dans « missing ».`;

export async function optimizeProduct(jwt: string, productId: string) {
  const p = await adminRpc(jwt, "admin_ia_product", { _id: productId });
  const client = new Anthropic({ timeout: 120_000, maxRetries: 1 });
  const res = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 8000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: zodOutputFormat(ProductRewrite) },
    system: OPTIMIZE_SYSTEM,
    messages: [{
      role: "user",
      content: `Fiche actuelle (données réelles) :
Titre : ${p.title}
Marque : ${p.brand || "non renseignée"}
Catégorie : ${p.category || "?"} › ${p.subcategory || "?"}
Prix : ${p.price} FCFA
Caractéristiques : ${JSON.stringify(p.specs ?? {})}
Nombre de photos : ${p.images}
Description actuelle :
${String(p.description || "(vide)").slice(0, 6000)}

Points faibles détectés : ${(p.issues as { text: string }[] | undefined)?.map((i) => i.text).join(" ; ") || "aucun"}

Réécris le titre et la description.`,
    }],
  });
  if (res.stop_reason === "refusal") throw new AdminAiError("L'IA n'a pas pu traiter cette fiche.", 422);
  if (!res.parsed_output) throw new AdminAiError("Réponse de l'IA illisible, réessayez.", 502);
  return { before: { title: p.title, description: p.description ?? "" }, after: res.parsed_output, score: p.score };
}

// ---------------------------------------------------------------- Assistant de l'administrateur
const tools: Anthropic.Beta.BetaTool[] = [
  { name: "indicateurs", description: "Chiffres réels de la boutique sur une période : chiffre d'affaires, commandes, clients, visites, panier moyen, en attente (commandes à expédier, retours, signalements…). Dates au format ISO.",
    input_schema: { type: "object", properties: { du: { type: "string", description: "date de début ISO (ex. 2026-11-01)" }, au: { type: "string", description: "date de fin ISO" } }, required: ["du", "au"] } },
  { name: "meilleures_ventes", description: "Produits les plus vendus sur une période (quantités et chiffre d'affaires réels).",
    input_schema: { type: "object", properties: { du: { type: "string" }, au: { type: "string" } }, required: ["du", "au"] } },
  { name: "commandes", description: "Liste des commandes récentes, filtrables (statut ou recherche par numéro, client, téléphone).",
    input_schema: { type: "object", properties: { filtre: { type: "string", description: "all (toutes), active (en cours), delivered (livrées) ou cancelled (annulées)" }, recherche: { type: "string" } }, required: [] } },
  { name: "recommandations", description: "Actions prioritaires détectées automatiquement (commandes en retard, ruptures, fiches faibles, avis, KYC, signalements…).",
    input_schema: { type: "object", properties: {}, required: [] } },
  { name: "fiches_a_ameliorer", description: "Produits classés par score de qualité de fiche (0-100) avec leurs défauts, vues, ajouts au panier et ventes sur 30 jours.",
    input_schema: { type: "object", properties: {}, required: [] } },
  { name: "vendeurs", description: "Qualité de chaque vendeur : score, produits, fiches faibles, ruptures, taux d'annulation, KYC, signalements.",
    input_schema: { type: "object", properties: {}, required: [] } },
  { name: "alertes_fraude", description: "Commandes à risque des N derniers jours, avec score et raisons.",
    input_schema: { type: "object", properties: { jours: { type: "number" } }, required: [] } },
  { name: "activites_suspectes", description: "Événements inhabituels : connexions admin depuis une nouvelle IP, suppressions, comptes au même numéro, robots, retours répétés, produits signalés.",
    input_schema: { type: "object", properties: {}, required: [] } },
];

async function runTool(jwt: string, name: string, input: Record<string, unknown>) {
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  switch (name) {
    case "indicateurs": return adminRpc(jwt, "admin_dashboard_range", { _from: str(input.du), _to: str(input.au) });
    case "meilleures_ventes": return adminRpc(jwt, "admin_top_products", { _from: str(input.du), _to: str(input.au), _limit: 15 });
    case "commandes": return adminRpc(jwt, "admin_orders", { _filter: str(input.filtre) || "all", _q: str(input.recherche) || null, _limit: 40 });
    case "recommandations": return adminRpc(jwt, "admin_ia_recommendations");
    case "fiches_a_ameliorer": return ((await adminRpc(jwt, "admin_ia_products")) as unknown[]).slice(0, 40);
    case "vendeurs": return adminRpc(jwt, "admin_ia_sellers");
    case "alertes_fraude": return adminRpc(jwt, "admin_ia_fraud", { _days: Number(input.jours) || 30 });
    case "activites_suspectes": return ((await adminRpc(jwt, "admin_ia_suspicious")) as unknown[]).slice(0, 40);
    default: return { erreur: "outil inconnu" };
  }
}

const SYSTEM = `Tu es l'assistant IA de l'espace administrateur d'Amachia, place de marché en ligne au Cameroun.
Tu aides l'équipe à piloter la boutique : ventes, commandes, produits, vendeurs, fraude, priorités.

RÈGLES
- Réponds en français, de façon claire et concrète (listes courtes, chiffres en FCFA avec espaces).
- Tout chiffre ou fait sur Amachia doit venir d'un outil appelé dans cette conversation. Si un outil ne renvoie rien ou échoue, dis-le. N'invente jamais de données.
- Pour une période (« ce mois-ci », « cette semaine »), calcule les dates à partir de la date du jour fournie.
- Termine par 1 à 3 actions recommandées quand c'est utile.
- Tu ne peux pas modifier les données : propose plutôt la page de l'admin où agir.`;

export type ChatMsg = { role: "user" | "assistant"; content: string };

export async function adminAssistant(jwt: string, history: ChatMsg[]) {
  const client = new Anthropic({ timeout: 120_000, maxRetries: 1 });
  const today = new Date().toLocaleDateString("fr-FR", { timeZone: "Africa/Douala", weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const messages: Anthropic.Beta.BetaMessageParam[] = history.map((m) => ({ role: m.role, content: m.content }));
  for (let i = 0; i < 6; i++) {
    const res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 6000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium" },
      system: `${SYSTEM}\n\nDate du jour : ${today} (heure du Cameroun).`,
      tools,
      messages,
    });
    if (res.stop_reason === "refusal") return "Je ne peux pas répondre à cette demande.";
    if (res.stop_reason !== "tool_use") {
      return res.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("\n").trim() || "Je n'ai pas de réponse à donner, reformulez votre question.";
    }
    messages.push({ role: "assistant", content: res.content });
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const b of res.content) {
      if (b.type !== "tool_use") continue;
      try {
        const out = await runTool(jwt, b.name, (b.input ?? {}) as Record<string, unknown>);
        results.push({ type: "tool_result", tool_use_id: b.id, content: JSON.stringify(out).slice(0, 30000) });
      } catch (e) {
        results.push({ type: "tool_result", tool_use_id: b.id, content: `Erreur : ${e instanceof Error ? e.message : "indisponible"}`, is_error: true });
      }
    }
    messages.push({ role: "user", content: results });
  }
  return "Analyse trop longue : posez une question plus précise.";
}
