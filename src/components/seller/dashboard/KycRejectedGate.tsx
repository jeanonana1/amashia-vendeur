import { useEffect, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { AlertTriangle, FileWarning, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Kyc = { seller_id: string; status: "pending" | "approved" | "rejected"; note: string | null; reviewed_at: string | null } | null;
const db = supabase as unknown as { rpc: (f: string) => PromiseLike<{ data: unknown }> };

/**
 * Candidature refusée par Amachia : grande fenêtre avec le motif, impossible à ignorer.
 * Apparaît en temps réel (dès que l'admin refuse) et à chaque retour sur l'espace vendeur.
 */
export function KycRejectedGate() {
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [kyc, setKyc] = useState<Kyc>(null);

  useEffect(() => {
    let alive = true;
    const load = () => void db.rpc("seller_kyc").then(({ data }) => { if (alive) setKyc((data as Kyc) ?? null); });
    load();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    window.addEventListener("kyc:changed", onFocus);
    return () => { alive = false; window.removeEventListener("focus", onFocus); window.removeEventListener("kyc:changed", onFocus); };
  }, []);

  // temps réel : la décision de l'admin s'affiche aussitôt
  useEffect(() => {
    if (!kyc?.seller_id) return;
    const ch = supabase.channel(`kyc-${kyc.seller_id}`)
      .on("postgres_changes" as never, { event: "UPDATE", schema: "public", table: "sellers", filter: `id=eq.${kyc.seller_id}` } as never,
        () => void db.rpc("seller_kyc").then(({ data }) => setKyc((data as Kyc) ?? null)))
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [kyc?.seller_id]);

  if (kyc?.status !== "rejected" || path.startsWith("/dashboard/candidature")) return null;

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/80 p-4 backdrop-blur-sm" role="alertdialog" aria-modal="true" aria-labelledby="kyc-title">
      <div className="w-full max-w-xl overflow-hidden rounded-3xl border border-destructive/40 bg-card shadow-2xl">
        <div className="flex flex-col items-center gap-3 bg-destructive/15 px-6 pb-6 pt-8 text-center">
          <span className="grid h-20 w-20 place-items-center rounded-full bg-destructive text-white shadow-lg"><FileWarning size={40} /></span>
          <h2 id="kyc-title" className="text-2xl font-extrabold sm:text-3xl">Votre candidature a été refusée</h2>
          <p className="text-sm text-muted-foreground">L'équipe Amachia a examiné votre dossier vendeur.{kyc.reviewed_at ? ` Décision du ${new Date(kyc.reviewed_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}.` : ""}</p>
        </div>
        <div className="space-y-5 p-6">
          <div className="rounded-2xl border-2 border-destructive/50 bg-destructive/5 p-4">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-destructive"><AlertTriangle size={15} /> Motif du refus</p>
            <p className="mt-2 whitespace-pre-line text-lg font-semibold leading-snug">{kyc.note || "Aucun motif précisé."}</p>
          </div>
          <p className="text-sm text-muted-foreground">Corrigez les éléments indiqués puis renvoyez votre dossier : il sera examiné à nouveau. Tant que la candidature n'est pas validée, votre boutique ne peut pas vendre.</p>
          <button type="button" onClick={() => navigate({ to: "/dashboard/candidature" as never })}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-4 text-base font-bold text-black shadow-lg">
            <RefreshCw size={18} /> Corriger et renvoyer mon dossier
          </button>
          <button type="button" onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/connexion" as never, replace: true }); }}
            className="w-full text-center text-sm text-muted-foreground underline">Me déconnecter</button>
        </div>
      </div>
    </div>
  );
}
