import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Villes où Amachia accepte les vendeurs pour le moment. */
export const OPEN_CITIES = ["Yaoundé", "Douala"];
export const isOpenCity = (c: string) => OPEN_CITIES.some((o) => o.localeCompare(c, "fr", { sensitivity: "base" }) === 0);

export type CmLocations = {
  regions: string[];
  citiesByRegion: Record<string, string[]>;
  districtsByCity: Record<string, string[]>;
  regionOfCity: Record<string, string>;
};

let cache: CmLocations | null = null;
let pending: Promise<CmLocations> | null = null;

async function load(): Promise<CmLocations> {
  const db = supabase as any;
  const [{ data: cities }, { data: districts }] = await Promise.all([
    db.from("cm_cities").select("city, region"),
    // tous les quartiers actifs de la base (ceux ajoutés depuis l'espace admin apparaissent aussi)
    db.from("cm_districts").select("name, city, region").eq("is_active", true).order("name").limit(5000),
  ]);
  const citiesByRegion: Record<string, Set<string>> = {};
  const districtsByCity: Record<string, Set<string>> = {};
  const regionOfCity: Record<string, string> = {};
  const add = (region: string, city: string) => {
    if (!region || !city) return;
    (citiesByRegion[region] ??= new Set()).add(city);
    regionOfCity[city] = region;
  };
  for (const c of (cities ?? []) as { city: string; region: string }[]) add(c.region, c.city);
  for (const d of (districts ?? []) as { name: string; city: string; region: string }[]) {
    add(d.region, d.city);
    (districtsByCity[d.city] ??= new Set()).add(d.name);
  }
  const sort = (a: string, b: string) => a.localeCompare(b, "fr");
  const regions = Object.keys(citiesByRegion).sort((a, b) => {
    // les régions de Yaoundé et Douala d'abord
    const oa = [...citiesByRegion[a]].some(isOpenCity) ? 0 : 1, ob = [...citiesByRegion[b]].some(isOpenCity) ? 0 : 1;
    return oa - ob || sort(a, b);
  });
  return {
    regions,
    citiesByRegion: Object.fromEntries(Object.entries(citiesByRegion).map(([k, v]) => [k, [...v].sort((a, b) => (isOpenCity(a) ? 0 : 1) - (isOpenCity(b) ? 0 : 1) || sort(a, b))])),
    districtsByCity: Object.fromEntries(Object.entries(districtsByCity).map(([k, v]) => [k, [...v].sort(sort)])),
    regionOfCity,
  };
}

export function useCmLocations() {
  const [data, setData] = useState<CmLocations | null>(cache);
  useEffect(() => {
    if (cache) return;
    pending ??= load().then((d) => (cache = d)).catch(() => { pending = null; return { regions: [], citiesByRegion: {}, districtsByCity: {}, regionOfCity: {} }; });
    let on = true;
    void pending.then((d) => on && setData(d));
    return () => { on = false; };
  }, []);
  return data;
}
