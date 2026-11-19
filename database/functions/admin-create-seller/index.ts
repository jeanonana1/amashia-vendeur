// Fonction Supabase « admin-create-seller » : un administrateur inscrit lui-même un vrai vendeur
// (commerçant peu à l'aise avec l'outil). Réservée aux administrateurs (double authentification + section Vendeurs).
// Le compte de connexion est créé avec la clé de service, jamais exposée à l'espace admin.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const URL = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
const OPEN = ["yaoundé", "yaounde", "douala"];
const str = (v: unknown, max = 120) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function genPassword() {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const b = crypto.getRandomValues(new Uint8Array(10));
  return "Am-" + Array.from(b, (x) => a[x % a.length]).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Connexion administrateur requise." }, 401);
    // 1) l'appelant est-il un administrateur autorisé ? (mêmes règles que toutes les fonctions admin)
    const caller = createClient(URL, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const { error: guard } = await caller.rpc("admin_guard", { _fn: "admin_create_seller" });
    if (guard) return json({ error: guard.message }, 403);

    const b = await req.json().catch(() => ({}));
    const first_name = str(b.first_name, 60), last_name = str(b.last_name, 60), shop_name = str(b.shop_name, 80);
    const digits = str(b.phone, 20).replace(/\D/g, "").replace(/^237(?=\d{9}$)/, "");
    const city = str(b.city, 60), region = str(b.region, 60), neighborhood = str(b.neighborhood, 80), category = str(b.category, 80);
    const account_type = b.account_type === "entreprise" ? "entreprise" : "particulier";
    const gender = b.gender === "Homme" || b.gender === "Femme" ? b.gender : null;
    const birth_date = /^\d{4}-\d{2}-\d{2}$/.test(str(b.birth_date, 10)) ? str(b.birth_date, 10) : null;
    let email = str(b.email, 120).toLowerCase();
    let password = str(b.password, 72);

    if (!first_name || !last_name) return json({ error: "Prénom et nom obligatoires." }, 400);
    if (!shop_name) return json({ error: "Nom de la boutique obligatoire." }, 400);
    if (!/^6\d{8}$/.test(digits)) return json({ error: "Numéro de téléphone : 9 chiffres commençant par 6." }, 400);
    if (!OPEN.includes(city.toLowerCase())) return json({ error: "Pour le moment, seules les boutiques de Yaoundé et de Douala sont acceptées." }, 400);
    if (!category) return json({ error: "Catégorie obligatoire." }, 400);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ error: "Adresse e-mail invalide." }, 400);
    if (password && password.length < 8) return json({ error: "Le mot de passe doit contenir au moins 8 caractères." }, 400);
    if (birth_date && new Date(birth_date) > new Date(Date.now() - 18 * 365.25 * 864e5)) return json({ error: "Le vendeur doit avoir au moins 18 ans." }, 400);
    const generated = !password;
    if (!password) password = genPassword();
    if (!email) email = `v${digits}@vendeur.amashia.cm`; // le vendeur se connecte aussi avec son numéro

    // 2) e-mail / téléphone déjà utilisés ?
    const { data: hint } = await admin.rpc("seller_account_hint", { _email: email, _phone: digits });
    if (hint?.exists) return json({ error: `Un compte existe déjà avec ${hint.via === "phone" ? "ce numéro" : "cet e-mail"}${hint.name ? ` (${hint.name})` : ""}.` }, 409);

    const phone = `+237${digits}`;
    const { data: created, error: e1 } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { account_type, first_name, last_name, phone, created_by_admin: true },
    });
    if (e1 || !created.user) return json({ error: `Création du compte impossible : ${e1?.message ?? "erreur inconnue"}` }, 500);
    const id = created.user.id;

    // 3) profil vendeur complet (la boutique publique est créée automatiquement par la base)
    const { error: e2 } = await admin.from("seller_profiles").insert({
      id, account_type, first_name, last_name, phone, shop_name, category, categories: [category],
      city, region: region || null, neighborhood: neighborhood || null, country: "Cameroun", language: "fr",
      gender, birth_date, shop_description: str(b.shop_description, 600) || null,
    });
    if (e2) {
      await admin.auth.admin.deleteUser(id); // pas de compte à moitié créé
      return json({ error: `Profil vendeur impossible : ${e2.message}` }, 500);
    }
    return json({ ok: true, user_id: id, email, password: generated ? password : null, phone });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
