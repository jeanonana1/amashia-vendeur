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
