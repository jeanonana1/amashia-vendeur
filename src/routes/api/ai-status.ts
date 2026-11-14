import { createFileRoute } from "@tanstack/react-router";

/**
 * GET /api/ai-status : indique seulement si les images IA sont prêtes (clés présentes et
 * acceptées par Higgsfield). Aucune génération, aucun coût, aucune donnée sensible.
 */
export const Route = createFileRoute("/api/ai-status")({
  server: { handlers: {
    GET: async () => {
      const { aiStatus } = await import("@/lib/ai-images.server");
      const s = await aiStatus();
      return Response.json({ ready: s.ready, message: s.message ?? null }, { headers: { "Cache-Control": "no-store" } });
    },
  } },
});
