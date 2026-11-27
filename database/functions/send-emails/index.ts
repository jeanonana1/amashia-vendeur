// Fonction Supabase « send-emails » : envoie les e-mails de commande via Brevo (API transactionnelle).
// La base met chaque événement dans la file email_outbox puis appelle cette fonction ; une tâche planifiée
// la relance toutes les 10 minutes pour les e-mails restés en attente.
// Secrets : BREVO_API_KEY (obligatoire), EMAIL_FROM (facultatif, défaut no-reply@amachia.com).
// Le vendeur ne reçoit jamais les coordonnées du client.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const KEY = Deno.env.get("BREVO_API_KEY") ?? "";
const FROM = Deno.env.get("EMAIL_FROM") || "no-reply@amachia.com";
const SITE = "https://amachia.com";
const SELLER_SITE = "https://seller.amachia.com";
const LOGO = `${SITE}/email-logo-amachia.png`;
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

type Job = { id: number; kind: string; order_id: string; seller_id: string | null; created_at: string };
type Item = { product_id: string; seller_id: string | null; product_title: string; unit_price_fcfa: number; quantity: number; color: string | null; size: string | null; discount_fcfa: number | null };
class Pause extends Error {}

// ---------------------------------------------------------------- mise en forme
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fcfa = (n: number) => `${Math.round(n || 0).toLocaleString("fr-FR").replace(/[  ]/g, " ")} FCFA`;
const day = (d: string) => new Date(d).toLocaleString("fr-FR", { timeZone: "Africa/Douala", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
const p = (t: string) => `<p style="margin:0 0 12px">${t}</p>`;
const small = (t: string) => `<p style="margin:16px 0 0;font-size:13px;color:#6b7280">${t}</p>`;

function layout(preheader: string, title: string, body: string, button?: [string, string], after = "") {
  const btn = button ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px"><tr><td style="border-radius:999px;background:#FF6800">
<a href="${button[1]}" style="display:inline-block;padding:14px 30px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;color:#000000;text-decoration:none;border-radius:999px">${button[0]}</a></td></tr></table>` : "";
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6"><div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden">
<tr><td style="background:#18212a;padding:22px 28px"><img src="${LOGO}" width="150" alt="Amachia" style="display:block;border:0;width:150px;height:auto"></td></tr>
<tr><td style="padding:30px 28px 10px;font-family:Arial,Helvetica,sans-serif;color:#1f2937;font-size:15px;line-height:1.6">
<h1 style="margin:0 0 14px;font-size:21px;line-height:1.3;color:#111827">${title}</h1>${body}${btn}${after}</td></tr>
<tr><td style="padding:18px 28px 26px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#6b7280;border-top:1px solid #eef0f2">
Amachia — achat en ligne au Cameroun · <a href="${SITE}" style="color:#6b7280">amachia.com</a><br>Cet e-mail est envoyé automatiquement, merci de ne pas y répondre. Une question ? <a href="${SITE}/contact" style="color:#6b7280">Contactez-nous</a>.
</td></tr></table></td></tr></table></body></html>`;
}

/** Petite photo du produit (optimiseur d'images du site) ; rien si la photo n'est pas une adresse web. */
const thumb = (img?: string) => (img && /^https:\/\//.test(img) ? `${SITE}/_vercel/image?url=${encodeURIComponent(img)}&w=128&q=75` : "");

function itemsTable(items: Item[], images: Map<string, string>) {
  const rows = items.map((i) => {
    const opts = [i.color, i.size].filter(Boolean).map(esc).join(" · ");
    const img = thumb(images.get(i.product_id));
    return `<tr>
<td width="64" style="padding:10px 0;border-bottom:1px solid #eef0f2;vertical-align:top">${img ? `<img src="${img}" width="56" height="56" alt="" style="display:block;width:56px;height:56px;object-fit:contain;border-radius:8px;background:#f9fafb">` : ""}</td>
<td style="padding:10px 8px;border-bottom:1px solid #eef0f2;vertical-align:top;font-size:14px">${esc(i.product_title)}${opts ? `<br><span style="color:#6b7280;font-size:12px">${opts}</span>` : ""}<br><span style="color:#6b7280;font-size:12px">Quantité : ${i.quantity}</span></td>
<td align="right" style="padding:10px 0;border-bottom:1px solid #eef0f2;vertical-align:top;font-size:14px;white-space:nowrap">${fcfa(i.unit_price_fcfa * i.quantity - (i.discount_fcfa ?? 0))}</td></tr>`;
  }).join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 4px">${rows}</table>`;
}

const line = (label: string, value: string, strong = false) =>
  `<tr><td style="padding:4px 0;font-size:14px;${strong ? "font-weight:700;color:#111827" : "color:#4b5563"}">${label}</td><td align="right" style="padding:4px 0;font-size:14px;${strong ? "font-weight:700;color:#111827" : "color:#4b5563"}">${value}</td></tr>`;

// ---------------------------------------------------------------- données
async function loadOrder(id: string) {
  const { data: o } = await db.from("orders").select("*").eq("id", id).maybeSingle();
  if (!o) return null;
  const { data: items } = await db.from("order_items").select("product_id, seller_id, product_title, unit_price_fcfa, quantity, color, size, discount_fcfa").eq("order_id", id);
  const ids = [...new Set((items ?? []).map((i) => i.product_id).filter(Boolean))];
  const { data: prods } = ids.length ? await db.from("products").select("id, images").in("id", ids) : { data: [] };
  const images = new Map<string, string>((prods ?? []).map((x: { id: string; images: unknown }) => [x.id, Array.isArray(x.images) ? String(x.images[0] ?? "") : ""]));
  return { o, items: (items ?? []) as Item[], images };
}

async function userEmail(userId: string | null) {
  if (!userId) return null;
  const { data } = await db.auth.admin.getUserById(userId);
  return data.user?.email ?? null;
}

// ---------------------------------------------------------------- e-mails
async function buildClientEmail(kind: string, order: NonNullable<Awaited<ReturnType<typeof loadOrder>>>) {
  const { o, items, images } = order;
  const to = (o.contact_email as string | null) || (await userEmail(o.user_id));
  if (!to) return null;
  const first = String(o.full_name ?? "").trim().split(/\s+/)[0] || "";
  const hello = p(`Bonjour${first ? ` ${esc(first)}` : ""},`);
  const num = esc(o.order_number);
  const track: [string, string] = ["Suivre ma commande", `${SITE}/track-order?order=${encodeURIComponent(o.order_number)}`];
  const delivery = o.shipping_mode === "agency"
    ? `Retrait en agence : <strong>${esc(o.shipping_agency_name ?? "")}</strong>${o.city ? ` (${esc(o.city)})` : ""}`
    : `Livraison à domicile : ${esc([o.address_details, o.district, o.city].filter(Boolean).join(", "))}`;
  const fees = (o.shipping_fee_fcfa ?? 0) + (o.agency_fee_fcfa ?? 0) + (o.dropoff_fee_fcfa ?? 0);
  const totals = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 14px">
${line("Sous-total", fcfa(o.subtotal_fcfa))}${line("Livraison", fees > 0 ? fcfa(fees) : "Offerte")}${(o.discount_fcfa ?? 0) > 0 ? line(`Réduction${o.coupon_code ? ` (${esc(o.coupon_code)})` : ""}`, `− ${fcfa(o.discount_fcfa)}`) : ""}${(o.points_used ?? 0) > 0 ? line("Points récompense utilisés", `${o.points_used}`) : ""}${line("Total", fcfa(o.total_fcfa), true)}</table>`;
  const recap = `${itemsTable(items, images)}${totals}<p style="margin:0 0 6px;font-size:14px;color:#4b5563">${delivery}</p><p style="margin:0 0 6px;font-size:14px;color:#4b5563">Paiement : ${esc(o.payment_method ?? "")}</p>`;

  switch (kind) {
    case "order_confirmed":
      return { to, name: o.full_name, subject: `Commande ${o.order_number} confirmée — Amachia`, html: layout(
        `Merci ! Votre commande ${o.order_number} est bien enregistrée.`, "Merci pour votre commande !",
        hello + p(`Votre commande <strong>${num}</strong> du ${day(o.created_at)} est bien enregistrée. Nous vous préviendrons à chaque étape, jusqu'à la livraison.`) + recap, track) };
    case "order_shipped":
      return { to, name: o.full_name, subject: `Votre commande ${o.order_number} est en route — Amachia`, html: layout(
        `Votre commande ${o.order_number} est en cours de livraison.`, "Votre commande est en route 🚚",
        hello + p(`Bonne nouvelle : votre commande <strong>${num}</strong> est en cours de livraison.`)
        + (o.delivery_code ? p(`Code de livraison à communiquer au livreur : <strong style="font-size:18px;letter-spacing:2px">${esc(o.delivery_code)}</strong>`) : "")
        + `<p style="margin:0 0 6px;font-size:14px;color:#4b5563">${delivery}</p>`, track,
        small("Gardez votre téléphone à portée de main : le livreur peut vous appeler à son arrivée.")) };
    case "order_delivered":
      return { to, name: o.full_name, subject: `Votre commande ${o.order_number} a été livrée — Amachia`, html: layout(
        `Votre commande ${o.order_number} a été livrée.`, "Votre commande a été livrée ✅",
        hello + p(`Votre commande <strong>${num}</strong> a été livrée. Merci de votre confiance !`)
        + (o.user_id ? p("Votre avis aide les autres clients : notez vos produits depuis votre compte.") : ""),
        o.user_id ? ["Donner mon avis", `${SITE}/account/reviews`] : track,
        small(`Un article ne convient pas ? Vous pouvez demander un retour depuis votre espace client (voir <a href="${SITE}/how-to-return" style="color:#6b7280">conditions de retour</a>).`)) };
    case "order_cancelled":
      return { to, name: o.full_name, subject: `Votre commande ${o.order_number} a été annulée — Amachia`, html: layout(
        `Votre commande ${o.order_number} a été annulée.`, "Votre commande a été annulée",
        hello + p(`Votre commande <strong>${num}</strong> a été annulée.`) + recap, ["Continuer mes achats", SITE],
        small(`Une question sur cette annulation ? <a href="${SITE}/contact" style="color:#6b7280">Contactez-nous</a>.`)) };
  }
  return null;
}

async function buildSellerEmail(order: NonNullable<Awaited<ReturnType<typeof loadOrder>>>, sellerId: string) {
  const { o, items, images } = order;
  const { data: s } = await db.from("sellers").select("owner_id, name").eq("id", sellerId).maybeSingle();
  if (!s?.owner_id) return { skip: "boutique sans compte vendeur" };
  const { data: prof } = await db.from("seller_profiles").select("first_name, notif_prefs").eq("id", s.owner_id).maybeSingle();
  if ((prof?.notif_prefs as Record<string, unknown> | null)?.email_orders === false) return { skip: "désactivé par le vendeur" };
  const to = await userEmail(s.owner_id);
  if (!to) return { skip: "adresse du vendeur introuvable" };
  const mine = items.filter((i) => i.seller_id === sellerId);
  if (!mine.length) return { skip: "aucun article de ce vendeur" };
  const amount = mine.reduce((sum, i) => sum + i.unit_price_fcfa * i.quantity - (i.discount_fcfa ?? 0), 0);
  // aucune coordonnée du client : uniquement les articles à préparer
  return { to, name: prof?.first_name ?? s.name, subject: `Nouvelle commande ${o.order_number} — ${s.name}`, html: layout(
    `Nouvelle commande ${o.order_number} : ${mine.length} article(s) à préparer.`, "Nouvelle commande 🎉",
    p(`Bonjour${prof?.first_name ? ` ${esc(prof.first_name)}` : ""},`) + p(`Votre boutique <strong>${esc(s.name)}</strong> a reçu une nouvelle commande (<strong>${esc(o.order_number)}</strong>, le ${day(o.created_at)}). Voici les articles à préparer :`)
    + itemsTable(mine, images) + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 10px">${line("Montant de vos articles", fcfa(amount), true)}</table>`,
    ["Voir la commande", `${SELLER_SITE}/dashboard/commandes`],
    small("Vous recevez cet e-mail car l'option « E-mail à chaque nouvelle commande » est activée dans Paramètres › Notifications.")) };
}

// ---------------------------------------------------------------- envoi
async function sendBrevo(m: { to: string; name?: string | null; subject: string; html: string }, tag: string) {
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": KEY, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ sender: { name: "Amachia", email: FROM }, to: [{ email: m.to, ...(m.name ? { name: String(m.name).slice(0, 70) } : {}) }], subject: m.subject, htmlContent: m.html, tags: [tag] }),
  });
  if (r.status === 401 || r.status === 403) throw new Pause(`Brevo a refusé la clé (${r.status}) : ${(await r.text()).slice(0, 200)}`);
  if (r.status === 429) throw new Pause("limite d'envoi Brevo atteinte pour le moment");
  if (!r.ok) throw new Error(`Brevo ${r.status} : ${(await r.text()).slice(0, 300)}`);
}

