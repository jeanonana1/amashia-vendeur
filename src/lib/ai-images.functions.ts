import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Images produit par IA (Claude + Higgsfield). Toute la logique et les clés restent
 * sur le serveur : voir src/lib/ai-images.server.ts.
 */

async function friendly<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    const { ConfigError } = await import("@/lib/ai-images.server");
    if (err instanceof ConfigError) throw new Error(err.message);
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    if (err instanceof Anthropic.AuthenticationError) throw new Error("Clé API Claude invalide.");
    if (err instanceof Anthropic.RateLimitError) throw new Error("Trop de demandes en même temps. Réessayez dans une minute.");
    if (err instanceof Anthropic.APIError) {
      console.error("Erreur API Claude", err.status, err.message);
      throw new Error("L'agent IA est momentanément indisponible. Réessayez.");
    }
    throw err;
  }
}

function checkRefs(urls: string[], userId: string, isOwnImage: (u: string, id: string) => boolean) {
  if (!urls.every((u) => isOwnImage(u, userId))) throw new Error("Les photos de référence doivent être vos propres photos Amashia.");
}

/** Claude choisit les prises de vue à partir des vraies photos, du titre et de la description. */
export const planProductShots = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => input as Record<string, unknown>)
  .handler(async ({ data, context }) => {
    const m = await import("@/lib/ai-images.server");
    const input = m.PlanInput.parse(data);
    checkRefs(input.referenceUrls, context.userId, m.isOwnImage);
    return friendly(() => m.planShots(input));
  });

/** Lance la génération Higgsfield de chaque prise de vue retenue. */
export const startProductShots = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => input as Record<string, unknown>)
  .handler(async ({ data, context }) => {
    const m = await import("@/lib/ai-images.server");
    const input = m.StartInput.parse(data);
    checkRefs(input.referenceUrls, context.userId, m.isOwnImage);
    return friendly(() => m.startShots(input));
  });

/** Suit l'avancement ; une image terminée est copiée dans le stockage Amashia du vendeur. */
export const checkProductShots = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => input as Record<string, unknown>)
  .handler(async ({ data, context }) => {
    const m = await import("@/lib/ai-images.server");
    const input = m.CheckInput.parse(data);
    return friendly(() => m.checkShots(input, { supabase: context.supabase as never, userId: context.userId }));
  });

/** Le service d'images IA est-il prêt (clés présentes et acceptées) ? Rien n'est facturé. */
export const aiImagesStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const m = await import("@/lib/ai-images.server");
    return m.aiStatus();
  });
