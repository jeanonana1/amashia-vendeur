import { useEffect, useRef, useState } from "react";
import { X, Sparkles, Loader2, Camera, QrCode, Check, Upload, ImagePlus, Smartphone, RefreshCw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import QRCode from "qrcode";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/lib/imageCompress";
import { imgProps } from "@/lib/img";
import { planProductShots, startProductShots, checkProductShots } from "@/lib/ai-images.functions";

type FormImage = { file?: File; preview: string; existing?: boolean };
type Shot = { id: string; label: string; why: string; prompt: string };
type Job = { requestId?: string; status: "starting" | "pending" | "done" | "failed"; url?: string; error?: string; selected?: boolean };

type Props = {
  productName: string;
  category?: string;
  description?: string;
  /** photos déjà présentes dans la fiche (proposées comme références) */
  formImages: FormImage[];
  /** une photo locale de la fiche vient d'être envoyée : la fiche garde son adresse en ligne */
  onFormImageUploaded: (preview: string, url: string) => void;
  /** nouvelles images (photos réelles prises/importées ici ou images générées) à ajouter à la fiche */
  onAddUrls: (urls: string[]) => void;
  onClose: () => void;
};

const MAX_REFS = 4;
const POLL_MS = 4000;
const POLL_LIMIT_MS = 5 * 60_000;

function dataUrlToFile(dataUrl: string, name: string) {
  const [meta, b64] = dataUrl.split(",");
  const mime = /:(.*?);/.exec(meta || "")?.[1] || "image/jpeg";
  const bin = atob(b64 || "");
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new File([arr], name, { type: mime });
}

/** Envoie une photo réelle dans le dossier du vendeur et renvoie son adresse publique. */
async function uploadPhoto(file: File): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Connectez-vous");
  const small = await compressImage(file, 1600);
  const ext = small.name.split(".").pop() || "jpg";
  const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage.from("product-images").upload(path, small, { cacheControl: "31536000", contentType: small.type || "image/jpeg" });
  if (error) throw new Error("Envoi de la photo impossible. Réessayez.");
  return supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
}

