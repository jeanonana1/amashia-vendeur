import { createFileRoute } from "@tanstack/react-router";

/**
 * POST /api/admin-ai — IA de l'espace admin (assistant et optimisation de fiches produits).
 * En-tête Authorization : Bearer <session de l'administrateur>. La base vérifie à chaque appel que c'est un
 * administrateur actif avec double authentification et accès à la section IA.
 * Corps : { action: "chat", messages: [...] } | { action: "optimize", product_id: string }
 */
const ALLOWED = new Set(["https://amashia-admin.vercel.app", "https://monadmincest.amachia.com", "https://admin.amachia.com", "http://localhost:8090"]);
const cors = (origin: string | null) => ({ Vary: "Origin", ...(origin && ALLOWED.has(origin) ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "content-type, authorization", "Access-Control-Allow-Methods": "POST, OPTIONS" } : {}) });
const hits = new Map<string, number[]>();

export const Route = createFileRoute("/api/admin-ai")({
  server: { handlers: {
    OPTIONS: async ({ request }) => new Response(null, { status: 204, headers: cors(request.headers.get("origin")) }),
    POST: async ({ request }) => {
      const origin = request.headers.get("origin");
      const h = cors(origin);
      if (!origin || !ALLOWED.has(origin)) return Response.json({ error: "Origine non autorisée" }, { status: 403, headers: h });
      const jwt = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
      if (!jwt) return Response.json({ error: "Connexion administrateur requise." }, { status: 401, headers: h });
      const now = Date.now(); const key = jwt.slice(-24); const list = (hits.get(key) ?? []).filter((t) => now - t < 60_000); list.push(now); hits.set(key, list);
      if (list.length > 20) return Response.json({ error: "Trop de demandes : patientez une minute." }, { status: 429, headers: h });
      if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: "IA non configurée : la clé ANTHROPIC_API_KEY manque." }, { status: 503, headers: h });
      let body: { action?: string; messages?: unknown; product_id?: string };
      try { body = JSON.parse(await request.text()); } catch { return Response.json({ error: "Requête invalide" }, { status: 400, headers: h }); }
      const ai = await import("@/lib/admin-ai.server");
      try {
        if (body.action === "optimize") {
          if (!/^[0-9a-f-]{36}$/i.test(String(body.product_id ?? ""))) return Response.json({ error: "Produit invalide" }, { status: 400, headers: h });
          return Response.json(await ai.optimizeProduct(jwt, String(body.product_id)), { headers: { ...h, "Cache-Control": "no-store" } });
        }
        if (body.action === "chat") {
          const check = await ai.adminRpc(jwt, "admin_ia_assistant_check");
          if (check && check.enabled === false) return Response.json({ error: "L'assistant IA est désactivé dans Paramètres › IA." }, { status: 403, headers: h });
          const msgs = (Array.isArray(body.messages) ? body.messages : [])
            .filter((m): m is { role: "user" | "assistant"; content: string } => !!m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim().length > 0)
            .slice(-16).map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
          while (msgs.length && msgs[0].role !== "user") msgs.shift();
          if (!msgs.length || msgs[msgs.length - 1].role !== "user") return Response.json({ error: "Requête invalide" }, { status: 400, headers: h });
          return Response.json({ reply: await ai.adminAssistant(jwt, msgs) }, { headers: { ...h, "Cache-Control": "no-store" } });
        }
        return Response.json({ error: "Action inconnue" }, { status: 400, headers: h });
      } catch (e) {
        if (e instanceof ai.AdminAiError) return Response.json({ error: e.message }, { status: e.status, headers: h });
        console.error("admin-ai", e);
        return Response.json({ error: "Service IA momentanément indisponible, réessayez." }, { status: 502, headers: h });
      }
    },
  } },
});
