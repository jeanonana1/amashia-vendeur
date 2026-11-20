import { createFileRoute } from "@tanstack/react-router";

/**
 * GET /api/translate?to=en&q=<texte français>
 * Utilisé par le site client pour sa version anglaise. Chaque texte n'est traduit
 * qu'une fois : la réponse est gardée en cache par le CDN de Vercel (1 an) puis
 * par le navigateur du visiteur.
 */
const ALLOWED = new Set(["https://amashia-client.vercel.app", "https://amachia.com", "https://www.amachia.com", "http://localhost:3000", "https://amashia-vendeur.vercel.app", "https://seller.amachia.com", "http://localhost:8082"]);
const MAX = 1500;

function cors(origin: string | null) {
  const h: Record<string, string> = { Vary: "Origin" };
  if (origin && ALLOWED.has(origin)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}

export const Route = createFileRoute("/api/translate")({
  server: { handlers: {
    // POST (texte brut JSON : {"to":"en","q":["…","…"]}) : plusieurs textes en un seul aller-retour
    POST: async ({ request }) => {
      const origin = request.headers.get("origin");
      if (!origin || !ALLOWED.has(origin)) return Response.json({ error: "Origine non autorisée" }, { status: 403, headers: cors(origin) });
      let body: { to?: string; q?: unknown };
      try { body = JSON.parse(await request.text()); } catch { return Response.json({ error: "Requête invalide" }, { status: 400, headers: cors(origin) }); }
      const q = Array.isArray(body.q) ? body.q.filter((x): x is string => typeof x === "string").map((x) => x.trim()) : [];
      if (body.to !== "en" || !q.length || q.length > 80 || q.some((x) => !x || x.length > MAX) || q.join("").length > 40_000) {
        return Response.json({ error: "Requête invalide" }, { status: 400, headers: cors(origin) });
      }
      if (!process.env.ANTHROPIC_API_KEY) return Response.json({ t: q }, { status: 503, headers: cors(origin) });
      try {
        const { translateMany } = await import("@/lib/translate.server");
        return Response.json({ t: await translateMany(q) }, { headers: { ...cors(origin), "Cache-Control": "no-store" } });
      } catch {
        return Response.json({ t: q }, { status: 502, headers: { ...cors(origin), "Cache-Control": "no-store" } });
      }
    },
    GET: async ({ request }) => {
      const origin = request.headers.get("origin");
      const referer = request.headers.get("referer") || "";
      const allowed = (origin && ALLOWED.has(origin)) || [...ALLOWED].some((o) => referer.startsWith(o + "/"));
      if (!allowed) return Response.json({ error: "Origine non autorisée" }, { status: 403, headers: cors(origin) });
      const url = new URL(request.url);
      const to = url.searchParams.get("to");
      const q = (url.searchParams.get("q") || "").trim();
      if (to !== "en" || !q || q.length > MAX || !/[a-zà-ÿ]/i.test(q)) return Response.json({ error: "Requête invalide" }, { status: 400, headers: cors(origin) });
      if (!process.env.ANTHROPIC_API_KEY) return Response.json({ t: q }, { status: 503, headers: cors(origin) });
      try {
        const { translateText } = await import("@/lib/translate.server");
        const t = await translateText(q);
        return Response.json({ t }, {
          headers: {
            ...cors(origin),
            "Cache-Control": "public, max-age=86400",
            "CDN-Cache-Control": "public, s-maxage=31536000, immutable",
            "Vercel-CDN-Cache-Control": "public, s-maxage=31536000, immutable",
          },
        });
      } catch {
        return Response.json({ t: q }, { status: 502, headers: { ...cors(origin), "Cache-Control": "no-store" } });
      }
    },
  } },
});
