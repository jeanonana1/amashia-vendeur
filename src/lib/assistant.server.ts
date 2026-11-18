import Anthropic from "@anthropic-ai/sdk";

/**
 * Assistant Amashia (page Contact du site client).
 * Il ne répond qu'avec les données de la base : chaque question concrète passe par un outil
 * (recherche de produits, suivi de commande vérifié, livraison / agences, message à l'équipe).
 */
const MODEL = "claude-haiku-5-5";
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const ANON = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

async function rpc(fn: string, args: Record<string, unknown>) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const t = await r.text();
  if (!r.ok) { try { return { erreur: JSON.parse(t).message }; } catch { return { erreur: "indisponible" }; } }
  try { return JSON.parse(t); } catch { return t; }
}

const tools: Anthropic.Tool[] = [
  { name: "chercher_produits", description: "Cherche des produits en vente sur Amashia (prix réels en FCFA, stock, vendeur, lien). À utiliser pour toute question sur un produit, un prix, une disponibilité ou une marque.",
    input_schema: { type: "object", properties: { recherche: { type: "string", description: "mots-clés : nom, marque ou catégorie (ex. « samsung a15 », « écouteurs »)" } }, required: ["recherche"] } },
  { name: "suivre_commande", description: "Statut exact d'une commande. Il faut le numéro de commande (ex. AMA-XXXX) ET le téléphone ou l'e-mail utilisé pour la commande. Ne jamais deviner : demander ces deux informations au client.",
    input_schema: { type: "object", properties: { numero: { type: "string" }, contact: { type: "string", description: "téléphone (9 chiffres) ou e-mail de la commande" } }, required: ["numero", "contact"] } },
  { name: "infos_livraison", description: "Frais et délai de livraison pour une ville (et un quartier), mode (domicile ou agence), agences d'expédition, seuil de livraison gratuite, abonnement Prime.",
    input_schema: { type: "object", properties: { ville: { type: "string" }, quartier: { type: "string" } }, required: ["ville"] } },
  { name: "transmettre_a_l_equipe", description: "Enregistre un message pour le service client Amashia (réclamation, problème, demande que l'assistant ne peut pas régler). Demander d'abord le nom et un téléphone ou e-mail.",
    input_schema: { type: "object", properties: { nom: { type: "string" }, telephone: { type: "string" }, email: { type: "string" }, sujet: { type: "string" }, numero_commande: { type: "string" }, message: { type: "string" } }, required: ["nom", "message"] } },
];

async function runTool(name: string, input: Record<string, string>) {
  switch (name) {
    case "chercher_produits": return rpc("assistant_products", { _q: String(input.recherche ?? "").slice(0, 80) });
    case "suivre_commande": return rpc("assistant_order", { _number: String(input.numero ?? "").slice(0, 40), _contact: String(input.contact ?? "").slice(0, 80) });
    case "infos_livraison": return rpc("assistant_delivery", { _city: String(input.ville ?? "").slice(0, 60), _district: input.quartier ? String(input.quartier).slice(0, 60) : null });
    case "transmettre_a_l_equipe": return rpc("support_contact", { _name: input.nom, _phone: input.telephone ?? null, _email: input.email ?? null, _topic: input.sujet ?? "Assistant", _order: input.numero_commande ?? null, _message: input.message, _source: "assistant" });
    default: return { erreur: "outil inconnu" };
  }
}

const SYSTEM = `Tu es l'assistant du service client d'Amashia, place de marché en ligne au Cameroun (site amashia-client.vercel.app). Tu réponds en français, de façon chaleureuse, courte et précise (3 à 6 phrases maximum, listes si utile).

RÈGLES ABSOLUES
- Tu ne donnes JAMAIS une information factuelle (prix, stock, statut de commande, frais, délais, agences) sans l'avoir obtenue par un outil pendant cette conversation. Si l'outil ne renvoie rien, dis-le simplement.
- Prix en FCFA avec espaces (ex. 95 000 FCFA). Pour un produit, donne le lien relatif renvoyé par l'outil, au format markdown [titre](lien).
- Suivi de commande : demande le numéro de commande ET le téléphone ou l'e-mail utilisé ; n'affiche jamais d'informations d'une commande non vérifiée.
- N'invente jamais de numéro de téléphone, d'adresse e-mail, de promotion ou de politique. Si tu ne sais pas, propose de transmettre la demande à l'équipe (outil transmettre_a_l_equipe) après avoir demandé nom + téléphone ou e-mail, puis donne la référence du message.
- Ne parle que d'Amashia et de ses services. Refuse poliment les autres sujets.

INFORMATIONS GÉNÉRALES FIABLES
- Paiement : à la livraison (espèces), Orange Money, MTN Mobile Money, carte bancaire.
- Commande possible sans compte ; un compte permet de suivre ses commandes et de gagner 1 % du montant en points récompense (1 point = 1 FCFA de réduction).
- Suivi : page « Suivre ma commande » (/track-order) ou « Mon compte → Commandes ».
- Étapes d'une commande : Commande reçue → En préparation → En cours de livraison → Livrée.
- Retours : page « Retours » (/returns) et « Comment retourner un article » (/how-to-return) ; politique complète sur /legal/returns.
- Mot de passe oublié : page /forgot-password.
- Livraison : à domicile par les livreurs Amashia (Prime) dans les villes couvertes, sinon expédition par agence de voyage ; utilise toujours l'outil infos_livraison pour les frais et délais exacts.`;

export type ChatMsg = { role: "user" | "assistant"; content: string };

export async function answer(history: ChatMsg[]): Promise<string> {
  const client = new Anthropic({ timeout: 45_000, maxRetries: 1 });
  const messages: Anthropic.MessageParam[] = history.map((m) => ({ role: m.role, content: m.content }));
  for (let i = 0; i < 5; i++) {
    const res = await client.messages.create({ model: MODEL, max_tokens: 700, system: SYSTEM, tools, messages });
    if (res.stop_reason !== "tool_use") {
      return res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n").trim() || "Je n'ai pas compris, pouvez-vous reformuler ?";
    }
    messages.push({ role: "assistant", content: res.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const b of res.content) {
      if (b.type !== "tool_use") continue;
      const out = await runTool(b.name, (b.input ?? {}) as Record<string, string>).catch(() => ({ erreur: "service indisponible" }));
      results.push({ type: "tool_result", tool_use_id: b.id, content: JSON.stringify(out).slice(0, 8000) });
    }
    messages.push({ role: "user", content: results });
  }
  return "Je n'ai pas pu terminer la recherche. Pouvez-vous reformuler votre question ?";
}
