import { useEffect, useRef, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { BellRing, Volume2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { appVibrate } from "@/lib/nativeApp";

/**
 * Alerte des nouvelles commandes du vendeur (comme dans l'espace admin) :
 * - détection instantanée (temps réel) + vérification toutes les 15 s en secours ;
 * - sonnerie en boucle (fichier audio : elle continue même dans un autre onglet ou une autre fenêtre) ;
 * - notification du système et titre de l'onglet qui clignote ;
 * - tout s'arrête quand la page Commandes est ouverte.
 * Les navigateurs n'autorisent le son qu'après un premier clic sur la page : il est débloqué dès ce clic.
 */
const SEEN_KEY = "amashia-seller-orders-seen";
const ORDERS_PATH = "/dashboard/commandes";
const getSeen = () => { try { return localStorage.getItem(SEEN_KEY); } catch { return null; } };
const setSeen = (v: string) => { try { localStorage.setItem(SEEN_KEY, v); } catch { /* ignore */ } };
const db = supabase as unknown as { rpc: (f: string, a?: unknown) => Promise<{ data: unknown; error: unknown }> };

/** Sonnerie « nouvelle commande » (arpège joyeux) générée une fois en fichier WAV. */
let chimeUrl: string | null = null;
function makeChime(): string {
  if (chimeUrl) return chimeUrl;
  const rate = 22050, dur = 2.4, n = Math.floor(rate * dur);
  const data = new Float32Array(n);
  const notes: [number, number][] = [[1046.5, 0], [1318.5, 0.12], [1568, 0.24], [2093, 0.36], [1568, 0.9], [2093, 1.02]];
  for (const [f, start] of notes) {
    const s0 = Math.floor(start * rate), len = Math.floor(0.7 * rate);
    for (let i = 0; i < len && s0 + i < n; i++) {
      const t = i / rate;
      const env = Math.min(1, t / 0.01) * Math.exp(-t * 5.5);
      data[s0 + i] += 0.28 * env * (Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(4 * Math.PI * f * t));
    }
  }
  const buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); w(8, "WAVE"); w(12, "fmt "); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, data[i])) * 0x7fff, true);
  chimeUrl = URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
  return chimeUrl;
}

let audio: HTMLAudioElement | null = null;
let unlocked = false;
function getAudio() {
  if (typeof window === "undefined") return null;
  if (!audio) { audio = new Audio(makeChime()); audio.loop = true; audio.preload = "auto"; }
  return audio;
}
/** À appeler lors d'un clic : autorise ensuite le son, même en arrière-plan. */
export function unlockOrderSound() {
  const a = getAudio();
  if (!a || unlocked) return;
  a.muted = true;
  void a.play().then(() => { a.pause(); a.currentTime = 0; a.muted = false; unlocked = true; }).catch(() => { a.muted = false; });
}
/** Fait entendre la sonnerie quelques secondes (bouton « Tester la sonnerie »). */
export function testOrderSound() {
  const a = getAudio();
  if (!a) return;
  a.currentTime = 0;
  void a.play().then(() => { unlocked = true; setTimeout(() => { a.pause(); a.currentTime = 0; }, 2400); }).catch(() => {});
}

