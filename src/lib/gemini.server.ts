type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };
type GeminiReply = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string; inlineData?: { mimeType?: string; data?: string } }> } }>;
};

/** Called only from a server function or server route, with server-owned configuration. */
export async function generateGemini(
  key: string,
  model: string,
  parts: GeminiPart[],
  options: { json?: boolean; maxTokens?: number; image?: boolean } = {},
): Promise<GeminiReply> {
  if (!/^[a-zA-Z0-9._-]+$/.test(model)) throw new Error("Modèle IA invalide.");
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: {
        ...(options.json ? { responseMimeType: "application/json" } : {}),
        ...(options.maxTokens ? { maxOutputTokens: options.maxTokens } : {}),
        ...(options.image ? { responseModalities: ["TEXT", "IMAGE"] } : {}),
      },
    }),
  });
  if (!response.ok) {
    if (response.status === 429) throw new Error("Quota de votre fournisseur IA atteint. Vérifiez votre offre ou réessayez plus tard.");
    if (response.status === 401 || response.status === 403) throw new Error("La clé IA n’est pas autorisée.");
    throw new Error(`Votre fournisseur IA n’a pas pu générer le contenu (${response.status}).`);
  }
  return response.json();
}