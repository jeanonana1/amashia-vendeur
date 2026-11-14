import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Images produit par IA — côté serveur uniquement (les clés ne quittent jamais le serveur).
 *
 *  1. Claude (directeur artistique) regarde les VRAIES photos du vendeur, le titre et la
 *     description, puis choisit les prises de vue les plus utiles pour vendre ce produit.
 *  2. Higgsfield (Marketing Studio Image) génère chaque prise de vue en partant des vraies
 *     photos comme référence : le produit reste le même, seul l'angle / la mise en scène change.
 *  3. Les images terminées sont copiées dans le stockage Amashia du vendeur (Higgsfield
 *     les supprime au bout de 7 jours).
 */

const HF_API = "https://api.higgsfield.ai";
const HF_MODEL = "marketing-studio/image";
const CLAUDE_MODEL = "claude-opus-5-5";

export class ConfigError extends Error {}

function higgsfieldAuth() {
  // Une seule variable suffit : la clé telle que donnée par Higgsfield, au format « identifiant:secret ».
  // (Les deux parties peuvent aussi être fournies séparément : HIGGSFIELD_API_KEY + HIGGSFIELD_API_SECRET.)
  const key = (process.env.HIGGSFIELD_API_KEY || process.env.HF_CREDENTIALS || "").trim();
  const secret = (process.env.HIGGSFIELD_API_SECRET || "").trim();
  const creds = secret ? `${key}:${secret}` : key;
  if (!key || !creds.includes(":")) {
    throw new ConfigError(key
      ? "Clé Higgsfield incomplète : elle doit contenir l'identifiant et le secret, au format identifiant:secret."
      : "Génération d'images non configurée : la clé Higgsfield (HIGGSFIELD_API_KEY) doit être ajoutée au site vendeur.");
  }
  return `Key ${creds}`;
}

/** Seules les photos du vendeur lui-même, dans le stockage Amashia, servent de référence. */
export function isOwnImage(url: string, userId: string) {
  const base = process.env.SUPABASE_URL?.replace(/\/$/, "");
  return !!base && url.startsWith(`${base}/storage/v1/object/public/product-images/${userId}/`);
}

const plain = (html?: string) => (html ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

// ---------------------------------------------------------------- 1. Plan des prises de vue

export const PlanInput = z.object({
  productName: z.string().trim().min(2).max(300),
  category: z.string().max(200).optional(),
  description: z.string().max(20000).optional(),
  referenceUrls: z.array(z.string().url()).min(1).max(4),
});

const ShotsSchema = z.object({
  productSummary: z.string(),
  shots: z.array(z.object({
    label: z.string(),
    why: z.string(),
    prompt: z.string(),
  })),
});

const PLAN_SYSTEM = `Tu es le directeur artistique e-commerce d'Amashia, marketplace du Cameroun.
Tu reçois les VRAIES photos d'un produit prises par le vendeur, son titre, sa catégorie et sa description.
Tu choisis entre 4 et 6 prises de vue qui feront le mieux vendre CE produit sur une marketplace, puis tu écris pour chacune la consigne envoyée à un modèle de génération d'images qui recevra ces mêmes photos comme référence.

Règles des prises de vue :
- La première est toujours la photo principale de catalogue : produit entier, centré, sur fond blanc pur, lumière studio douce, ombre légère.
- Les suivantes sont choisies selon la nature du produit (ex. vue de trois quarts, profil, dos, gros plan sur la matière ou un détail fonctionnel visible, produit tenu en main pour montrer la taille, mise en situation d'usage).
- Une mise en situation se passe dans un cadre réaliste du Cameroun / d'Afrique de l'Ouest et centrale (maison, cuisine, bureau, boutique, extérieur urbain…), avec des personnes africaines seulement si c'est pertinent.
- Ne montre une fonction, un accessoire ou un contenu de boîte que s'il est visible sur les photos ou écrit dans la description. N'invente rien.

Règles des consignes ("prompt", en anglais, 60 à 120 mots) :
- Commence par : "Use the product exactly as shown in the reference photo(s): same shape, proportions, colors, materials, logos and printed text."
- Décris ensuite la prise de vue (angle, cadrage, fond, lumière, décor) de façon précise et photographique.
- Termine par : "Photorealistic professional e-commerce photography. Do not add any text, watermark, price tag, logo or extra product."

"label" (français, 2 à 4 mots) et "why" (français, une phrase : ce que l'acheteur y gagne).
"productSummary" : une phrase en français décrivant ce que tu vois sur les photos.`;

export async function planShots(input: z.infer<typeof PlanInput>) {
  if (!process.env.ANTHROPIC_API_KEY) throw new ConfigError("Agent IA non configuré : la clé ANTHROPIC_API_KEY manque.");
  higgsfieldAuth(); // vérifie la configuration avant de faire travailler Claude
  const client = new Anthropic({ timeout: 120_000, maxRetries: 1 });
  const res = await client.beta.messages.parse({
    model: CLAUDE_MODEL,
    max_tokens: 6000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: zodOutputFormat(ShotsSchema) },
    system: PLAN_SYSTEM,
    messages: [{
      role: "user",
      content: [
        ...input.referenceUrls.map((url) => ({ type: "image" as const, source: { type: "url" as const, url } })),
        {
          type: "text" as const,
          text: `Titre : ${input.productName}\nCatégorie : ${input.category || "non précisée"}\nDescription : ${plain(input.description).slice(0, 6000) || "non fournie"}\n\nChoisis les prises de vue et écris leurs consignes.`,
        },
      ],
    }],
  });
  if (res.stop_reason === "refusal") throw new Error("L'agent n'a pas pu analyser ces photos. Essayez une autre photo du produit.");
  const plan = res.parsed_output;
  if (!plan?.shots.length) throw new Error("L'agent n'a proposé aucune prise de vue. Réessayez.");
  const shots = plan.shots.slice(0, 6).map((s, i) => ({ id: `shot-${i + 1}`, label: s.label.trim(), why: s.why.trim(), prompt: s.prompt.trim() }));

  // coût estimé par image, donné par Higgsfield pour ce compte (indicatif)
  let costUsd: number | null = null;
  try {
    const est = await fetch(`${HF_API}/estimate/${HF_MODEL}`, {
      method: "POST",
      headers: { Authorization: higgsfieldAuth(), "Content-Type": "application/json" },
      body: JSON.stringify(shotBody(shots[0]!.prompt, input.referenceUrls)),
      signal: AbortSignal.timeout(10_000),
    });
    if (est.ok) costUsd = Number((await est.json() as { usd?: string }).usd) || null;
  } catch { /* estimation facultative */ }

  return { summary: plan.productSummary, shots, costUsd };
}

