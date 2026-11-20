import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/** Adresse publique du site client (marketplace). */
export const MARKETPLACE_URL = (import.meta.env.VITE_MARKETPLACE_URL as string | undefined)?.replace(/\/$/, "") || "https://amachia.com";

/** Lien vers la fiche d'un produit publié sur le site client. */
export function marketplaceProductUrl(marketplaceProductId: string) {
  return `${MARKETPLACE_URL}/product/${marketplaceProductId}`;
}

/**
 * Garantit que le compte connecté possède une fiche vendeur.
 * À la création, la fiche est remplie avec les informations saisies
 * à l'inscription (enregistrées dans les métadonnées du compte).
 * La création de la fiche crée aussi la boutique visible sur le site client.
 */
export async function ensureSellerProfile(user: User) {
  const { data: existing } = await supabase.from("seller_profiles").select("id").eq("id", user.id).maybeSingle();
  if (existing) return;
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const pending = (meta.seller_profile ?? {}) as Record<string, unknown>;
  await supabase.from("seller_profiles").insert({
    id: user.id,
    account_type: (meta.account_type as string) || "particulier",
    first_name: (meta.first_name as string) || null,
    last_name: (meta.last_name as string) || null,
    phone: (meta.phone as string) || null,
    ...pending,
  } as never);
}
