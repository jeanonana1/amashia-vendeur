import { useEffect, useRef, useState } from "react";
import { X, Sparkles, Loader2, Camera, QrCode, Check, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import QRCode from "qrcode";
import { supabase } from "@/integrations/supabase/client";

type Angle = { id: string; label: string; why: string; prompt: string };
type Props = {
  productName: string;
  category?: string;
  onClose: () => void;
  onAdd: (files: File[]) => void;
};

function dataUrlToFile(dataUrl: string, name: string) {
  const [meta, b64] = dataUrl.split(",");
  const mime = /:(.*?);/.exec(meta || "")?.[1] || "image/png";
  const bin = atob(b64 || "");
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new File([arr], name, { type: mime });
}

async function callAi(payload: Record<string, unknown>) {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error("Connectez-vous pour générer des images.");
  const res = await fetch("/api/ai-image", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* html error page */ }
  if (!res.ok || json?.error) throw new Error(json?.error || `Erreur IA (${res.status})`);
  if (!json) throw new Error("Réponse IA invalide");
  return json;
}

export function AiImageModal({ productName, category, onClose, onAdd }: Props) {
  const camRef = useRef<HTMLInputElement>(null);

  const [isMobile, setIsMobile] = useState(false);
  const [sessionId] = useState(() => Math.random().toString(36).slice(2, 10));
  const [qr, setQr] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [angles, setAngles] = useState<Angle[]>([]);
  const [loadingAngles, setLoadingAngles] = useState(false);
  const [results, setResults] = useState<Record<string, { label: string; dataUrl: string; selected: boolean }>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState("");

  useEffect(() => {
    setIsMobile(/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent));
  }, []);

  // Desktop: QR + realtime listener for the phone capture
  useEffect(() => {
    if (isMobile) return;
    const url = `${window.location.origin}/capture/${sessionId}`;
    QRCode.toDataURL(url, { width: 220, margin: 1 }).then(setQr).catch(() => setQr(null));
    const channel = supabase
      .channel(`capture-${sessionId}`)
      .on("broadcast", { event: "photo" }, ({ payload }: any) => {
        if (payload?.dataUrl) {
          setSource(payload.dataUrl);
          toast.success("Photo reçue depuis votre téléphone");
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isMobile, sessionId]);

  // Pre-load the marketing angles as soon as the modal opens (so generation can
  // start the instant the phone photo lands).
  const anglesRef = useRef<Angle[]>([]);
  const anglesPromiseRef = useRef<Promise<Angle[]> | null>(null);
  useEffect(() => {
    if (!productName.trim()) return;
    void loadAngles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productName]);

  // Auto-run the full pipeline as soon as a photo arrives
  const lastSourceRef = useRef<string | null>(null);
  useEffect(() => {
    if (!productName.trim()) return;
    if (!source) return;
    if (lastSourceRef.current === source) return;
    lastSourceRef.current = source;
    void runAll(source);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, productName]);

  async function loadAngles(): Promise<Angle[]> {
    if (!productName.trim()) {
      toast.error("Renseignez d'abord le titre du produit");
      return [];
    }
    if (anglesPromiseRef.current) return anglesPromiseRef.current;
    setLoadingAngles(true);
    const p = (async () => {
      try {
        const r = await callAi({ action: "angles", productName, category });
        const a: Angle[] = r.angles || [];
        anglesRef.current = a;
        setAngles(a);
        setResults({});
        if (!a.length) toast.error("Aucun angle généré, réessayez");
        return a;
      } catch (e: any) {
        toast.error(e?.message || "Erreur IA");
        anglesPromiseRef.current = null;
        return [];
      } finally {
        setLoadingAngles(false);
      }
    })();
    anglesPromiseRef.current = p;
    return p;
  }

  async function reloadAngles() {
    anglesPromiseRef.current = null;
    anglesRef.current = [];
    return loadAngles();
  }

  async function onCamera(files: FileList | null) {
    if (!files?.[0]) return;
    const bitmap = await createImageBitmap(files[0]);
    const scale = Math.min(1, 900 / Math.max(bitmap.width, bitmap.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bitmap.width * scale);
    c.height = Math.round(bitmap.height * scale);
    const context = c.getContext("2d");
    if (!context) return;
    context.drawImage(bitmap, 0, 0, c.width, c.height);
    setSource(c.toDataURL("image/jpeg", 0.75));
  }

  async function generateOne(a: Angle, src?: string | null) {
    setBusy((p) => ({ ...p, [a.id]: true }));
    try {
      const r = await callAi({
        action: "image",
        prompt: a.prompt,
        productName,
        sourceImage: (src ?? source) || undefined,
      });
      setResults((prev) => ({ ...prev, [a.id]: { label: a.label, dataUrl: r.dataUrl, selected: true } }));
    } catch (e: any) {
      toast.error(`${a.label} : ${e?.message || "échec"}`);
    } finally {
      setBusy((p) => ({ ...p, [a.id]: false }));
    }
  }

  async function runAll(src?: string | null) {
    if (generating) return;
    const list = anglesRef.current.length ? anglesRef.current : await loadAngles();
    if (!list.length) return;
    setGenerating(true);
    try {
      for (let i = 0; i < list.length; i++) {
        const a = list[i];
        if (!a) continue;
        setProgress(`${i + 1}/${list.length} · ${a.label}`);
        await generateOne(a, src);
      }
    } finally {
      setGenerating(false);
      setProgress("");
    }
  }

  const chosenList = Object.values(results).filter((r) => r.selected);

  function addSelected() {
    if (!chosenList.length) return toast.error("Sélectionnez au moins une image");
    onAdd(chosenList.map((r, i) => dataUrlToFile(r.dataUrl, `ia-${Date.now()}-${i}.png`)));
    toast.success(`${chosenList.length} image(s) ajoutée(s)`);
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm grid place-items-center z-[100] p-4 overflow-y-auto" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-card border border-border rounded-2xl w-full max-w-3xl my-8 max-h-[calc(100vh-4rem)] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex min-w-0 items-center gap-3">
            <div className="w-10 h-10 shrink-0 rounded-xl bg-gradient-primary grid place-items-center text-white"><Sparkles size={20} /></div>
            <div className="min-w-0">
              <h3 className="font-bold text-lg truncate">Images produit par IA</h3>
              <p className="text-xs text-muted-foreground truncate">Angles marketing générés à partir du titre du produit</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 shrink-0 grid place-items-center rounded-lg hover:bg-secondary"><X size={16} /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          {/* 1. Photo réelle (optionnelle mais recommandée) */}
          <div className="rounded-2xl border border-border p-4">
            <p className="text-sm font-bold mb-1">1. Photo réelle du produit <span className="text-xs font-normal text-muted-foreground">(recommandé)</span></p>
            <p className="text-xs text-muted-foreground mb-3">L'IA restylise votre vrai produit au lieu d'en inventer un.</p>
            {source ? (
              <div className="flex flex-wrap items-center gap-3">
                <img src={source} alt="Produit capturé" className="w-24 h-24 rounded-xl object-cover border border-border" />
                <button onClick={() => { setSource(null); lastSourceRef.current = null; }} className="px-3 py-2 rounded-xl bg-secondary text-xs font-semibold inline-flex items-center gap-1.5"><RefreshCw size={12} /> Remplacer</button>
                <button onClick={() => runAll()} disabled={loadingAngles || generating} className="px-4 py-2 rounded-xl bg-gradient-primary text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-60">
                  {loadingAngles || generating ? <><Loader2 className="animate-spin" size={12} /> {progress || "Analyse…"}</> : <><Sparkles size={12} /> Continuer</>}
                </button>
              </div>
            ) : isMobile ? (
              <>
                <button onClick={() => camRef.current?.click()} className="w-full py-3 rounded-full bg-secondary font-semibold text-sm inline-flex items-center justify-center gap-2"><Camera size={15} /> Ouvrir la caméra</button>
                <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => onCamera(e.target.files)} />
              </>
            ) : (
              <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-4 items-center">
                {qr ? <img src={qr} alt="QR code de capture" className="w-32 h-32 rounded-xl bg-white p-1" /> : <div className="w-32 h-32 rounded-xl bg-secondary grid place-items-center"><QrCode size={28} /></div>}
                <div>
                  <p className="text-xs text-muted-foreground">Scannez ce QR code avec votre téléphone pour filmer le produit en direct. La photo arrive ici automatiquement.</p>
                  <button onClick={() => runAll()} disabled={loadingAngles || generating} className="mt-3 px-4 py-2 rounded-xl bg-secondary text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-60">
                    <Sparkles size={12} /> Générer sans photo
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 2. Angles */}
          <div className="rounded-2xl border border-border p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <p className="text-sm font-bold">2. Angles marketing les plus puissants</p>
              <button onClick={() => reloadAngles()} disabled={loadingAngles || generating} className="px-3 py-1.5 rounded-full bg-secondary text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-60">
                {loadingAngles ? <><Loader2 className="animate-spin" size={12} /> Analyse…</> : <><Sparkles size={12} /> {angles.length ? "Régénérer" : "Analyser le titre"}</>}
              </button>
            </div>
            {angles.length === 0 ? (
              <p className="text-xs text-muted-foreground">Basé sur « {productName || "titre du produit"} ».</p>
            ) : (
              <ul className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {angles.map((a) => {
                  const r = results[a.id];
                  return (
                    <li key={a.id} className="rounded-xl bg-secondary overflow-hidden">
                      <button
                        type="button"
                        onClick={() => r ? setResults((p) => ({ ...p, [a.id]: { ...r, selected: !r.selected } })) : generateOne(a)}
                        className={`relative block w-full aspect-square overflow-hidden border-2 transition ${r?.selected ? "border-primary" : "border-transparent"}`}
                      >
                        {r ? (
                          <>
                            <img src={r.dataUrl} alt={a.label} className="absolute inset-0 w-full h-full object-cover" />
                            {r.selected && <span className="absolute top-1.5 right-1.5 w-5 h-5 grid place-items-center rounded-full bg-primary text-white"><Check size={11} /></span>}
                          </>
                        ) : (
                          <span className="absolute inset-0 grid place-items-center text-[11px] text-muted-foreground gap-1">
                            {busy[a.id] ? <Loader2 className="animate-spin" size={16} /> : <><Sparkles size={16} /> Générer</>}
                          </span>
                        )}
                      </button>
                      <div className="p-2.5">
                        <p className="text-xs font-bold truncate" title={a.label}>{a.label}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{a.why}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* 3. Génération */}
          {angles.length > 0 && (
            <button onClick={() => runAll()} disabled={generating} className="w-full py-3.5 rounded-full bg-gradient-primary text-white font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60">
              {generating ? <><Loader2 className="animate-spin" size={16} /> Génération {progress}</> : <><Sparkles size={16} /> Générer les {angles.length} images</>}
            </button>
          )}
        </div>

        {chosenList.length > 0 && (
          <div className="p-5 border-t border-border flex flex-col sm:flex-row gap-2">
            <button onClick={onClose} className="flex-1 py-3 rounded-full bg-secondary font-semibold text-sm">Annuler</button>
            <button onClick={addSelected} className="flex-1 py-3 rounded-full bg-gradient-primary text-white font-semibold text-sm inline-flex items-center justify-center gap-2"><Check size={14} /> Ajouter {chosenList.length} image(s)</button>
          </div>
        )}
      </div>
    </div>
  );
}
