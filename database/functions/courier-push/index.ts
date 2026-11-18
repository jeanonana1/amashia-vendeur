// Fonction Supabase « courier-push » : alertes Firebase (FCM) de l'application livreur Prime.
// Appelée par la base à chaque événement livreur (nouvelle commande, refus, prise, annulation).
// Les vagues de proximité sont respectées : le livreur le plus proche d'abord, puis la zone (45 s), puis la ville (2 min).
// Clé d'envoi : secret FCM_SERVICE_ACCOUNT (compte de service Firebase, au format JSON).
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
type SA = { project_id: string; client_email: string; private_key: string };

let cached: { token: string; exp: number } | null = null;
const b64url = (b: ArrayBuffer | Uint8Array | string) => {
  const bytes = typeof b === "string" ? new TextEncoder().encode(b) : new Uint8Array(b instanceof ArrayBuffer ? b : b.buffer);
  let s = ""; bytes.forEach((x) => (s += String.fromCharCode(x)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
function account(): SA | null {
  try { const raw = Deno.env.get("FCM_SERVICE_ACCOUNT"); return raw ? JSON.parse(raw) as SA : null; } catch { return null; }
}
async function accessToken(sa: SA) {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const pem = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${head}.${claim}`));
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claim}.${b64url(sig)}` }),
  });
  const d = await r.json();
  if (!d.access_token) throw new Error("Connexion à Firebase refusée : " + JSON.stringify(d).slice(0, 200));
  cached = { token: d.access_token, exp: Date.now() + (d.expires_in ?? 3600) * 1000 };
  return cached.token;
}
async function send(sa: SA, token: string, data: Record<string, string>) {
  const r = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await accessToken(sa)}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message: { token, data, android: { priority: "HIGH", ttl: "180s" } } }),
  });
  if (r.ok) return true;
  const t = await r.text();
  if (r.status === 404 || /UNREGISTERED|INVALID_ARGUMENT/.test(t)) await db.rpc("courier_push_drop", { _token: token });
  console.log("FCM", r.status, t.slice(0, 200));
  return false;
}
async function wave(sa: SA, orderId: string) {
  const { data } = await db.rpc("courier_push_targets", { _order: orderId });
  let sent = 0;
  for (const t of (data ?? []) as { tokens: string[]; title: string; body: string; order_number: string }[]) {
    for (const tok of t.tokens) if (await send(sa, tok, { kind: "new_order", order_id: orderId, title: t.title, body: t.body, order_number: t.order_number ?? "" })) sent++;
  }
  return sent;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey" } });
  const sa = account();
  const body = await req.json().catch(() => ({}));
  // l'application demande si les alertes Firebase sont prêtes (sinon elle garde son service d'arrière-plan)
  if (body?.status) return json({ ready: !!sa?.private_key && !!sa?.project_id });
  if (!sa) return json({ error: "Secret FCM_SERVICE_ACCOUNT absent ou illisible" }, 503);
  // vérification de la clé : connexion à Google + envoi « à blanc » (aucune notification réelle)
  if (body?.selftest) {
    try {
      const tok = await accessToken(sa);
      const r = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
        method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
        body: JSON.stringify({ validate_only: true, message: { topic: "prime-selftest", data: { kind: "selftest" } } }),
      });
      return json({ google_auth: true, project: sa.project_id, fcm_status: r.status, fcm: (await r.text()).slice(0, 200) });
    } catch (e) { return json({ google_auth: false, error: String((e as Error).message).slice(0, 300) }); }
  }

  // essai depuis l'application (livreur connecté) : alerte sur ses propres téléphones dans 8 secondes
  if (body?.test) {
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: u } = await db.auth.getUser(jwt);
    if (!u?.user) return json({ error: "Connectez-vous." }, 401);
    const { data: toks } = await db.rpc("courier_push_mine", { _user: u.user.id });
    const list = (toks ?? []) as string[];
    if (!list.length) return json({ error: "Ce téléphone n'est pas encore enregistré pour les alertes : ouvrez Prime en ligne puis réessayez." }, 404);
    const job = (async () => { await sleep(8000); for (const t of list) await send(sa, t, { kind: "new_order", order_id: crypto.randomUUID(), title: "🔔 Test — alerte Prime", body: "Les alertes fonctionnent : son et vibration même application fermée." }); })();
    // @ts-ignore EdgeRuntime existe sur Supabase
    globalThis.EdgeRuntime?.waitUntil ? EdgeRuntime.waitUntil(job) : await job;
    return json({ ok: true, devices: list.length });
  }

  const orderId = String(body?.order_id ?? "");
  if (!/^[0-9a-f-]{36}$/.test(orderId)) return json({ error: "order_id manquant" }, 400);
  if (body.kind === "taken" || body.kind === "cancelled") {
    const { data } = await db.rpc("courier_push_notified", { _order: orderId });
    for (const tok of (data ?? []) as string[]) await send(sa, tok, { kind: String(body.kind), order_id: orderId });
    return json({ ok: true });
  }
  // nouvelle commande : vague immédiate, puis à 46 s (zone 6 km) et à 2 min 1 s (toute la ville)
  const job = (async () => {
    await wave(sa, orderId);
    const { data: o } = await db.from("courier_feed").select("created_at").eq("order_id", orderId).eq("kind", "new_order").order("created_at").limit(1).maybeSingle();
    const t0 = o ? new Date(o.created_at).getTime() : Date.now();
    for (const at of [46_000, 121_000]) {
      const wait = t0 + at - Date.now();
      if (wait > 0) await sleep(wait);
      const { data: open } = await db.rpc("courier_push_open", { _order: orderId });
      if (!open) break;
      await wave(sa, orderId);
    }
  })();
  // @ts-ignore EdgeRuntime existe sur Supabase
  if (globalThis.EdgeRuntime?.waitUntil) { EdgeRuntime.waitUntil(job); return json({ ok: true, queued: true }); }
  await job; return json({ ok: true });
});
