import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Smartphone, Monitor, Download, BellRing, CheckCircle2, X, Share, PlusSquare, Loader2 } from "lucide-react";
import { enablePush, pushState, registerSW, type PushState } from "@/lib/push";
import { APK_URL, isSellerApp } from "@/lib/nativeApp";

/** Évènement « beforeinstallprompt » (Chrome, Edge, Samsung Internet) : capturé dès le chargement. */
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e as InstallEvent; listeners.forEach((f) => f()); });
  window.addEventListener("appinstalled", () => { deferred = null; listeners.forEach((f) => f()); });
}

const HIDE_KEY = "amashia-seller-install-hidden";
const isStandalone = () => typeof window !== "undefined" && (window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true);
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isMobile = () => /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
const isAndroid = () => /android/i.test(navigator.userAgent);

/**
 * Tableau de bord du vendeur : invitation à installer l'application Amashia Seller
 * - téléphone : application installée depuis le navigateur (Android : Chrome la transforme en vraie application),
 *   avec notifications, son et vibration à chaque nouvelle commande, même application fermée ;
 * - ordinateur : version PC (fenêtre à part, icône sur le bureau), notifications et sonnerie des nouvelles commandes.
 */
export function InstallAppCard() {
  const [, force] = useState(0);
  const [ready, setReady] = useState(false);
  const [push, setPush] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const f = () => force((n) => n + 1);
    listeners.add(f);
    void registerSW();
    void pushState().then(setPush).catch(() => setPush("unsupported"));
    try { setHidden(localStorage.getItem(HIDE_KEY) === "1"); } catch { /* ignore */ }
    setReady(true);
    return () => { listeners.delete(f); };
  }, []);
  // dans l'application Android : les alertes sont déjà actives (Firebase)
  if (!ready || hidden || isSellerApp()) return null;
  const installed = isStandalone();
  const mobile = isMobile();
  // déjà installée et alertes actives : plus rien à proposer
  if (installed && push === "on") return null;

  const activate = async () => {
    setBusy(true);
    try { const r = await enablePush(); setPush(r); if (r === "on") toast.success("Notifications activées : son et vibration à chaque nouvelle commande"); else if (r === "denied") toast.error("Notifications bloquées : autorisez-les dans les réglages du navigateur."); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null; force((n) => n + 1);
    if (outcome === "accepted") { toast.success(mobile ? "Application installée sur votre téléphone" : "Version PC installée sur votre ordinateur"); if (push !== "on") void activate(); }
  };
  const hide = () => { try { localStorage.setItem(HIDE_KEY, "1"); } catch { /* ignore */ } setHidden(true); };
  const Icon = mobile ? Smartphone : Monitor;

  return (
    <div className="relative mb-6 overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/15 via-card to-card p-4 sm:p-5">
      <button onClick={hide} aria-label="Masquer" className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-muted"><X size={16} /></button>
      <div className="flex flex-wrap items-center gap-4 pr-8">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary text-black"><Icon size={24} /></span>
        <div className="min-w-0 flex-1">
          <p className="font-extrabold">{installed ? "Activez les alertes de commandes" : mobile ? "Téléchargez l'application Amashia Seller" : "Installez la version PC du tableau de bord"}</p>
          <p className="text-sm text-muted-foreground">
            {mobile
              ? "Recevez chaque nouvelle commande en temps réel : notification, sonnerie et vibration, même application fermée."
              : "Votre tableau de bord dans sa propre fenêtre, avec une icône sur le bureau : notification et sonnerie à chaque nouvelle commande."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!installed && mobile && isAndroid() && (
            <a href={APK_URL} download className="btn-shine inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-black"><Download size={16} />Télécharger l'application (APK)</a>
          )}
          {!installed && deferred && !(mobile && isAndroid()) && (
            <button onClick={() => void install()} className="btn-shine inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-black"><Download size={16} />{mobile ? "Télécharger l'application" : "Installer la version PC"}</button>
          )}
          {push !== "on" && push !== "unsupported" && push !== "ios-install" && !(mobile && isAndroid() && !installed) && (
            <button disabled={busy} onClick={() => void activate()} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold ${!installed && deferred ? "border border-border bg-card" : "btn-shine bg-primary text-black"}`}>{busy ? <Loader2 size={16} className="animate-spin" /> : <BellRing size={16} />}Activer les alertes</button>
          )}
          {push === "on" && <span className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-600"><CheckCircle2 size={16} />Alertes activées</span>}
        </div>
      </div>
      {/* sans bouton d'installation automatique : marche à suivre selon l'appareil */}
      {!installed && mobile && isAndroid() && (
        <p className="mt-3 rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">Une fois le fichier téléchargé, ouvrez-le et autorisez l'installation depuis cette source si Android le demande. L'application Amashia Seller vous demandera ensuite d'autoriser les notifications.</p>
      )}
      {!installed && !deferred && !(mobile && isAndroid()) && (
        <div className="mt-3 rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">
          {isIos() ? (
            <p className="flex flex-wrap items-center gap-1.5">Sur iPhone : dans Safari, touchez <Share size={14} className="text-primary" /> « Partager », puis <PlusSquare size={14} className="text-primary" /> « Sur l'écran d'accueil ». Ouvrez ensuite Amashia Seller depuis l'icône et activez les alertes.</p>
          ) : mobile ? (
            <p>Ouvrez ce tableau de bord dans <b>Chrome</b>, touchez le menu ⋮ puis « Installer l'application » (ou « Ajouter à l'écran d'accueil »).</p>
          ) : (
            <p>Dans <b>Chrome</b> ou <b>Edge</b>, cliquez sur l'icône d'installation à droite de la barre d'adresse (ou menu ⋮ → « Installer Amashia Seller »).</p>
          )}
        </div>
      )}
    </div>
  );
}
