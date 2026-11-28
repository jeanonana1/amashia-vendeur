import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Check, FileText, Loader2, Send, Upload, X } from "lucide-react";
import { DashboardLayout } from "@/components/seller/dashboard/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { compressImage, MAX_IMAGE_BYTES } from "@/lib/imageCompress";

export const Route = createFileRoute("/dashboard/candidature")({
  head: () => ({ meta: [{ title: "Corriger ma candidature — Amachia Seller" }] }),
  component: ResubmitPage,
});

type Kyc = { status: string; note: string | null } | null;
const DOCS = {
  particulier: [["cni_recto", "CNI - Recto *"], ["cni_verso", "CNI - Verso *"]],
  entreprise: [["rccm", "Registre du Commerce (RCCM) *"], ["niu_doc", "Attestation NIU *"], ["patente", "Patente / Licence"], ["cni_gerant", "CNI du gérant *"]],
} as const;
const db = supabase as unknown as { rpc: (f: string) => PromiseLike<{ data: unknown; error: { message: string } | null }> };
const inputCls = "w-full bg-background border border-border rounded-xl px-4 py-3.5 text-base sm:text-sm focus:outline-none focus:border-primary";

/** Candidature refusée : le vendeur corrige ses informations, renvoie ses documents, puis renvoie le dossier à Amachia. */
function ResubmitPage() {
  const navigate = useNavigate();
  const [uid, setUid] = useState<string | null>(null);
  const [kyc, setKyc] = useState<Kyc>(null);
  const [type, setType] = useState<"particulier" | "entreprise">("particulier");
  const [form, setForm] = useState({ first_name: "", last_name: "", niu: "" });
  const [files, setFiles] = useState<Record<string, File | undefined>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      setUid(data.user.id);
      const [{ data: k }, { data: p }] = await Promise.all([
        db.rpc("seller_kyc"),
        supabase.from("seller_profiles").select("account_type, first_name, last_name, niu").eq("id", data.user.id).maybeSingle(),
      ]);
      setKyc(k as Kyc);
      const sp = p as { account_type: string | null; first_name: string | null; last_name: string | null; niu: string | null } | null;
      if (sp) {
        setType(sp.account_type === "entreprise" ? "entreprise" : "particulier");
        setForm({ first_name: sp.first_name ?? "", last_name: sp.last_name ?? "", niu: sp.niu ?? "" });
      }
    });
  }, []);

  const submit = async () => {
    if (!uid) return;
    if (!form.first_name.trim() || !form.last_name.trim()) return toast.error("Indiquez votre prénom et votre nom.");
    const required = DOCS[type].filter(([, l]) => l.endsWith("*")).map(([k]) => k);
    if (required.some((k) => !files[k])) return toast.error("Ajoutez à nouveau les documents obligatoires (*), lisibles et en entier.");
    setBusy(true);
    try {
      for (const [docType, file] of Object.entries(files)) {
        if (!file) continue;
        const f = file.type.startsWith("image/") ? await compressImage(file, 2000, 0.85) : file;
        const ext = (f.name.split(".").pop() || "jpg").toLowerCase();
        const path = `${uid}/${docType}-${Date.now()}.${ext}`;
        const { error } = await supabase.storage.from("seller-documents").upload(path, f, { upsert: true, contentType: f.type || undefined });
        if (error) throw new Error("Envoi d'un document impossible. Vérifiez votre connexion et réessayez.");
        await supabase.from("seller_documents").insert({ user_id: uid, doc_type: docType, file_url: path });
      }
      const { error: pe } = await supabase.from("seller_profiles").update({ first_name: form.first_name.trim(), last_name: form.last_name.trim(), niu: form.niu.trim() || null } as never).eq("id", uid);
      if (pe) throw new Error(pe.message);
      const { error } = await db.rpc("seller_kyc_resubmit");
      if (error) throw new Error(error.message);
      window.dispatchEvent(new Event("kyc:changed"));
      toast.success("Dossier renvoyé : Amachia va l'examiner à nouveau.");
      navigate({ to: "/dashboard", replace: true });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Renvoi impossible."); }
    finally { setBusy(false); }
  };

  return (
    <DashboardLayout title="Corriger ma candidature" subtitle="Corrigez les éléments demandés puis renvoyez votre dossier.">
      <div className="mx-auto max-w-2xl space-y-5">
        {kyc?.status === "rejected" && (
          <div className="rounded-2xl border-2 border-destructive/50 bg-destructive/5 p-4">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-destructive"><AlertTriangle size={15} /> Motif du refus</p>
            <p className="mt-2 whitespace-pre-line text-lg font-semibold">{kyc.note || "Aucun motif précisé."}</p>
          </div>
        )}
        {kyc && kyc.status !== "rejected" && (
          <div className="rounded-2xl border border-border bg-card p-4 text-sm">Votre dossier n'est pas refusé : rien à renvoyer pour le moment.</div>
        )}

        <div className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-6">
          <h2 className="font-bold">Vos informations</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium">Prénom *<input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} className={`${inputCls} mt-1.5`} /></label>
            <label className="block text-sm font-medium">Nom *<input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} className={`${inputCls} mt-1.5`} /></label>
          </div>
          <label className="block text-sm font-medium">Numéro NIU{type === "entreprise" ? " *" : " (optionnel)"}<input value={form.niu} onChange={(e) => setForm({ ...form, niu: e.target.value })} placeholder="Ex: P123456789X" className={`${inputCls} mt-1.5`} /></label>
        </div>

        <div className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-6">
          <h2 className="flex items-center gap-2 font-bold"><FileText size={18} className="text-primary" /> Documents à renvoyer</h2>
          <p className="text-sm text-muted-foreground">Photos nettes, documents en entier et lisibles, en cours de validité.</p>
          {DOCS[type].map(([k, label]) => (
            <DocPick key={k} label={label} file={files[k]} onFile={(f) => setFiles((x) => ({ ...x, [k]: f }))} />
          ))}
        </div>

        <button type="button" onClick={() => void submit()} disabled={busy || kyc?.status !== "rejected"}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-4 text-base font-bold text-black disabled:opacity-50">
          {busy ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}Renvoyer mon dossier
        </button>
      </div>
    </DashboardLayout>
  );
}

function DocPick({ label, file, onFile }: { label: string; file?: File; onFile: (f: File | undefined) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="min-w-0">
      <p className="mb-1.5 text-sm font-medium">{label}</p>
      {file ? (
        <div className="flex min-w-0 items-center gap-3 rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-3">
          <Check size={18} className="shrink-0 text-emerald-500" />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold" title={file.name}>{file.name}</span>
          <button type="button" onClick={() => onFile(undefined)} aria-label="Retirer" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-destructive hover:bg-destructive/15"><X size={14} /></button>
        </div>
      ) : (
        <button type="button" onClick={() => ref.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-3.5 text-sm hover:border-primary">
          <Upload size={16} /> Ajouter le document
        </button>
      )}
      <input ref={ref} type="file" accept="image/*,application/pdf" hidden onChange={(e) => {
        const f = e.target.files?.[0]; e.target.value = "";
        if (f && f.size > (f.type.startsWith("image/") ? MAX_IMAGE_BYTES : 5 * 1024 * 1024)) return toast.error("Fichier trop lourd.");
        onFile(f);
      }} />
    </div>
  );
}
