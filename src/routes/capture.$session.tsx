import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Camera, Check, Images, Loader2 } from "lucide-react";
import { SellerLogo } from "@/components/seller/SellerLogo";

export const Route = createFileRoute("/capture/$session")({
  head: () => ({
    // page technique (photo depuis le téléphone) : non référencée
    meta: [
      { name: "robots", content: "noindex, nofollow" },
      { title: "Filmer le produit — Amachia Seller" },
      { name: "description", content: "Capturez votre produit avec la caméra de votre téléphone et envoyez-le instantanément à votre fiche produit Amachia." },
      { property: "og:title", content: "Filmer le produit — Amachia Seller" },
      { property: "og:description", content: "Capture caméra instantanée pour vos fiches produits Amachia." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CapturePage,
});

async function downscale(file: File, max = 1024): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.75);
}

function CapturePage() {
  const { session } = Route.useParams();
  const camRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  const [sending, setSending] = useState(0);
  const [sent, setSent] = useState(0);
  const [error, setError] = useState<string | null>(null);

  /** Envoie une ou plusieurs photos à l'ordinateur (la page de l'ordinateur les reçoit en direct). */
  async function sendFiles(list: File[]) {
    const files = list.filter((f) => f.type.startsWith("image/")).slice(0, 8);
    if (!files.length) return;
    setError(null);
    setSending(files.length);
    const channel = supabase.channel(`capture-${session}`);
    try {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("Connexion impossible. Vérifiez votre réseau.")), 15000);
        channel.subscribe((status) => { if (status === "SUBSCRIBED") { clearTimeout(t); resolve(); } });
      });
      for (const file of files) {
        const dataUrl = await downscale(file);
        await channel.send({ type: "broadcast", event: "photo", payload: { dataUrl } });
        setPreviews((p) => [dataUrl, ...p].slice(0, 12));
        setSent((n) => n + 1);
        setSending((n) => n - 1);
      }
    } catch (e: any) {
      setError(e?.message || "Échec de l'envoi");
    } finally {
      setSending(0);
      setTimeout(() => supabase.removeChannel(channel), 1500);
    }
  }

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []); // copie avant de vider le champ
    e.target.value = "";
    void sendFiles(files);
  };

  return (
    <main className="min-h-screen bg-background text-foreground grid place-items-center p-6">
      <div className="w-full max-w-sm bg-card border border-border rounded-3xl p-6 text-center">
        <div className="mb-4 flex justify-center"><SellerLogo className="h-8" /></div>
        <h1 className="text-xl font-extrabold">Photos du produit</h1>
        <p className="text-sm text-muted-foreground mt-2">Chaque photo part directement sur votre ordinateur, dans la fiche produit. Conseil : fond simple, bonne lumière, plusieurs angles.</p>

        <div className="mt-5 space-y-3">
          <button
            onClick={() => camRef.current?.click()}
            disabled={sending > 0}
            className="flex w-full items-center gap-3 rounded-2xl border border-border p-4 text-left hover:border-primary disabled:opacity-60"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary text-black"><Camera size={20} /></span>
            <span><span className="block font-semibold">Filmer le produit</span><span className="text-xs text-muted-foreground">Ouvre la caméra pour photographier le produit</span></span>
          </button>
          <button
            onClick={() => galleryRef.current?.click()}
            disabled={sending > 0}
            className="flex w-full items-center gap-3 rounded-2xl border border-border p-4 text-left hover:border-primary disabled:opacity-60"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-secondary"><Images size={20} /></span>
            <span><span className="block font-semibold">Importer depuis la galerie</span><span className="text-xs text-muted-foreground">Envoyez des photos déjà enregistrées sur ce téléphone</span></span>
          </button>
        </div>

        {sending > 0 && <p className="mt-4 inline-flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="animate-spin" size={15} /> Envoi en cours…</p>}
        {sent > 0 && sending === 0 && (
          <p className="mt-4 inline-flex items-center gap-2 text-emerald-400 font-semibold text-sm"><Check size={16} /> {sent > 1 ? `${sent} photos envoyées` : "Photo envoyée"} : regardez votre ordinateur.</p>
        )}
        {error && <p className="mt-3 text-xs text-destructive">{error}</p>}

        {previews.length > 0 && (
          <div className="mt-4 grid grid-cols-3 gap-2">
            {previews.map((src, i) => <img key={i} src={src} alt={`Photo envoyée ${i + 1}`} className="aspect-square w-full rounded-xl border border-border object-cover" />)}
          </div>
        )}

        <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={pick} />
        <input ref={galleryRef} type="file" accept="image/*" multiple hidden onChange={pick} />
      </div>
    </main>
  );
}
