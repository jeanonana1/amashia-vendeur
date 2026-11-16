/**
 * Numéros camerounais : 9 chiffres (sans l'indicatif +237), commençant obligatoirement par 6.
 * Saisie : seuls les chiffres sont acceptés, 9 au maximum ; un « +237 » collé est retiré automatiquement.
 */
export function cmDigits(raw: string | null | undefined): string {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.length > 9 && d.startsWith("237")) d = d.slice(3);
  if (d.startsWith("00237")) d = d.slice(5);
  return d.slice(0, 9);
}
/** Message d'erreur (ou null si le numéro est valide). `partial` : pendant la saisie, on ne signale que le mauvais premier chiffre. */
export function cmPhoneError(d: string, partial = false): string | null {
  if (!d) return partial ? null : "Indiquez un numéro de téléphone.";
  if (d[0] !== "6") return "Au Cameroun, le numéro doit commencer par 6.";
  if (!partial && d.length !== 9) return "Le numéro doit contenir exactement 9 chiffres.";
  return null;
}
export const isCmPhone = (d: string) => /^6\d{8}$/.test(d);
/** Format d'enregistrement / d'affichage : +237 6XX XX XX XX */
export const formatCm = (d: string) => (isCmPhone(d) ? `+237 ${d.slice(0, 3)} ${d.slice(3, 5)} ${d.slice(5, 7)} ${d.slice(7, 9)}` : d);
/** Format international compact (connexion par téléphone) : +2376XXXXXXXX */
export const toE164 = (d: string) => `+237${d}`;
