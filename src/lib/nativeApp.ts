import { supabase } from "@/integrations/supabase/client";

/**
 * Pont avec l'application Android « Amachia Seller » (le tableau de bord tourne dans l'application) :
 * jeton Firebase du téléphone pour les alertes de commandes, et vibration native.
 */
type CapacitorLike = { isNativePlatform?: () => boolean; registerPlugin?: <T>(name: string) => T };
type SellerAlerts = { pushToken: () => Promise<{ token: string }>; vibrate: () => Promise<void> };
const cap = (): CapacitorLike | undefined => (typeof window !== "undefined" ? (window as unknown as { Capacitor?: CapacitorLike }).Capacitor : undefined);
let plugin: SellerAlerts | null = null;
const alerts = () => (plugin ??= cap()?.registerPlugin?.<SellerAlerts>("SellerAlerts") ?? null);

/** Vrai quand le tableau de bord est ouvert dans l'application Android Amachia Seller. */
export const isSellerApp = () => !!cap()?.isNativePlatform?.();

/** Enregistre ce téléphone pour recevoir les alertes de commandes (sonnerie + vibration, application fermée). */
export async function registerAppPush(): Promise<boolean> {
  if (!isSellerApp()) return false;
  try {
    const p = alerts();
    if (!p) return false;
    const { token } = await p.pushToken();
    const { error } = await (supabase as unknown as { rpc: (f: string, a: unknown) => Promise<{ error: unknown }> }).rpc("seller_fcm_register", { _token: token });
    return !error;
  } catch { return false; }
}

/** Vibration du téléphone dans l'application (la WebView ignore navigator.vibrate). */
export function appVibrate() {
  if (!isSellerApp()) return false;
  void alerts()?.vibrate().catch(() => {});
  return true;
}

/** Adresse de téléchargement de l'APK (publiée automatiquement à chaque compilation). */
export const APK_URL = "/download/amashia-seller.apk";
