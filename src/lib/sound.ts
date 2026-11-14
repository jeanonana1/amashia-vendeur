/**
 * Effets sonores de l'espace vendeur, générés par le navigateur (aucun fichier à
 * télécharger). Courts et discrets ; coupables via setSoundEnabled(false).
 */
export type SoundName = "success" | "publish" | "notify" | "warning" | "error";

const KEY = "amashia-sound";
let ctx: AudioContext | null = null;
let lastAt = 0;

export function soundEnabled() {
  try { return localStorage.getItem(KEY) !== "off"; } catch { return true; }
}
export function setSoundEnabled(on: boolean) {
  try { localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* ignore */ }
}

// notes (Hz) et durée de chaque son
const SOUNDS: Record<SoundName, { notes: number[]; step: number; type: OscillatorType; gain: number }> = {
  success: { notes: [660, 990], step: 0.09, type: "sine", gain: 0.12 },
  publish: { notes: [523, 659, 784, 1047], step: 0.085, type: "triangle", gain: 0.12 },
  notify: { notes: [880, 1175], step: 0.12, type: "sine", gain: 0.1 },
  warning: { notes: [440, 370], step: 0.12, type: "triangle", gain: 0.1 },
  error: { notes: [330, 247], step: 0.14, type: "square", gain: 0.05 },
};

export function playSound(name: SoundName) {
  if (typeof window === "undefined" || !soundEnabled()) return;
  const now = performance.now();
  if (now - lastAt < 120) return; // pas de cacophonie si plusieurs actions se suivent
  lastAt = now;
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx ??= new AC();
    if (ctx.state === "suspended") void ctx.resume();
    const s = SOUNDS[name];
    const t0 = ctx.currentTime + 0.01;
    s.notes.forEach((freq, i) => {
      const osc = ctx!.createOscillator();
      const g = ctx!.createGain();
      osc.type = s.type;
      osc.frequency.value = freq;
      const start = t0 + i * s.step;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(s.gain, start + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, start + s.step * 1.8);
      osc.connect(g).connect(ctx!.destination);
      osc.start(start);
      osc.stop(start + s.step * 2);
    });
  } catch { /* son indisponible : on continue sans */ }
}

/** Les messages de réussite / d'erreur jouent automatiquement un son. */
export function installToastSounds(toast: { success: (...a: never[]) => unknown; error: (...a: never[]) => unknown }) {
  const t = toast as unknown as Record<string, ((...a: unknown[]) => unknown) & { __sound?: boolean }>;
  if (t.success.__sound) return;
  const ok = t.success, ko = t.error;
  const wrappedOk = Object.assign((...a: unknown[]) => { playSound(/publi/i.test(String(a[0])) ? "publish" : "success"); return ok(...a); }, { __sound: true });
  const wrappedKo = Object.assign((...a: unknown[]) => { playSound("error"); return ko(...a); }, { __sound: true });
  t.success = wrappedOk;
  t.error = wrappedKo;
}
