import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("angles"), productName: z.string().min(1).max(300), category: z.string().max(200).optional() }),
  z.object({ action: z.literal("image"), prompt: z.string().min(1).max(8000), productName: z.string().max(300).optional(), sourceImage: z.string().max(14000000).optional() }),
]);

export const Route = createFileRoute("/api/ai-image")({
  server: { handlers: { POST: async ({ request }) => {
    const url = process.env.SUPABASE_URL;
    const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
    const key = process.env.GOOGLE_API_KEY;
    if (!url || !publishableKey || !key) return Response.json({ error: "Configuration serveur ou IA manquante." }, { status: 503 });
    const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
    if (!token) return Response.json({ error: "Connectez-vous pour générer des images." }, { status: 401 });
    const auth = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await auth.auth.getUser(token);
    if (error || !data.user) return Response.json({ error: "Session expirée." }, { status: 401 });
    const input = schema.safeParse(await request.json().catch(() => null));
    if (!input.success) return Response.json({ error: "Requête invalide." }, { status: 400 });
    try {
      const { generateGemini } = await import("@/lib/gemini.server");
      if (input.data.action === "angles") {
        const result = await generateGemini(key, process.env.GOOGLE_TEXT_MODEL || "gemini-3.1-flash-lite", [{ text: `Produit : ${input.data.productName}. Catégorie : ${input.data.category || ""}. Propose exactement 8 angles photo e-commerce complémentaires. N'affirme pas avoir consulté Amazon ou Google. JSON strict : {"angles":[{"label":"nom FR","why":"bénéfice","prompt":"prompt photo détaillé en anglais"}]}.` }], { json: true, maxTokens: 1800 });
        const text = result.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("");
        const parsed = JSON.parse(text || "{}");
        if (!Array.isArray(parsed.angles) || parsed.angles.length !== 8) throw new Error("Le fournisseur n’a pas retourné les huit angles attendus.");
        return Response.json({ angles: parsed.angles.map((angle: object, i: number) => ({ ...angle, id: `angle-${i}` })) });
      }
      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [{ text: `${input.data.prompt}\nProduct: ${input.data.productName || ""}. Professional product photography. No added text or watermark. Preserve the reference product exactly.` }];
      if (input.data.sourceImage) {
        const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(input.data.sourceImage);
        if (!match) return Response.json({ error: "Photo source invalide. Utilisez une photo PNG, JPEG ou WebP." }, { status: 400 });
        parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
      }
      const result = await generateGemini(key, process.env.GOOGLE_IMAGE_MODEL || "gemini-3.1-flash-image", parts, { image: true });
      const image = result.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.data)?.inlineData;
      if (!image?.data) throw new Error("Aucune image n’a été retournée par votre fournisseur.");
      return Response.json({ dataUrl: `data:${image.mimeType || "image/png"};base64,${image.data}` });
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : "Génération impossible." }, { status: 502 });
    }
  } } },
});