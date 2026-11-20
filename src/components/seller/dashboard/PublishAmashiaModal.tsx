import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { X, Copy, Check, Sparkles, Rocket } from "lucide-react";
import { toast } from "sonner";
import { publishToMarketplace } from "@/lib/marketplace.functions";
import { Button } from "@/components/ui/button";

export interface PublishProduct {
  id: string;
  name: string;
  description: string | null;
  price: number;
  compare_at_price?: number | null;
  purchase_price?: number | null;
  stock: number;
  category: string | null;
  sku: string | null;
  status: string;
  images: string[] | null;
  specifications?: { name: string; value: string }[] | null;
  attributes?: { name: string; values: string[] }[] | null;
  variant_images?: { label: string; color: string; images: string[] }[] | null;
}

const fcfa = (n: number) => `${Number(n || 0).toLocaleString("fr-FR")} FCFA`;
const stripHtml = (s: string) => s.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]+>/g, "").replace(/\n{3,}/g, "\n\n").trim();

export function buildFiche(p: PublishProduct, angles: { label: string; why: string }[]) {
  const specs = (p.specifications || []).filter((s) => s.name && s.value);
  const attrs = (p.attributes || []).filter((a) => a.name && a.values?.length);
  const variants = (p.variant_images || []).filter((v) => v.label);
  const lines: string[] = [];
  lines.push(`TITRE\n${p.name}`);
  lines.push(`\nCATÉGORIE\n${p.category || "Non précisée"}`);
  lines.push(`\nDESCRIPTION\n${stripHtml(p.description || "") || "—"}`);
  lines.push(`\nPRIX\nPrix de vente : ${fcfa(p.price)}${p.compare_at_price ? `\nPrix barré : ${fcfa(p.compare_at_price)}` : ""}\nStock disponible : ${p.stock}`);
  if (p.sku) lines.push(`\nRÉFÉRENCE (SKU)\n${p.sku}`);
  if (specs.length) lines.push(`\nCARACTÉRISTIQUES\n${specs.map((s) => `• ${s.name} : ${s.value}`).join("\n")}`);
  if (attrs.length) lines.push(`\nOPTIONS\n${attrs.map((a) => `• ${a.name} : ${a.values.join(", ")}`).join("\n")}`);
  if (variants.length) lines.push(`\nVARIANTES COULEUR\n${variants.map((v) => `• ${v.label} (${v.color}) — ${v.images?.length || 0} photo(s)`).join("\n")}`);
  if (p.images?.length) lines.push(`\nIMAGES\n${p.images.map((u, i) => `${i + 1}. ${u}`).join("\n")}`);
  if (angles.length) lines.push(`\n8 ANGLES MARKETING\n${angles.map((a, i) => `${i + 1}. ${a.label}${a.why ? ` — ${a.why}` : ""}`).join("\n")}`);
  return lines.join("\n");
}

export function PublishAmashiaModal({ product, onClose, onPublished }: {
  product: PublishProduct;
  onClose: () => void;
  onPublished?: (id: string) => void;
}) {
  const [angles, setAngles] = useState<{ label: string; why: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const publishProduct = useServerFn(publishToMarketplace);

  useEffect(() => {
    let alive = true;
    const ck = `amashia-angles:${product.id}:${product.name}`;
    (async () => {
      try {
        const saved = sessionStorage.getItem(ck);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (alive && Array.isArray(parsed) && parsed.length) {
            setAngles(parsed);
            setLoading(false);
            return;
          }
        }
      } catch { /* ignore */ }
      try {
        const res = await fetch("/api/ai-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "angles", productName: product.name, category: product.category }),
        });
        const j = await res.json();
        if (Array.isArray(j?.angles) && j.angles.length) {
          const list = j.angles.map((a: any) => ({ label: a.label, why: a.why }));
          try { sessionStorage.setItem(ck, JSON.stringify(list)); } catch { /* ignore */ }
          if (alive) setAngles(list);
        }
      } catch { /* ignore */ }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [product.id, product.name, product.category]);

  const fiche = buildFiche(product, angles);

  async function copy() {
    try {
      await navigator.clipboard.writeText(fiche);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("Fiche copiée");
    } catch {
      toast.error("Copie impossible");
    }
  }

  async function publish() {
    setPublishing(true);
    try {
      await publishProduct({ data: { productId: product.id, angles } });
      toast.success("Publication réussie sur Amachia Marketplace");
      onPublished?.(product.id);
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Publication impossible");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm grid place-items-center z-[110] p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[88vh] flex flex-col">
        <div className="flex items-start justify-between gap-3 p-5 border-b border-border">
          <div className="min-w-0">
            <h3 className="font-bold flex items-center gap-2"><Rocket size={16} className="text-primary" /> Publier sur Amachia</h3>
            <p className="text-xs text-muted-foreground truncate">{product.name}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0" aria-label="Fermer"><X size={16} /></Button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Sparkles size={13} className="text-primary" />
            {loading ? "Génération des 8 angles marketing…" : `Fiche complète prête (${angles.length} angles marketing).`}
          </div>
          <pre className="whitespace-pre-wrap text-xs leading-relaxed bg-background border border-border rounded-xl p-4 max-h-[45vh] overflow-y-auto">{fiche}</pre>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 p-5 border-t border-border">
          <Button variant="secondary" onClick={copy} className="flex-1 rounded-full">
            {copied ? <Check size={14} /> : <Copy size={14} />} Copier la fiche
          </Button>
          <Button onClick={publish} disabled={publishing || loading} className="flex-1 rounded-full bg-gradient-primary">
            <Rocket size={14} /> {publishing ? "Envoi…" : "Publier sur Amachia"}
          </Button>
        </div>
      </div>
    </div>
  );
}
