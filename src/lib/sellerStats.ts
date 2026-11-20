import { useCallback, useEffect, useRef, useState } from "react";
import { playSound } from "@/lib/sound";
import { supabase } from "@/integrations/supabase/client";

/** Statistiques réelles du vendeur connecté (fonction seller_dashboard_stats de la base). */
export interface SellerStats {
  days: number;
  balance: number;
  pending_balance: number;
  revenue: number;
  revenue_prev: number;
  orders: number;
  orders_prev: number;
  customers: number;
  customers_prev: number;
  products: number;
  products_online: number;
  visits: number;
  visits_prev: number;
  visitors: number;
  visits_today: number;
  shop_views: number;
  product_views: number;
  cart_adds: number;
  funnel: { visitors: number; product_viewers: number; cart_adders: number; buyers: number };
  series: { at: string; views: number; carts: number; orders: number; revenue: number }[];
  top_products: { title: string; quantity: number; revenue: number }[];
  followers: number;
  rating: number | null;
  reviews: number;
  shop: { id: string; slug: string; name: string } | null;
}

/** Adresse publique du site client (marketplace). */
export const MARKETPLACE_URL = ((import.meta.env.VITE_MARKETPLACE_URL as string | undefined) || "https://amachia.com").replace(/\/$/, "");

export const money = (n: number) => `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")} FCFA`;
export const num = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");

/** Évolution en % par rapport à la période précédente (null si pas de base de comparaison). */
export function trend(current: number, previous: number): number | null {
  if (!previous) return current > 0 ? null : 0;
  return ((current - previous) / previous) * 100;
}

export function useSellerStats(days: number, refreshMs = 60_000) {
  const [stats, setStats] = useState<SellerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    let data: unknown = null; let error: { message: string } | null = null;
    try { ({ data, error } = await (supabase as any).rpc("seller_dashboard_stats", { _days: days })); }
    catch (e) { error = { message: (e as Error).message }; }
    if (error) setError(error.message);
    else { setStats(data as SellerStats | null); setError(null); }
    setLoading(false);
  }, [days]);

  useEffect(() => {
    setLoading(true);
    void load();
    const t = window.setInterval(() => void load(), refreshMs);
    return () => window.clearInterval(t);
  }, [load, refreshMs]);

  return { stats, loading, error, reload: load };
}

/** Nombre de personnes actuellement sur la boutique (ou un de ses produits), en temps réel. */
export function useLiveVisitors(sellerId?: string) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!sellerId) return;
    const channel = supabase.channel(`shop-presence:${sellerId}`);
    const update = () => setCount(Object.keys(channel.presenceState()).length);
    channel.on("presence", { event: "sync" }, update).on("presence", { event: "join" }, update).on("presence", { event: "leave" }, update).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [sellerId]);
  return count;
}

const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
/** Date et heure (heure du Cameroun) : « 13 nov. 2026 à 14h05 ». */
export function dateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const l = new Date(d.getTime() + 60 * 60 * 1000); // UTC+1
  return `${l.getUTCDate()} ${MOIS[l.getUTCMonth()]} ${l.getUTCFullYear()} à ${String(l.getUTCHours()).padStart(2, "0")}h${String(l.getUTCMinutes()).padStart(2, "0")}`;
}

/** Signalé quand le vendeur ouvre la page Commandes (le compteur du menu disparaît). */
export const ORDERS_SEEN_EVENT = "amashia:orders-seen";
export const REVIEWS_SEEN_EVENT = "amashia:reviews-seen";
export const NOTIFS_SEEN_EVENT = "amashia:notifications-seen";

/** Compteurs du menu : produits signalés non traités et nouvelles commandes depuis la dernière visite. */
export function useNavBadges(refreshMs = 20_000) {
  const [badges, setBadges] = useState<{ reports: number; orders: number; reviews: number; notifications: number; returns: number }>({ reports: 0, orders: 0, reviews: 0, notifications: 0, returns: 0 });
  const lastNotifs = useRef<number | null>(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const db = supabase as any;
      try {
        const [r, o, v, n, ret] = await Promise.all([
          db.from("product_reports").select("id", { count: "exact", head: true }).eq("seller_id", user.id).eq("status", "pending"),
          db.rpc("seller_new_orders_count"),
          db.rpc("seller_new_reviews_count"),
          db.rpc("seller_unread_notifications"),
          db.rpc("seller_returns_todo_count"),
        ]);
        const notifications = Number(n.data ?? 0);
        // un petit son quand une nouvelle notification arrive pendant que le vendeur est connecté
        if (lastNotifs.current !== null && notifications > lastNotifs.current) playSound("notify");
        lastNotifs.current = notifications;
        // commandes et avis reçus depuis la dernière visite des pages Commandes / Avis
        if (alive) setBadges({ reports: r.count ?? 0, orders: Number(o.data ?? 0), reviews: Number(v.data ?? 0), notifications, returns: Number(ret.data ?? 0) });
      } catch { /* coupure réseau : nouvel essai au prochain passage */ }
    };
    void load();
    const t = window.setInterval(load, refreshMs);
    // les nouveaux avis/commandes apparaissent quasi en direct (toutes les 20 s, et au retour sur l'onglet)
    const onFocus = () => void load();
    window.addEventListener(ORDERS_SEEN_EVENT, load);
    window.addEventListener(REVIEWS_SEEN_EVENT, load);
    window.addEventListener(NOTIFS_SEEN_EVENT, load);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      alive = false; window.clearInterval(t);
      window.removeEventListener(ORDERS_SEEN_EVENT, load); window.removeEventListener(REVIEWS_SEEN_EVENT, load); window.removeEventListener(NOTIFS_SEEN_EVENT, load);
      window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onFocus);
    };
  }, [refreshMs]);
  return badges;
}
