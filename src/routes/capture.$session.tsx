import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Camera, Check, Loader2 } from "lucide-react";

export const Route = createFileRoute("/capture/$session")({
  head: () => ({
    meta: [
      { title: "Filmer le produit — Amashia Seller" },
      { name: "description", content: "Capturez votre produit avec la caméra de votre téléphone et envoyez-le instantanément à votre fiche produit Amashia." },
      { property: "og:title", content: "Filmer le produit — Amashia Seller" },
      { property: "og:description", content: "Capture caméra instantanée pour vos fiches produits Amashia." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CapturePage,
});

async function downscale(file: File, max = 900): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.72);
}

function CapturePage() {
  const { session } = Route.useParams();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(files: FileList | null) {
    if (!files?.[0]) return;
    setError(null);
    setSending(true);
    try {
      const dataUrl = await downscale(files[0]);
      setPreview(dataUrl);
      const channel = supabase.channel(`capture-${session}`);
      await new Promise<void>((resolve) => {
        channel.subscribe((status) => { if (status === "SUBSCRIBED") resolve(); });
      });
      await channel.send({ type: "broadcast", event: "photo", payload: { dataUrl } });
      setSent(true);
      setTimeout(() => supabase.removeChannel(channel), 1500);
    } catch (e: any) {
      setError(e?.message || "Échec de l'envoi");
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground grid place-items-center p-6">
      <div className="w-full max-w-sm bg-card border border-border rounded-3xl p-6 text-center">
        <h1 className="text-xl font-extrabold">Capture produit</h1>
        <p className="text-sm text-muted-foreground mt-2">Filmez ou photographiez votre produit. L'image part directement sur votre ordinateur.</p>

        {preview && <img src={preview} alt="Aperçu du produit capturé" className="mt-5 w-full rounded-2xl border border-border" />}

        {sent ? (
          <p className="mt-5 inline-flex items-center gap-2 text-emerald-400 font-semibold text-sm"><Check size={16} /> Envoyé ! Retournez sur votre ordinateur.</p>
        ) : (
          <button
            onClick={() => inputRef.current?.click()}
            disabled={sending}
            className="mt-5 w-full py-3.5 rounded-full bg-gradient-primary text-white font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {sending ? <><Loader2 className="animate-spin" size={16} /> Envoi…</> : <><Camera size={16} /> Ouvrir la caméra</>}
          </button>
        )}
        {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
        <input ref={inputRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => onFile(e.target.files)} />
      </div>
    </main>
  );
}
