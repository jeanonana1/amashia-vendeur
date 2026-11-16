// Fonction Supabase « order-push » : envoie une notification push (sonnerie système) aux téléphones /
// ordinateurs des administrateurs à chaque nouvelle commande, même navigateur fermé ou écran verrouillé.
// Appelée par la base (déclencheur sur orders) avec { order_id }. Les clés VAPID sont générées ici
// au premier appel et conservées dans une table privée (lisible uniquement par le service).
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const SUBJECT = "https://amashia-admin.vercel.app";
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });

async function vapid() {
  const { data } = await db.from("push_vapid").select("public_key, private_key").eq("id", 1).maybeSingle();
  if (data) return data as { public_key: string; private_key: string };
  const k = webpush.generateVAPIDKeys();
  await db.from("push_vapid").insert({ id: 1, public_key: k.publicKey, private_key: k.privateKey });
  const again = await db.from("push_vapid").select("public_key, private_key").eq("id", 1).single();
  return again.data as { public_key: string; private_key: string };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type" } });
  try {
    const keys = await vapid();
    const body = await req.json().catch(() => ({}));
    if (body?.init) return json({ ok: true, public_key: keys.public_key });
    webpush.setVapidDetails(SUBJECT, keys.public_key, keys.private_key);

    // Alerte d'essai : uniquement vers un appareil déjà abonné (adresse d'abonnement connue de lui seul).
    if (typeof body?.test_endpoint === "string") {
      const { data: s } = await db.from("admin_push_subscriptions").select("endpoint, p256dh, auth").eq("endpoint", body.test_endpoint).maybeSingle();
      if (!s) return json({ error: "appareil non abonné" }, 404);
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ title: "🔔 Test — alertes de commandes", body: "Les alertes fonctionnent sur cet appareil, même navigateur fermé.", tag: "amashia-test", url: "/commandes" }),
        { TTL: 600, urgency: "high" });
      return json({ sent: 1 });
    }
    const orderId = String(body?.order_id ?? "");
    if (!/^[0-9a-f-]{36}$/.test(orderId)) return json({ error: "order_id manquant" }, 400);

    // Une seule alerte par commande, et seulement pour une commande qui vient d'être passée.
    const { data: order } = await db.from("orders").select("id, order_number, total_fcfa, city, created_at, push_sent_at").eq("id", orderId).maybeSingle();
    if (!order) return json({ error: "commande introuvable" }, 404);
    if (order.push_sent_at || Date.now() - new Date(order.created_at).getTime() > 10 * 60_000) return json({ skipped: true });
    await db.from("orders").update({ push_sent_at: new Date().toISOString() }).eq("id", orderId).is("push_sent_at", null);

    const { data: subs } = await db.rpc("push_order_recipients");
    const total = new Intl.NumberFormat("fr-FR").format(Math.round(Number(order.total_fcfa ?? 0)));
    const payload = JSON.stringify({
      title: "🔔 Nouvelle commande — Amashia",
      body: `${order.order_number ?? "Commande"} · ${total} FCFA${order.city ? ` · ${order.city}` : ""}`,
      tag: `order-${order.id}`, url: "/commandes",
    });
    let sent = 0;
    for (const s of (subs ?? []) as { endpoint: string; p256dh: string; auth: string }[]) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600, urgency: "high" });
        sent++;
        await db.from("admin_push_subscriptions").update({ last_ok_at: new Date().toISOString(), fail_count: 0 }).eq("endpoint", s.endpoint);
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await db.from("admin_push_subscriptions").delete().eq("endpoint", s.endpoint);
        else await db.rpc("push_subscription_failed", { _endpoint: s.endpoint });
      }
    }
    return json({ sent });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