export function NewOrderAlarm({ uid }: { uid: string }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const [count, setCount] = useState(0);
  const [blocked, setBlocked] = useState(false);
  const latestRef = useRef<string | null>(null);
  const onOrders = path.startsWith(ORDERS_PATH);

  useEffect(() => {
    const u = () => { unlockOrderSound(); if (unlocked) setBlocked(false); };
    window.addEventListener("pointerdown", u);
    window.addEventListener("keydown", u);
    return () => { window.removeEventListener("pointerdown", u); window.removeEventListener("keydown", u); };
  }, []);

  // Détection : temps réel (articles de commande du vendeur) + vérification régulière
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const seen = getSeen();
        const { data } = await db.rpc("seller_latest_order", { _since: seen });
        const r = (data ?? {}) as { latest: string | null; new_count: number };
        if (!alive) return;
        latestRef.current = r.latest;
        if (!seen) { setSeen(r.latest ?? new Date().toISOString()); setCount(0); return; } // première ouverture : pas d'alarme pour l'historique
        setCount(r.new_count ?? 0);
      } catch { /* hors ligne : on réessaie */ }
    };
    void poll();
    const t = window.setInterval(() => void poll(), 10_000);
    const channel = supabase
      .channel(`seller-new-orders-${uid}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "order_items" }, () => void poll())
      .subscribe();
    const onVisible = () => void poll();
    document.addEventListener("visibilitychange", onVisible);
    const onSw = (e: MessageEvent) => { if (e.data?.type === "amashia-new-order") void poll(); };
    navigator.serviceWorker?.addEventListener("message", onSw);
    return () => { alive = false; window.clearInterval(t); void supabase.removeChannel(channel); document.removeEventListener("visibilitychange", onVisible); navigator.serviceWorker?.removeEventListener("message", onSw); };
  }, [uid]);

  // Page Commandes ouverte : tout est considéré comme vu
  useEffect(() => {
    if (!onOrders) return;
    if (latestRef.current) setSeen(latestRef.current);
    setCount(0);
  }, [onOrders, count]);

  const ringing = count > 0 && !onOrders;

  useEffect(() => {
    const a = getAudio();
    if (!ringing || !a) { a?.pause(); return; }
    const start = () => { a.loop = true; void a.play().then(() => setBlocked(false)).catch(() => setBlocked(true)); };
    start();
    const retry = window.setInterval(() => { if (a.paused) start(); }, 3000);
    // téléphone : vibration en même temps que la sonnerie
    const buzz = () => { if (appVibrate()) return; try { navigator.vibrate?.([600, 200, 600, 200, 900]); } catch { /* ignore */ } };
    buzz();
    const vib = window.setInterval(buzz, 3500);
    let notif: Notification | null = null;
    if ("Notification" in window && Notification.permission === "granted" && document.hidden) {
      try {
        notif = new Notification(count > 1 ? `${count} nouvelles commandes — Amachia` : "Nouvelle commande — Amachia", {
          body: "Ouvrez vos commandes pour la préparer.", tag: "amashia-seller-new-order", requireInteraction: true,
        });
        notif.onclick = () => { window.focus(); void navigate({ to: ORDERS_PATH }); notif?.close(); };
      } catch { /* notifications indisponibles */ }
    }
    const title = document.title;
    let flip = false;
    const blink = window.setInterval(() => { flip = !flip; document.title = flip ? `🔔 ${count > 1 ? `${count} nouvelles commandes` : "Nouvelle commande"} !` : title; }, 1000);
    return () => { window.clearInterval(retry); window.clearInterval(vib); try { navigator.vibrate?.(0); } catch { /* ignore */ } window.clearInterval(blink); document.title = title; a.pause(); a.currentTime = 0; notif?.close(); };
  }, [ringing, count, navigate]);

  if (!ringing) return null;
  return (
    <div className="fixed bottom-5 right-5 z-[60] w-[min(92vw,360px)] rounded-2xl border border-primary/40 bg-card p-4 shadow-2xl" role="alert">
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 animate-pulse place-items-center rounded-full bg-primary text-black"><BellRing size={20} /></div>
        <div className="min-w-0 flex-1">
          <p className="font-bold">{count > 1 ? `${count} nouvelles commandes !` : "Nouvelle commande !"}</p>
          <p className="text-xs text-muted-foreground">La sonnerie s'arrête quand vous ouvrez vos commandes.</p>
          {blocked && <p className="mt-1 flex items-center gap-1 text-xs font-medium text-amber-600"><Volume2 size={14} /> Touchez la page pour entendre la sonnerie.</p>}
        </div>
      </div>
      <button onClick={() => void navigate({ to: ORDERS_PATH })} className="btn-shine mt-3 w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-black hover:opacity-90">
        Voir les nouvelles commandes
      </button>
    </div>
  );
}
