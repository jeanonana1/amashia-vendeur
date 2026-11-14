import Anthropic from "@anthropic-ai/sdk";

/**
 * Traduction FR -> EN d'un texte du site client Amashia (interface ou contenu vendeur).
 * Les marqueurs ⟦0⟧, ⟦1⟧… remplacent les nombres et doivent être conservés tels quels.
 */
const MODEL = "claude-opus-5-5";

const SYSTEM = `You translate the French text of Amashia, a Cameroonian online marketplace, into natural British English.
Rules:
- Reply with the translation only: no quotes, no notes, no explanations.
- Keep every placeholder like ⟦0⟧ or ⟦1⟧ exactly as it is, in a sensible position.
- Keep brand names, product model names, currency codes (FCFA), city and district names, e-mail addresses and URLs unchanged.
- Keep the same punctuation style, capitalisation style and line breaks as the source; keep it as short as the source.
- If the text is already English, a name, a code or has nothing to translate, return it unchanged.
- Never add information that is not in the source.`;

export async function translateText(text: string): Promise<string> {
  const client = new Anthropic({ timeout: 30_000, maxRetries: 1 });
  const res = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low" },
    system: SYSTEM,
    messages: [{ role: "user", content: text }],
  });
  if (res.stop_reason === "refusal") return text;
  const out = res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
  return out || text;
}

// ---------- Traduction par lots (un seul appel Claude pour plusieurs textes) ----------
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { createHash } from "node:crypto";

const BatchSchema = z.object({ translations: z.array(z.object({ i: z.number().int(), t: z.string() })) });

async function translateChunk(client: Anthropic, texts: string[]): Promise<string[]> {
  const res = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: zodOutputFormat(BatchSchema) },
    system: SYSTEM + "\nYou receive a JSON list of numbered texts; return one translation per number (field i = the number, field t = the translation). Each text is independent.",
    messages: [{ role: "user", content: JSON.stringify(texts.map((t, i) => ({ i, text: t }))) }],
  });
  const out = [...texts];
  if (res.stop_reason === "refusal" || !res.parsed_output) return out;
  for (const r of res.parsed_output.translations) if (r.i >= 0 && r.i < texts.length && r.t.trim()) out[r.i] = r.t;
  return out;
}

const memory = new Map<string, string>();
async function sharedCache() {
  try {
    const { getCache } = await import("@vercel/functions");
    return getCache({ namespace: "tr-en-v1" });
  } catch { return null; }
}
const keyOf = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 40);

/** Traduit plusieurs textes : cache partagé d'abord, puis Claude pour les textes encore jamais traduits. */
export async function translateMany(texts: string[]): Promise<string[]> {
  const cache = await sharedCache();
  const result: (string | null)[] = await Promise.all(texts.map(async (t) => {
    const k = keyOf(t);
    if (memory.has(k)) return memory.get(k)!;
    try { const v = cache ? await cache.get(k) : null; if (typeof v === "string") { memory.set(k, v); return v; } } catch { /* cache indisponible */ }
    return null;
  }));
  const missing = [...new Set(texts.filter((_, i) => result[i] === null))];
  if (missing.length) {
    const client = new Anthropic({ timeout: 60_000, maxRetries: 1 });
    // petits lots traduits en parallèle : réponse plus rapide qu'un gros appel
    const chunks: string[][] = [];
    for (let i = 0; i < missing.length; i += 15) chunks.push(missing.slice(i, i + 15));
    const done = await Promise.all(chunks.map((c) => translateChunk(client, c).then((t) => ({ ok: true, t }), () => ({ ok: false, t: c }))));
    const map = new Map<string, string>();
    const toStore: [string, string][] = [];
    chunks.forEach((c, ci) => c.forEach((src, j) => {
      map.set(src, done[ci].t[j]);
      if (done[ci].ok) toStore.push([src, done[ci].t[j]]); // un lot en échec n'est pas gardé en cache
    }));
    await Promise.all(toStore.map(async ([src, tr]) => {
      const k = keyOf(src);
      memory.set(k, tr);
      try { await cache?.set(k, tr, { ttl: 60 * 60 * 24 * 365 }); } catch { /* cache indisponible */ }
    }));
    texts.forEach((t, i) => { if (result[i] === null) result[i] = map.get(t) ?? t; });
  }
  return result as string[];
}