async function finish(id: number, patch: Record<string, unknown>) {
  await db.from("email_outbox").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
}

async function process(job: Job) {
  // un e-mail resté en attente plus de 48 h (clé ajoutée tardivement, panne…) n'a plus de sens : il n'est pas envoyé
  if (Date.now() - new Date(job.created_at).getTime() > 48 * 3600_000) return finish(job.id, { status: "skipped", error: "trop ancien (plus de 48 h)" });
  const order = await loadOrder(job.order_id);
  if (!order) return finish(job.id, { status: "skipped", error: "commande introuvable" });
  if (job.kind === "order_confirmed") {
    // e-mails des vendeurs concernés (préparés maintenant : les articles sont enregistrés)
    const sellers = [...new Set(order.items.map((i) => i.seller_id).filter((x): x is string => !!x))];
    // (doublon refusé par la base si l'e-mail existe déjà)
    for (const seller_id of sellers) await db.from("email_outbox").insert({ kind: "seller_new_order", order_id: job.order_id, seller_id }).then(() => {}, () => {});
  }
  const mail = job.kind === "seller_new_order" ? await buildSellerEmail(order, job.seller_id ?? "") : await buildClientEmail(job.kind, order);
  if (!mail) return finish(job.id, { status: "skipped", error: "aucune adresse e-mail" });
  if ("skip" in mail) return finish(job.id, { status: "skipped", error: mail.skip });
  await sendBrevo(mail, job.kind);
  await finish(job.id, { status: "sent", sent_at: new Date().toISOString(), error: null });
}

