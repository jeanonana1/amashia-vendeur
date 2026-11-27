import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BellRing, BellOff, Smartphone, Loader2, Volume2 } from "lucide-react";
import { IconPartager as Share, IconAjouterProduit as PlusSquare, IconValide as CheckCircle2 } from "@/components/icons/AmachiaIcons";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { enablePush, disablePush, pushState, testPush, type PushState } from "@/lib/push";
import { testOrderSound } from "@/components/seller/dashboard/NewOrderAlarm";

const btn = "inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition disabled:opacity-60";

/** Bouton de l'en-tête : sonnerie des nouvelles commandes sur cet appareil (même navigateur fermé, écran verrouillé). */
export function PushAlertsButton({ className }: { className: string }) {
  const [state, setState] = useState<PushState | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { void pushState().then(setState).catch(() => setState("unsupported")); }, []);
  if (state === null) return null;
  const on = state === "on";

  const run = async (fn: () => Promise<PushState | void>, ok?: string) => {
    setBusy(true);
    try { const r = await fn(); if (r) setState(r); if (ok) toast.success(ok); }
    catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  };

  return (
    <>
      <button onClick={() => setOpen(true)} className={`${className} relative`} title={on ? "Sonnerie des commandes activée sur cet appareil" : "Activer la sonnerie des nouvelles commandes"} aria-label="Alertes de commandes">
        {on ? <BellRing size={17} className="text-primary" /> : <BellOff size={17} />}
        {!on && <span className="badge-beat absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary" />}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Smartphone size={20} className="text-primary" />Sonnerie des nouvelles commandes</DialogTitle>
            <DialogDescription>Une sonnerie retentit à chaque nouvelle commande de votre boutique : dans l'espace vendeur, et aussi navigateur fermé ou téléphone verrouillé une fois les alertes activées sur l'appareil.</DialogDescription>
          </DialogHeader>
          <button onClick={() => testOrderSound()} className={`${btn} border border-border bg-card hover:bg-muted`}><Volume2 size={16} />Écouter la sonnerie</button>
          {state === "on" && (
            <div className="space-y-3">
              <p className="flex items-center gap-2 rounded-xl bg-emerald-500/10 p-3 text-sm font-semibold text-emerald-600"><CheckCircle2 size={16} />Alertes activées sur cet appareil.</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button className={`${btn} btn-shine bg-primary text-black`} disabled={busy} onClick={() => void run(testPush, "Alerte d'essai envoyée : elle arrive dans quelques secondes.")}>{busy ? <Loader2 size={16} className="animate-spin" /> : <BellRing size={16} />}Alerte d'essai</button>
                <button className={`${btn} border border-border bg-card hover:bg-muted`} disabled={busy} onClick={() => void run(disablePush, "Alertes désactivées sur cet appareil")}>Désactiver</button>
              </div>
              <p className="text-xs text-muted-foreground">Sur Android, autorisez les notifications du navigateur et ne le mettez pas en « économie de batterie ».</p>
            </div>
          )}
          {state === "off" && (
            <button className={`${btn} btn-shine bg-primary text-black`} disabled={busy} onClick={() => void run(enablePush, "Alertes activées sur cet appareil")}>{busy ? <Loader2 size={16} className="animate-spin" /> : <BellRing size={16} />}Activer les alertes sur cet appareil</button>
          )}
          {state === "denied" && <p className="rounded-xl bg-amber-500/15 p-3 text-sm">Les notifications sont bloquées pour ce site. Ouvrez les réglages du navigateur (icône à gauche de l'adresse → Notifications → Autoriser), puis revenez ici.</p>}
          {state === "ios-install" && (
            <div className="space-y-2 rounded-xl bg-muted p-3 text-sm">
              <p className="font-semibold">Sur iPhone / iPad, les alertes nécessitent l'application installée :</p>
              <p className="flex items-center gap-2"><Share size={16} className="shrink-0 text-primary" />1. Dans Safari, touchez « Partager ».</p>
              <p className="flex items-center gap-2"><PlusSquare size={16} className="shrink-0 text-primary" />2. Choisissez « Sur l'écran d'accueil ».</p>
              <p className="flex items-center gap-2"><BellRing size={16} className="shrink-0 text-primary" />3. Ouvrez Amachia Seller depuis l'icône, puis activez les alertes ici.</p>
            </div>
          )}
          {state === "unsupported" && <p className="rounded-xl bg-muted p-3 text-sm">Ce navigateur ne permet pas les alertes en arrière-plan. Utilisez Chrome, Edge, Firefox ou Samsung Internet (Android / ordinateur), ou Safari avec l'application installée sur iPhone.</p>}
        </DialogContent>
      </Dialog>
    </>
  );
}
