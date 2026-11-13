import { useCallback, useEffect, useState } from "react";
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
export const MARKETPLACE_URL = ((import.meta.env.VITE_MARKETPLACE_URL as string | undefined) || "https://amashia-client.vercel.app").replace(/\/$/, "");

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
    const { data, error } = await (supabase as any).rpc("seller_dashboard_stats", { _days: days });
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