async function run() {
  if (!KEY) {
    await db.from("email_outbox").update({ error: "clé BREVO_API_KEY absente" }).eq("status", "pending");
    return { paused: "clé BREVO_API_KEY absente" };
  }
  let sent = 0;
  for (let round = 0; round < 3; round++) {
    const { data: jobs } = await db.rpc("email_outbox_claim", { _limit: 20 });
    if (!jobs?.length) break;
    for (const job of jobs as Job[]) {
      try { await process(job); sent++; }
      catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (e instanceof Pause) {
          await db.from("email_outbox").update({ status: "pending", error: msg }).eq("status", "processing");
          return { sent, paused: msg };
        }
        await finish(job.id, { status: "failed", error: msg.slice(0, 500) });
      }
    }
  }
  return { sent };
}

/** Aperçu d'un e-mail (sans envoi), pour vérification : { preview: kind, order_id } */
async function preview(kind: string, orderId: string, sellerId?: string) {
  const order = await loadOrder(orderId);
  if (!order) return null;
  const m = kind === "seller_new_order" ? await buildSellerEmail(order, sellerId ?? "") : await buildClientEmail(kind, order);
  return m && !("skip" in m) ? { subject: m.subject, html: m.html } : m;
}

/** État de la connexion Brevo (sans envoi) : clé valide, expéditeur, domaine authentifié. */
async function brevoStatus() {
  if (!KEY) return { key: "absente" };
  const get = async (path: string) => {
    const r = await fetch(`https://api.brevo.com/v3${path}`, { headers: { "api-key": KEY, accept: "application/json" } });
    return { status: r.status, data: await r.json().catch(() => null) };
  };
  const acc = await get("/account");
  if (acc.status !== 200) return { key: "refusée", status: acc.status, message: acc.data?.message };
  const senders = await get("/senders");
  const domains = await get("/senders/domains");
  const domain = FROM.split("@")[1];
  const d = (domains.data?.domains ?? []).find((x: { domain_name: string }) => x.domain_name === domain);
  const detail = d ? await get(`/senders/domains/${domain}`) : null;
  return {
    key: "valide",
    plans: (acc.data?.plan ?? []).map((p: { type: string; credits: number; creditsType: string }) => ({ type: p.type, credits: p.credits, creditsType: p.creditsType })),
    from: FROM,
    sender: (senders.data?.senders ?? []).map((s: { email: string; name: string; active: boolean }) => ({ email: s.email, name: s.name, active: s.active })),
    domain: d ? { name: d.domain_name, authenticated: d.authenticated, verified: d.verified } : "absent",
    dns: detail?.data?.dns_records ? Object.fromEntries(Object.entries(detail.data.dns_records).map(([k, v]) => [k, (v as { status?: boolean } | null)?.status ?? null])) : null,
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST uniquement" }, 405);
  const body = await req.json().catch(() => ({}));
  // aperçu réservé au service (clé de service dans l'en-tête)
  if (body?.preview || body?.check) {
    // la clé fournie doit pouvoir lire la file d'envoi, ce que seule la clé de service peut faire
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const check = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/email_outbox?select=id&limit=1`, { headers: { apikey: token, Authorization: `Bearer ${token}` } }).catch(() => null);
    if (!token || !check?.ok) return json({ error: "non autorisé" }, 401);
    if (body.check) return json(await brevoStatus().catch((e) => ({ error: String(e?.stack ?? e) })));
    return json(await preview(String(body.preview), String(body.order_id ?? ""), body.seller_id ? String(body.seller_id) : undefined));
  }
  // réponse immédiate : l'envoi continue en arrière-plan
  const task = run().catch((e) => console.error("send-emails", e));
  // @ts-ignore EdgeRuntime est fourni par Supabase
  if (typeof EdgeRuntime !== "undefined") { EdgeRuntime.waitUntil(task); return json({ accepted: true }, 202); }
  return json(await task);
});