export function AiImageModal({ productName, category, description, formImages, onFormImageUploaded, onAddUrls, onClose }: Props) {
  const plan = useServerFn(planProductShots);
  const start = useServerFn(startProductShots);
  const check = useServerFn(checkProductShots);

  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => { setIsMobile(/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.matchMedia("(pointer: coarse)").matches); }, []);

  // Photos réelles servant de référence : celles de la fiche + celles ajoutées ici
  const [refs, setRefs] = useState<{ key: string; preview: string; url?: string; file?: File; on: boolean }[]>(() =>
    formImages.slice(0, 8).map((img, i) => ({ key: `form-${i}`, preview: img.preview, url: img.existing ? img.preview : undefined, file: img.file, on: i < MAX_REFS })),
  );
  const [uploading, setUploading] = useState(0);
  const [picker, setPicker] = useState<null | "menu" | "qr">(formImages.length === 0 ? "menu" : null);

  const [planning, setPlanning] = useState(false);
  const [planned, setPlanned] = useState<{ summary: string; shots: Shot[]; costUsd: number | null } | null>(null);
  const [chosen, setChosen] = useState<Record<string, boolean>>({});
  const [jobs, setJobs] = useState<Record<string, Job>>({});
  const [running, setRunning] = useState(false);

  const activeRefs = refs.filter((r) => r.on);

  /** Ajoute de vraies photos (import, caméra, téléphone) : en ligne tout de suite, et dans la fiche. */
  async function addPhotos(files: File[]) {
    const list = files.filter((f) => f.type.startsWith("image/")).slice(0, 8);
    if (!list.length) return;
    setPicker(null);
    setUploading((n) => n + list.length);
    for (const f of list) {
      try {
        const url = await uploadPhoto(f);
        setRefs((prev) => {
          const onCount = prev.filter((r) => r.on).length;
          return [...prev, { key: url, preview: url, url, on: onCount < MAX_REFS }];
        });
        onAddUrls([url]); // la photo réelle apparaît aussi dans l'éditeur de la fiche
        setPlanned(null);
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setUploading((n) => n - 1);
      }
    }
    toast.success(list.length > 1 ? "Photos ajoutées à votre fiche" : "Photo ajoutée à votre fiche");
  }

  // ---- PC : « Filmer avec mon téléphone » (QR code + réception en direct) ----
  const [sessionId] = useState(() => crypto.randomUUID().replace(/-/g, "").slice(0, 16));
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    if (picker !== "qr") return;
    const url = `${window.location.origin}/capture/${sessionId}`;
    QRCode.toDataURL(url, { width: 240, margin: 1 }).then(setQr).catch(() => setQr(null));
    const channel = supabase
      .channel(`capture-${sessionId}`)
      .on("broadcast", { event: "photo" }, ({ payload }: { payload?: { dataUrl?: string } }) => {
        if (payload?.dataUrl) {
          toast.success("Photo reçue depuis votre téléphone");
          void addPhotos([dataUrlToFile(payload.dataUrl, `telephone-${Date.now()}.jpg`)]);
        }
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picker, sessionId]);

  async function ensureRefUrls(): Promise<string[]> {
    const out: string[] = [];
    for (const r of activeRefs) {
      if (r.url) { out.push(r.url); continue; }
      if (!r.file) continue;
      const url = await uploadPhoto(r.file);
      onFormImageUploaded(r.preview, url);
      setRefs((prev) => prev.map((x) => (x.key === r.key ? { ...x, url } : x)));
      out.push(url);
    }
    return out;
  }

  async function runPlan() {
    if (productName.trim().length < 2) return toast.error("Renseignez d'abord le titre du produit (étape Infos).");
    if (!activeRefs.length) { setPicker("menu"); return toast.error("Ajoutez au moins une vraie photo du produit."); }
    setPlanning(true);
    setJobs({});
    try {
      const referenceUrls = await ensureRefUrls();
      const r = await plan({ data: { productName, category, description, referenceUrls } });
      setPlanned(r);
      setChosen(Object.fromEntries(r.shots.map((s) => [s.id, true])));
    } catch (e) {
      toast.error((e as Error).message || "Analyse impossible. Réessayez.");
    } finally {
      setPlanning(false);
    }
  }

  // Suivi des générations en cours
  const startedAt = useRef(0);
  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(async () => {
      const pending = Object.entries(jobs).filter(([, j]) => j.status === "pending" && j.requestId);
      if (!pending.length) { setRunning(false); return; }
      if (Date.now() - startedAt.current > POLL_LIMIT_MS) {
        setJobs((prev) => Object.fromEntries(Object.entries(prev).map(([k, j]) => [k, j.status === "pending" ? { ...j, status: "failed", error: "Trop long. Réessayez." } : j])));
        setRunning(false);
        return;
      }
      try {
        const states = await check({ data: { jobs: pending.map(([id, j]) => ({ id, requestId: j.requestId! })) } });
        setJobs((prev) => {
          const next = { ...prev };
          for (const s of states) if (next[s.id] && s.status !== "pending") next[s.id] = { ...next[s.id]!, status: s.status, url: s.url, error: s.error, selected: s.status === "done" };
          return next;
        });
      } catch { /* coupure passagère : nouvel essai au prochain passage */ }
    }, POLL_MS);
    return () => window.clearInterval(t);
  }, [running, jobs, check]);

  async function generate() {
    if (!planned) return;
    const shots = planned.shots.filter((s) => chosen[s.id]);
    if (!shots.length) return toast.error("Choisissez au moins une prise de vue.");
    const referenceUrls = activeRefs.map((r) => r.url).filter((u): u is string => !!u);
    setJobs(Object.fromEntries(shots.map((s) => [s.id, { status: "starting" } as Job])));
    try {
      const res = await start({ data: { referenceUrls, shots: shots.map((s) => ({ id: s.id, prompt: s.prompt })) } });
      setJobs(Object.fromEntries(res.map((r) => [r.id, "requestId" in r && r.requestId ? { requestId: r.requestId, status: "pending" } : { status: "failed", error: ("error" in r && r.error) || "Échec" }] as [string, Job])));
      const firstError = res.find((r) => "error" in r && r.error);
      if (firstError && "error" in firstError) toast.error(firstError.error);
      startedAt.current = Date.now();
      setRunning(true);
    } catch (e) {
      setJobs({});
      toast.error((e as Error).message || "Génération impossible. Réessayez.");
    }
  }

  const done = Object.values(jobs).filter((j) => j.status === "done" && j.selected && j.url);
  function addSelected() {
    if (!done.length) return toast.error("Sélectionnez au moins une image");
    onAddUrls(done.map((j) => j.url!));
    toast.success(`${done.length} image${done.length > 1 ? "s" : ""} ajoutée${done.length > 1 ? "s" : ""} à votre fiche`);
    onClose();
  }

  const working = Object.values(jobs).some((j) => j.status === "starting" || j.status === "pending");
  const btn = "inline-flex items-center justify-center gap-2 rounded-full font-semibold disabled:opacity-60";

  return (
    <div className="fixed inset-0 z-[100] grid grid-cols-[minmax(0,1fr)] place-items-center overflow-y-auto overflow-x-hidden bg-black/70 p-3 backdrop-blur-sm sm:p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="relative my-4 flex max-h-[calc(100dvh-2rem)] w-full min-w-0 max-w-3xl flex-col rounded-2xl border border-border bg-card sm:my-8">
        <div className="flex items-center justify-between border-b border-border p-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-primary text-white"><Sparkles size={20} /></div>
            <div className="min-w-0">
              <h3 className="truncate text-lg font-bold">Images produit par IA</h3>
              <p className="truncate text-xs text-muted-foreground">Vos vraies photos, mises en valeur sous les meilleurs angles</p>
            </div>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg hover:bg-secondary" aria-label="Fermer"><X size={16} /></button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {/* 1. Photos réelles */}
          <section className="rounded-2xl border border-border p-4">
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-bold">1. Photos réelles du produit</p>
              <button onClick={() => setPicker("menu")} className={`${btn} bg-secondary px-3 py-1.5 text-xs`}><ImagePlus size={13} /> Ajouter une photo</button>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">L'IA part de votre vrai produit : elle change l'angle et la mise en scène, jamais le produit. Touchez une photo pour l'utiliser ou non (4 au maximum).</p>
            <div className="flex flex-wrap gap-2">
              {refs.map((r) => (
                <button key={r.key} type="button" onClick={() => setRefs((prev) => prev.map((x) => (x.key === r.key ? { ...x, on: !x.on && prev.filter((y) => y.on).length < MAX_REFS ? true : false } : x)))} className={`relative h-20 w-20 overflow-hidden rounded-xl border-2 ${r.on ? "border-primary" : "border-border opacity-50"}`}>
                  <img {...(r.url ? imgProps(r.url, { width: 128 }) : { src: r.preview })} alt="" className="h-full w-full object-cover" />
                  {r.on && <span className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-primary text-white"><Check size={11} /></span>}
                </button>
              ))}
              {Array.from({ length: uploading }).map((_, i) => <div key={i} className="grid h-20 w-20 place-items-center rounded-xl bg-secondary"><Loader2 className="animate-spin" size={18} /></div>)}
              {!refs.length && !uploading && <p className="text-xs text-muted-foreground">Aucune photo pour le moment.</p>}
            </div>
            <button onClick={runPlan} disabled={planning || !activeRefs.length || uploading > 0} className={`${btn} mt-4 w-full bg-gradient-primary py-3 text-sm text-white`}>
              {planning ? <><Loader2 className="animate-spin" size={15} /> Analyse des photos et de la description…</> : <><Sparkles size={15} /> {planned ? "Proposer d'autres angles" : "Proposer les meilleurs angles"}</>}
            </button>
          </section>

          {/* 2. Prises de vue proposées */}
          {planned && (
            <section className="rounded-2xl border border-border p-4">
              <p className="text-sm font-bold">2. Prises de vue proposées</p>
              <p className="mb-3 mt-0.5 text-xs text-muted-foreground">{planned.summary}</p>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {planned.shots.map((s) => {
                  const j = jobs[s.id];
                  return (
                    <li key={s.id} className="overflow-hidden rounded-xl bg-secondary">
                      <button
                        type="button"
                        disabled={!!j && j.status !== "done"}
                        onClick={() => (j?.status === "done" ? setJobs((p) => ({ ...p, [s.id]: { ...j, selected: !j.selected } })) : !j && setChosen((c) => ({ ...c, [s.id]: !c[s.id] })))}
                        className={`relative block aspect-square w-full overflow-hidden border-2 ${(j ? j.selected : chosen[s.id]) ? "border-primary" : "border-transparent"}`}
                      >
                        {j?.status === "done" && j.url ? (
                          <img {...imgProps(j.url, { width: 384 })} alt={s.label} className="absolute inset-0 h-full w-full object-cover" />
                        ) : j?.status === "failed" ? (
                          <span className="absolute inset-0 grid place-items-center p-2 text-center text-[11px] text-destructive"><AlertTriangle size={16} />{j.error}</span>
                        ) : j ? (
                          <span className="absolute inset-0 grid place-items-center text-[11px] text-muted-foreground"><Loader2 className="animate-spin" size={18} /></span>
                        ) : (
                          <span className="absolute inset-0 grid place-items-center p-3 text-center text-[11px] text-muted-foreground">{chosen[s.id] ? "Sera générée" : "Non retenue"}</span>
                        )}
                        {(j ? j.selected : chosen[s.id]) && <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-primary text-white"><Check size={11} /></span>}
                      </button>
                      <div className="p-2.5">
                        <p className="truncate text-xs font-bold" title={s.label}>{s.label}</p>
                        <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{s.why}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
              {!Object.keys(jobs).length && (
                <button onClick={generate} className={`${btn} mt-4 w-full bg-gradient-primary py-3 text-sm text-white`}>
                  <Sparkles size={15} /> Générer {Object.values(chosen).filter(Boolean).length} image(s)
                  {planned.costUsd ? <span className="text-xs font-normal opacity-90">(≈ {(planned.costUsd * Object.values(chosen).filter(Boolean).length).toFixed(2)} $)</span> : null}
                </button>
              )}
              {working && <p className="mt-3 text-center text-xs text-muted-foreground"><Loader2 className="mr-1 inline animate-spin" size={12} /> Création des images… (1 à 3 minutes, vous pouvez patienter ici)</p>}
              {!working && Object.keys(jobs).length > 0 && (
                <button onClick={() => { setJobs({}); }} className={`${btn} mt-3 w-full bg-secondary py-2.5 text-xs`}><RefreshCw size={13} /> Relancer une génération</button>
              )}
            </section>
          )}
        </div>

        {done.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-border p-5 sm:flex-row">
            <button onClick={onClose} className={`${btn} flex-1 bg-secondary py-3 text-sm`}>Fermer</button>
            <button onClick={addSelected} className={`${btn} flex-1 bg-gradient-primary py-3 text-sm text-white`}><Check size={14} /> Ajouter {done.length} image(s) à ma fiche</button>
          </div>
        )}

        {/* Choix de la source de la photo */}
        {picker && (
          <div className="absolute inset-0 z-10 grid place-items-center rounded-2xl bg-black/60 p-4" onClick={() => setPicker(null)}>
            <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl border border-border bg-card p-5">
              <div className="mb-4 flex items-center justify-between">
                <h4 className="font-bold">{picker === "qr" ? "Filmer avec votre téléphone" : "Ajouter une photo du produit"}</h4>
                <button onClick={() => setPicker(null)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-secondary" aria-label="Fermer"><X size={15} /></button>
              </div>
              {picker === "menu" ? (
                <div className="space-y-2.5">
                  {isMobile && (
                    <button onClick={() => camRef.current?.click()} className="flex w-full items-center gap-3 rounded-xl border border-border p-4 text-left hover:border-primary">
                      <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15 text-primary"><Camera size={18} /></span>
                      <span><span className="block text-sm font-semibold">Prendre une photo</span><span className="text-xs text-muted-foreground">Ouvre directement la caméra du téléphone</span></span>
                    </button>
                  )}
                  <button onClick={() => fileRef.current?.click()} className="flex w-full items-center gap-3 rounded-xl border border-border p-4 text-left hover:border-primary">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15 text-primary"><Upload size={18} /></span>
                    <span><span className="block text-sm font-semibold">{isMobile ? "Choisir dans la galerie" : "Importer depuis l'ordinateur"}</span><span className="text-xs text-muted-foreground">JPG, PNG ou WebP, plusieurs photos possibles</span></span>
                  </button>
                  {!isMobile && (
                    <button onClick={() => setPicker("qr")} className="flex w-full items-center gap-3 rounded-xl border border-border p-4 text-left hover:border-primary">
                      <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15 text-primary"><Smartphone size={18} /></span>
                      <span><span className="block text-sm font-semibold">Filmer le produit</span><span className="text-xs text-muted-foreground">Scannez un QR code et photographiez avec votre téléphone</span></span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="text-center">
                  {qr ? <img src={qr} alt="QR code pour filmer le produit" className="mx-auto h-48 w-48 rounded-xl bg-white p-2" /> : <div className="mx-auto grid h-48 w-48 place-items-center rounded-xl bg-secondary"><QrCode size={32} /></div>}
                  <p className="mt-3 text-sm">Scannez ce code avec l'appareil photo de votre téléphone.</p>
                  <p className="mt-1 text-xs text-muted-foreground">La page Amashia s'ouvre sur le téléphone : prenez le produit en photo, elle apparaît ici et dans votre fiche automatiquement. Vous pouvez en envoyer plusieurs.</p>
                  <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-primary"><Loader2 className="animate-spin" size={12} /> En attente des photos du téléphone…</p>
                  <button onClick={() => setPicker("menu")} className={`${btn} mt-4 w-full bg-secondary py-2.5 text-xs`}>Retour</button>
                </div>
              )}
            </div>
          </div>
        )}

        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ""; void addPhotos(f); }} />
        <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ""; void addPhotos(f); }} />
      </div>
    </div>
  );
}
