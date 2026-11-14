import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Agent IA de rédaction de fiches produits (Claude). Toute la logique et la clé API
 * restent sur le serveur : voir src/lib/claude-seo.server.ts.
 */
export const generateSeoContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => input as Record<string, unknown>)
  .handler(async ({ data }) => {
    const { InputSchema, writeProductSheet } = await import("@/lib/claude-seo.server");
    const parsed = InputSchema.safeParse(data);
    if (!parsed.success) throw new Error("Informations du produit invalides : " + parsed.error.issues[0]?.message);
    return writeProductSheet(parsed.data);
  });

