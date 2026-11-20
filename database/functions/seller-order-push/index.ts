// Fonction Supabase « seller-order-push » : sonnerie « Nouvelle commande » sur les téléphones / ordinateurs
// du vendeur concerné, même navigateur fermé ou écran verrouillé.
// Appelée par la base (déclencheur sur order_items) avec { order_id, seller_id }, une seule fois par vendeur et par commande.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const SUBJECT = "https://amashia-vendeur.vercel.app";
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
type Sub = { endpoint: string; p256dh: string; auth: string };

/* ---------- Application Android Amashia Seller : messages Firebase (FCM v1) ---------- */
type SA = { client_email: string; private_key: string; project_id: string };
let cachedFcm: { token: string; exp: number } | null = null;
const b64url = (input: string | ArrayBuffer) => {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let s = ""; bytes.forEach((x) => (s += String.fromCharCode(x)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
function fcmAccount(): SA | null {
  try { const raw = Deno.env.get("FCM_SERVICE_ACCOUNT"); return raw ? JSON.parse(raw) as SA : null; } catch { return null; }
}
async function fcmAccessToken(sa: SA) {
  if (cachedFcm && cachedFcm.exp > Date.now() + 60_000) return cachedFcm.token;
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
  if (!d.access_token) throw new Error("Connexion à Firebase refusée");
  cachedFcm = { token: d.access_token, exp: Date.now() + (d.expires_in ?? 3600) * 1000 };
  return cachedFcm.token;
}
/** Envoie l'alerte aux téléphones du vendeur où l'application est installée (sonnerie + vibration gérées par l'application). */
async function sendFcm(tokens: string[], data: Record<string, string>) {
  const sa = fcmAccount();
  if (!sa || !tokens.length) return 0;
  let sent = 0;
  for (const token of tokens) {
    const r = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${await fcmAccessToken(sa)}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message: { token, data, android: { priority: "HIGH", ttl: "600s" } } }),
    });
    if (r.ok) { sent++; await db.from("seller_fcm_tokens").update({ last_seen_at: new Date().toISOString() }).eq("token", token); continue; }
    const t = await r.text();
    if (r.status === 404 || /UNREGISTERED|INVALID_ARGUMENT/.test(t)) await db.from("seller_fcm_tokens").delete().eq("token", token);
  }
  return sent;
}

async function send(subs: Sub[], payload: string) {
  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600, urgency: "high" });
      sent++;
      await db.from("seller_push_subscriptions").update({ last_ok_at: new Date().toISOString(), fail_count: 0 }).eq("endpoint", s.endpoint);
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await db.from("seller_push_subscriptions").delete().eq("endpoint", s.endpoint);
    }
  }
  return sent;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type" } });
  try {
    const { data: keys } = await db.from("push_vapid").select("public_key, private_key").eq("id", 1).single();
    if (!keys) return json({ error: "clés indisponibles" }, 500);
    webpush.setVapidDetails(SUBJECT, keys.public_key, keys.private_key);
    const body = await req.json().catch(() => ({}));

    // Alerte d'essai : uniquement vers un appareil déjà abonné (adresse d'abonnement connue de lui seul).
    // alerte d'essai vers l'application Android (jeton Firebase connu de ce téléphone seulement)
    if (typeof body?.test_token === "string") {
      const { data: t } = await db.from("seller_fcm_tokens").select("token").eq("token", body.test_token).maybeSingle();
      if (!t) return json({ error: "téléphone non enregistré" }, 404);
      const app = await sendFcm([t.token], { kind: "test", order_id: `test-${Date.now()}`, title: "🔔 Test — alertes de commandes", body: "Les alertes fonctionnent : sonnerie et vibration à chaque nouvelle commande." });
      return json({ sent: app });
    }
    if (typeof body?.test_endpoint === "string") {
      const { data: s } = await db.from("seller_push_subscriptions").select("endpoint, p256dh, auth").eq("endpoint", body.test_endpoint).maybeSingle();
      if (!s) return json({ error: "appareil non abonné" }, 404);
      const sent = await send([s as Sub], JSON.stringify({ title: "🔔 Test — alertes de commandes", body: "Les alertes fonctionnent sur cet appareil, même navigateur fermé.", tag: "amashia-test", url: "/dashboard/commandes" }));
      return json({ sent });
    }

    const orderId = String(body?.order_id ?? ""), sellerId = String(body?.seller_id ?? "");
    if (!/^[0-9a-f-]{36}$/.test(orderId) || !/^[0-9a-f-]{36}$/.test(sellerId)) return json({ error: "paramètres manquants" }, 400);
    // l'appel doit correspondre à une alerte réellement enregistrée par la base, récente
    const { data: alert } = await db.from("seller_order_alerts").select("created_at").eq("order_id", orderId).eq("seller_id", sellerId).maybeSingle();
    if (!alert || Date.now() - new Date(alert.created_at).getTime() > 10 * 60_000) return json({ skipped: true });

    const { data: seller } = await db.from("sellers").select("owner_id").eq("id", sellerId).maybeSingle();
    if (!seller?.owner_id) return json({ skipped: true });
    const { data: order } = await db.from("orders").select("order_number, city, district").eq("id", orderId).maybeSingle();
    const { data: items } = await db.from("order_items").select("product_title, quantity, unit_price_fcfa, discount_fcfa").eq("order_id", orderId).eq("seller_id", sellerId);
    const list = (items ?? []) as { product_title: string; quantity: number; unit_price_fcfa: number; discount_fcfa: number | null }[];
    const amount = list.reduce((n, i) => n + i.unit_price_fcfa * i.quantity - (i.discount_fcfa ?? 0), 0);
    const first = list[0]?.product_title ?? "Produit";
    const title = "🔔 Nouvelle commande — Amashia";
    const text = `${first.slice(0, 60)}${list.length > 1 ? ` + ${list.length - 1} autre${list.length > 2 ? "s" : ""}` : ""} · ${new Intl.NumberFormat("fr-FR").format(Math.round(amount))} FCFA${order?.city ? ` · ${[order.district, order.city].filter(Boolean).join(", ")}` : ""}`;
    const { data: subs } = await db.from("seller_push_subscriptions").select("endpoint, p256dh, auth").eq("user_id", seller.owner_id);
    const sent = await send((subs ?? []) as Sub[], JSON.stringify({ title, body: text, tag: `order-${orderId}`, url: "/dashboard/commandes" }));
    // application Android Amashia Seller
    const { data: toks } = await db.from("seller_fcm_tokens").select("token").eq("user_id", seller.owner_id);
    const app = await sendFcm(((toks ?? []) as { token: string }[]).map((t) => t.token), { kind: "new_order", order_id: orderId, title, body: text });
    return json({ sent, app });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
