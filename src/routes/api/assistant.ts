import { createFileRoute } from "@tanstack/react-router";

/**
 * POST /api/assistant — assistant du service client (page Contact du site client).
 * Corps : { messages: [{ role: "user" | "assistant", content: string }] }
 */
const ALLOWED = new Set(["https://amashia-client.vercel.app", "https://amachia.com", "https://www.amachia.com", "http://localhost:3000"]);
const cors = (origin: string | null) => ({ Vary: "Origin", ...(origin && ALLOWED.has(origin) ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" } : {}) });
// limite simple par adresse IP (par instance du serveur)
const hits = new Map<string, number[]>();

export const Route = createFileRoute("/api/assistant")({
  server: { handlers: {
    OPTIONS: async ({ request }) => new Response(null, { status: 204, headers: cors(request.headers.get("origin")) }),
    POST: async ({ request }) => {
      const origin = request.headers.get("origin");
      if (!origin || !ALLOWED.has(origin)) return Response.json({ error: "Origine non autorisée" }, { status: 403, headers: cors(origin) });
      const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "?";
      const now = Date.now(); const list = (hits.get(ip) ?? []).filter((t) => now - t < 60_000); list.push(now); hits.set(ip, list);
      if (list.length > 12) return Response.json({ reply: "Vous envoyez beaucoup de messages : patientez une minute, puis reposez votre question." }, { status: 429, headers: cors(origin) });
      let body: { messages?: unknown };
      try { body = JSON.parse(await request.text()); } catch { return Response.json({ error: "Requête invalide" }, { status: 400, headers: cors(origin) }); }
      const msgs = (Array.isArray(body.messages) ? body.messages : [])
        .filter((m): m is { role: "user" | "assistant"; content: string } => !!m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim().length > 0)
        .slice(-12).map((m) => ({ role: m.role, content: m.content.slice(0, 1200) }));
      while (msgs.length && msgs[0].role !== "user") msgs.shift();
      if (!msgs.length || msgs[msgs.length - 1].role !== "user") return Response.json({ error: "Requête invalide" }, { status: 400, headers: cors(origin) });
      if (!process.env.ANTHROPIC_API_KEY) return Response.json({ reply: "L'assistant est momentanément indisponible. Utilisez le formulaire de contact ci-dessous : nous vous répondrons rapidement." }, { status: 503, headers: cors(origin) });
      try {
        const { answer } = await import("@/lib/assistant.server");
        return Response.json({ reply: await answer(msgs) }, { headers: { ...cors(origin), "Cache-Control": "no-store" } });
      } catch {
        return Response.json({ reply: "Désolé, je rencontre un problème technique. Réessayez dans un instant ou utilisez le formulaire de contact." }, { status: 502, headers: cors(origin) });
      }
    },
  } },
});
