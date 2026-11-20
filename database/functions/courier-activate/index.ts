// Fonction Supabase « courier-activate » : premier accès (ou mot de passe oublié) d'un livreur dans l'application.
// Le livreur saisit son numéro, le code à 6 chiffres donné par Amachia (admin → Livreurs) et son mot de passe.
// Le compte de connexion est créé (ou son mot de passe remplacé) avec la clé de service, jamais exposée à l'application.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
export const courierEmail = (digits: string) => `l${digits}@livreur.amashia.cm`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const { phone, code, password } = await req.json().catch(() => ({}));
    if (typeof password !== "string" || password.length < 6) return json({ error: "Le mot de passe doit contenir au moins 6 caractères." }, 400);
    if (!/^\d{6}$/.test(String(code ?? ""))) return json({ error: "Le code d'activation contient 6 chiffres." }, 400);
    const { data: chk, error } = await db.rpc("courier_check_activation", { _phone: String(phone ?? ""), _code: String(code) });
    if (error) return json({ error: "Vérification impossible, réessayez." }, 500);
    if (!chk?.ok) return json({ error: chk?.error ?? "Code incorrect." }, 400);

    const email = courierEmail(chk.digits);
    let userId: string | null = chk.user_id ?? null;
    if (userId) {
      const { error: e } = await db.auth.admin.updateUserById(userId, { password, email, email_confirm: true });
      if (e) return json({ error: "Mise à jour du mot de passe impossible." }, 500);
    } else {
      const { data, error: e } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { role: "courier", full_name: chk.full_name } });
      if (e || !data.user) return json({ error: "Création du compte impossible : contactez Amachia." }, 500);
      userId = data.user.id;
    }
    await db.rpc("courier_link_account", { _courier: chk.courier_id, _user: userId });
    return json({ ok: true, email });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
