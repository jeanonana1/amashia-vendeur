import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Loader2, LocateFixed } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Section épinglée en haut du tableau de bord tant que le vendeur n'a pas partagé la position de sa boutique
 * (point de retrait des livreurs). Elle ne peut pas être fermée : elle disparaît une fois la position enregistrée.
 */
export function PickupReminder() {
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    const check = () => void supabase.rpc("seller_pickup" as never).then(({ data }) => {
      const v = data as { lat: number | null } | null;
      if (alive) setMissing(!!v && v.lat == null);
    });
    check();
    // enregistrée depuis la page « Ma boutique » : la section disparaît aussitôt
    window.addEventListener("pickup:saved", check);
    return () => { alive = false; window.removeEventListener("pickup:saved", check); };
  }, []);

  if (!missing) return null;

  const share = () => {
    if (!navigator.geolocation) return toast.error("La localisation n'est pas disponible sur cet appareil.");
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (p) => {
        const { error } = await supabase.rpc("seller_set_pickup" as never, { _lat: p.coords.latitude, _lng: p.coords.longitude, _address: null } as never);
        setBusy(false);
        if (error) return toast.error(error.message.replace(/^.*?:\s(?=[A-ZÀ-Ü])/, ""));
        toast.success("Position de la boutique enregistrée", { description: "Les livreurs les plus proches recevront vos commandes en premier." });
        setMissing(false);
        window.dispatchEvent(new Event("pickup:saved"));
      },
      (e) => { setBusy(false); toast.error(e.code === 1 ? "Autorisez la localisation dans votre navigateur, puis réessayez." : "Position introuvable. Réessayez à l'extérieur ou près d'une fenêtre."); },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  };

  return (
    <div role="region" aria-label="Position de la boutique à partager"
      className="sticky top-[4.5rem] z-20 mb-6 rounded-2xl border border-primary/40 bg-card p-3 shadow-card sm:p-4">
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary sm:h-11 sm:w-11"><LocateFixed size={20} /></span>
          <div className="min-w-0">
            <p className="text-sm font-bold sm:text-base">Partagez la position de votre boutique</p>
            <p className="text-xs text-muted-foreground sm:text-sm">Indispensable pour que les livreurs récupèrent vos colis. À faire depuis la boutique.</p>
          </div>
        </div>
        <div className="flex items-center gap-3 sm:flex-col sm:items-end sm:gap-1.5">
          <button type="button" onClick={share} disabled={busy}
            className="flex h-10 flex-1 items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-bold text-black disabled:opacity-60 sm:h-11 sm:flex-none sm:px-5">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <LocateFixed size={16} />}Partager ma position
          </button>
          <Link to="/dashboard/boutique" className="shrink-0 text-xs font-semibold text-primary hover:underline">Ajouter un repère</Link>
        </div>
      </div>
    </div>
  );
}
