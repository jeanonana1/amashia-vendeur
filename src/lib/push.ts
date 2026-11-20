import { supabase } from "@/integrations/supabase/client";

/** Alertes push « Nouvelle commande » du vendeur : reçues même navigateur fermé / téléphone verrouillé. */
export type PushState = "unsupported" | "ios-install" | "denied" | "off" | "on";

const db = supabase as unknown as { rpc: (f: string, a?: unknown) => Promise<{ data: unknown; error: { message: string } | null }> };
async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

function b64ToBytes(b64: string) {
  const s = (b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(s); const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function registerSW() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  try { return await navigator.serviceWorker.register("/sw.js", { scope: "/" }); } catch { return null; }
}

export async function pushState(): Promise<PushState> {
  if (typeof window === "undefined") return "unsupported";
  if (isIos() && !isStandalone()) return "ios-install";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await registerSW();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub || Notification.permission !== "granted") return "off";
  try {
    const st = await rpc<{ subscribed: boolean }>("seller_push_status", { _endpoint: sub.endpoint });
    if (!st.subscribed) await saveSub(sub); // abonnement local perdu côté serveur : on le renvoie
  } catch { /* hors ligne */ }
  return "on";
}

async function saveSub(sub: PushSubscription) {
  await rpc("seller_push_subscribe", { _sub: sub.toJSON(), _ua: navigator.userAgent });
}

export async function enablePush(): Promise<PushState> {
  const st = await pushState();
  if (st === "unsupported" || st === "ios-install") return st;
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return perm === "denied" ? "denied" : "off";
  const reg = await registerSW();
  if (!reg) return "unsupported";
  await navigator.serviceWorker.ready;
  const key = await rpc<string | null>("push_public_key");
  if (!key) throw new Error("Clé d'alerte indisponible : réessayez dans un instant.");
  let sub = await reg.pushManager.getSubscription();
  if (sub) {
    const cur = sub.options?.applicationServerKey ? btoa(String.fromCharCode(...new Uint8Array(sub.options.applicationServerKey))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") : key;
    if (cur !== key) { await sub.unsubscribe(); sub = null; }
  }
  sub = sub ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) });
  await saveSub(sub);
  return "on";
}

export async function disablePush(): Promise<PushState> {
  const reg = await registerSW();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) { try { await rpc("seller_push_unsubscribe", { _endpoint: sub.endpoint }); } catch { /* ignore */ } await sub.unsubscribe(); }
  return "off";
}

/** Envoie une alerte d'essai à cet appareil uniquement. */
export async function testPush() {
  const reg = await registerSW();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) throw new Error("Activez d'abord les alertes sur cet appareil.");
  const r = await fetch("https://oawobzuyjkcnmaorqfmh.supabase.co/functions/v1/seller-order-push", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ test_endpoint: sub.endpoint }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.sent) throw new Error("L'alerte d'essai n'a pas pu être envoyée.");
}
