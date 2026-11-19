import { supabase } from "@/integrations/supabase/client";

export type AccountHint = { exists: boolean; via?: "email" | "phone"; name?: string; is_seller?: boolean };

/** Un compte existe-t-il déjà avec cet e-mail ou ce numéro ? (renvoie seulement prénom + initiale) */
export async function accountHint(opts: { email?: string; phone?: string }): Promise<AccountHint> {
  const { data, error } = await (supabase as any).rpc("seller_account_hint", { _email: opts.email ?? null, _phone: opts.phone ?? null });
  if (error || !data) return { exists: false };
  return data as AccountHint;
}

/** Connexion par e-mail ou par numéro de téléphone (le numéro retrouve l'e-mail seulement si le mot de passe est bon). */
export async function signInSeller(opts: { email?: string; phone?: string; password: string }): Promise<string | null> {
  let email = opts.email?.trim();
  if (!email && opts.phone) {
    const { data } = await (supabase as any).rpc("seller_login_email", { _phone: opts.phone, _password: opts.password });
    if (!data) return "Numéro ou mot de passe incorrect.";
    email = data as string;
  }
  if (!email) return "Identifiant manquant.";
  const { error } = await supabase.auth.signInWithPassword({ email, password: opts.password });
  if (!error) return null;
  if (/invalid login credentials/i.test(error.message)) return "Mot de passe incorrect.";
  if (/not confirmed/i.test(error.message)) return "Adresse e-mail pas encore confirmée : ouvrez le lien reçu par e-mail.";
  return error.message;
}