// ---------------------------------------------------------------- 2. Lancement des générations

function shotBody(prompt: string, referenceUrls: string[]) {
  return { prompt, image_urls: referenceUrls, resolution: "2k", aspect_ratio: "1:1", quality: "high", enhance_prompt: false };
}

export const StartInput = z.object({
  referenceUrls: z.array(z.string().url()).min(1).max(4),
  shots: z.array(z.object({ id: z.string().max(40), prompt: z.string().min(10).max(4000) })).min(1).max(6),
});

export async function startShots(input: z.infer<typeof StartInput>) {
  const auth = higgsfieldAuth();
  return Promise.all(input.shots.map(async (shot) => {
    try {
      const res = await fetch(`${HF_API}/${HF_MODEL}`, {
        method: "POST",
        headers: { Authorization: auth, "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify(shotBody(shot.prompt, input.referenceUrls)),
        signal: AbortSignal.timeout(30_000),
      });
      const data = await res.json().catch(() => ({})) as { request_id?: string; detail?: unknown };
      if (!res.ok || !data.request_id) return { id: shot.id, error: hfError(res.status, data.detail) };
      return { id: shot.id, requestId: data.request_id };
    } catch {
      return { id: shot.id, error: "Higgsfield ne répond pas. Réessayez." };
    }
  }));
}

function hfError(status: number, detail?: unknown) {
  if (status === 401) return "Clé Higgsfield invalide : vérifiez HIGGSFIELD_API_KEY (format identifiant:secret).";
  if (status === 402) return "Crédit Higgsfield insuffisant : rechargez votre compte Higgsfield.";
  if (status === 429) return "Trop de générations en même temps. Réessayez dans une minute.";
  if (status === 404 || status === 423 || status === 503) return "Le modèle d'images n'est pas disponible pour ce compte Higgsfield en ce moment.";
  if (status === 422) return `Demande refusée par Higgsfield${typeof detail === "string" ? ` : ${detail}` : ""}.`;
  return "La génération n'a pas pu démarrer. Réessayez.";
}

// ---------------------------------------------------------------- 3. Suivi + copie dans le stockage Amashia

export const CheckInput = z.object({
  jobs: z.array(z.object({ id: z.string().max(40), requestId: z.string().uuid() })).min(1).max(6),
});

type JobState = { id: string; status: "pending" | "done" | "failed"; url?: string; error?: string };

export async function checkShots(input: z.infer<typeof CheckInput>, ctx: { supabase: SupabaseClient; userId: string }): Promise<JobState[]> {
  const auth = higgsfieldAuth();
  return Promise.all(input.jobs.map(async (job): Promise<JobState> => {
    try {
      const res = await fetch(`${HF_API}/requests/${job.requestId}/status`, { headers: { Authorization: auth }, signal: AbortSignal.timeout(20_000) });
      if (!res.ok) return res.status >= 500 ? { id: job.id, status: "pending" } : { id: job.id, status: "failed", error: hfError(res.status) };
      const data = await res.json() as { status?: string; images?: { url?: string }[]; error?: unknown };
      if (data.status === "queued" || data.status === "in_progress") return { id: job.id, status: "pending" };
      if (data.status === "nsfw") return { id: job.id, status: "failed", error: "Image refusée par la modération. Essayez une autre photo." };
      if (data.status !== "completed") return { id: job.id, status: "failed", error: "La génération a échoué (non facturée). Réessayez." };
      const src = data.images?.[0]?.url;
      if (!src) return { id: job.id, status: "failed", error: "Aucune image renvoyée." };

      // copie dans le dossier du vendeur (nom stable : un second contrôle ne crée pas de doublon)
      const img = await fetch(src, { signal: AbortSignal.timeout(60_000) });
      if (!img.ok) return { id: job.id, status: "pending" };
      const type = img.headers.get("content-type")?.split(";")[0] || "image/png";
      const ext = type.includes("jpeg") || type.includes("jpg") ? "jpg" : type.includes("webp") ? "webp" : "png";
      const path = `${ctx.userId}/ai-${job.requestId}.${ext}`;
      const { error } = await ctx.supabase.storage.from("product-images").upload(path, await img.arrayBuffer(), { contentType: type, upsert: true, cacheControl: "31536000" });
      if (error) return { id: job.id, status: "failed", error: "Image générée mais non enregistrée. Réessayez." };
      const { data: pub } = ctx.supabase.storage.from("product-images").getPublicUrl(path);
      return { id: job.id, status: "done", url: pub.publicUrl };
    } catch {
      return { id: job.id, status: "pending" };
    }
  }));
}
