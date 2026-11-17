// Fonction Supabase « courier-call » : appel masqué livreur ↔ client.
// Amashia (Twilio) appelle d'abord le livreur ; quand il décroche, il est relié au client.
// Chacun ne voit que le numéro d'Amashia. Le numéro du client ne quitte jamais le serveur.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
const esc = (s: string) => s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c]!));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: u } = await db.auth.getUser(token);
    if (!u?.user) return json({ error: "Connectez-vous à l'application livreur." }, 401);
    const { order_id } = await req.json().catch(() => ({}));
    if (!/^[0-9a-f-]{36}$/.test(String(order_id ?? ""))) return json({ error: "Commande inconnue." }, 400);

    const { data: p, error } = await db.rpc("masked_call_prepare", { _user: u.user.id, _order: order_id });
    if (error) return json({ error: "Appel impossible pour le moment." }, 500);
    if (p?.error) return json({ error: p.error }, 400);

    const from = esc(p.from_number);
    const twiml = `<Response><Say language="fr-FR" voice="alice">Amashia. Mise en relation avec votre client. Veuillez patienter.</Say>`
      + `<Dial callerId="${from}" timeLimit="${Math.max(60, Number(p.max_minutes) * 60)}" timeout="30"><Number>${esc(p.customer_phone)}</Number></Dial>`
      + `<Say language="fr-FR" voice="alice">Le client n'a pas répondu. Réessayez dans quelques minutes.</Say></Response>`;
    const body = new URLSearchParams({ To: p.courier_phone, From: p.from_number, Twiml: twiml, Timeout: "30" });
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${p.account_sid}/Calls.json`, {
      method: "POST",
      headers: { Authorization: "Basic " + btoa(`${p.account_sid}:${p.auth_token}`), "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      await db.rpc("masked_call_result", { _call: p.call_id, _sid: null, _status: "failed", _error: `${d.code ?? r.status} ${d.message ?? ""}` });
      return json({ error: "Le service d'appel a refusé l'appel : prévenez Amashia." }, 502);
    }
    await db.rpc("masked_call_result", { _call: p.call_id, _sid: d.sid ?? null, _status: d.status ?? "queued", _error: null });
    return json({ ok: true });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
