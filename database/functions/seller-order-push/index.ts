// Fonction Supabase « seller-order-push » : sonnerie « Nouvelle commande » sur les téléphones / ordinateurs
// du vendeur concerné, même navigateur fermé ou écran verrouillé.
// Appelée par la base (déclencheur sur order_items) avec { order_id, seller_id }, une seule fois par vendeur et par commande.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const SUBJECT = "https://amashia-vendeur.vercel.app";
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
type Sub = { endpoint: string; p256dh: string; auth: string };

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
    const { data: subs } = await db.from("seller_push_subscriptions").select("endpoint, p256dh, auth").eq("user_id", seller.owner_id);
    const sent = await send((subs ?? []) as Sub[], JSON.stringify({
      title: "🔔 Nouvelle commande — Amashia",
      body: `${first.slice(0, 60)}${list.length > 1 ? ` + ${list.length - 1} autre${list.length > 2 ? "s" : ""}` : ""} · ${new Intl.NumberFormat("fr-FR").format(Math.round(amount))} FCFA${order?.city ? ` · ${[order.district, order.city].filter(Boolean).join(", ")}` : ""}`,
      tag: `order-${orderId}`, url: "/dashboard/commandes",
    }));
    return json({ sent });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
