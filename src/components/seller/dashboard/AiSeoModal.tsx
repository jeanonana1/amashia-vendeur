import { useState } from "react";
import { X, Sparkles, Loader2, Check, TrendingUp, Copy, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { generateSeoContent } from "@/lib/ai-seo.functions";
import { SITE_CATEGORIES, SITE_CATEGORY_GROUPS } from "@/lib/categories";

type Props = {
  initialName?: string;
  initialCategory?: string;
  initialPrice?: string;
  /** données déjà saisies dans le formulaire produit : transmises telles quelles à l'agent */
  specs?: { name: string; value: string }[];
  attributes?: { name: string; values: string[] }[];
  currentDescription?: string;
  onClose: () => void;
  onApply: (r: { name: string; description: string; category?: string }) => void;
};

type SeoResult = {
  titles: { text: string; score: number }[];
  recommendedTitle: string;
  description: string;
  slug: string;
  metaTitle: string;
  metaDescription: string;
  tags: string[];
  keywords: { primary: string; secondary: string[]; longTail: string[] };
  sellingPoints: string[];
  benefits: string[];
  ctas: string[];
  scores: { seoGoogle: number; seoMarketplace: number; conversion: number; content: number; global: number };
  improvements: string[];
};

const inp = "w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary";

export function AiSeoModal({ initialName = "", initialCategory = "", initialPrice = "", specs = [], attributes = [], currentDescription = "", onClose, onApply }: Props) {
  const generate = useServerFn(generateSeoContent);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SeoResult | null>(null);
  const [selectedTitle, setSelectedTitle] = useState<string>("");
  const [form, setForm] = useState({
    productName: initialName,
    category: initialCategory,
    brand: "",
    features: "",
    color: "",
    material: "",
    size: "",
    usage: "",
    audience: "",
    price: initialPrice,
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function run() {
    if (!form.productName.trim()) return toast.error("Le nom du produit est requis");
    setLoading(true);
    try {
      const plain = currentDescription.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
      const r = (await generate({
        data: {
          ...form,
          specs: specs.filter((x) => x.name.trim() && x.value.trim()).slice(0, 60),
          attributes: attributes.filter((a) => a.values.length).map((a) => ({ name: a.name, values: a.values.slice(0, 60) })).slice(0, 20),
          currentDescription: plain.slice(0, 8000) || undefined,
        },
      })) as SeoResult;
      setResult(r);
      setSelectedTitle(r.recommendedTitle || r.titles?.[0]?.text || "");
      toast.success("Fiche SEO générée");
    } catch (e: any) {
      toast.error(e.message || "Erreur IA");
    } finally {
      setLoading(false);
    }
  }

  function apply() {
    if (!result) return;
    onApply({ name: selectedTitle || result.recommendedTitle, description: result.description, category: form.category || undefined });
    toast.success("Fiche appliquée au produit");
    onClose();
  }

  const copy = (t: string) => { navigator.clipboard.writeText(t); toast.success("Copié"); };

  const ScoreBar = ({ label, value }: { label: string; value: number }) => (
    <div>
      <div className="flex justify-between text-[11px] mb-1"><span className="text-muted-foreground">{label}</span><span className="font-bold">{value}/100</span></div>
      <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
        <div className="h-full bg-gradient-primary rounded-full" style={{ width: `${value}%` }} />
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm grid place-items-center z-[100] p-4 overflow-y-auto" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-card border border-border rounded-2xl w-full max-w-4xl my-8 max-h-[calc(100vh-4rem)] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-primary grid place-items-center text-black"><Sparkles size={20} /></div>
            <div>
              <h3 className="font-bold text-lg">Agent IA SEO Amashia</h3>
              <p className="text-xs text-muted-foreground">Rédaction par Claude · mots-clés du marché camerounais</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 grid place-items-center rounded-lg hover:bg-secondary"><X size={16} /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          {!result && (
            <>
              <div className="rounded-xl bg-primary/5 border border-primary/20 p-4 text-xs text-muted-foreground">
                L'agent rédige uniquement à partir de <strong className="text-foreground">vos informations</strong> (ce formulaire + les caractéristiques, options et prix déjà saisis). Il recherche sur le web les mots que les acheteurs camerounais utilisent, puis écrit un titre optimisé et une description professionnelle. Rien n'est inventé : s'il manque une information, il vous la demandera dans les conseils. Comptez environ une minute.
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <div><label className="block text-xs font-semibold mb-1.5">Nom du produit *</label><input value={form.productName} onChange={(e) => set("productName", e.target.value)} className={inp} placeholder="Ex : Égreneur de maïs manuel" /></div>
                <div><label className="block text-xs font-semibold mb-1.5">Catégorie</label>
                  {/* liste fermée : uniquement les catégories du site Amashia */}
                  <select value={form.category} onChange={(e) => set("category", e.target.value)} className={inp}>
                    <option value="">Choisir une catégorie</option>
                    {form.category && !SITE_CATEGORIES.includes(form.category) && <option value={form.category}>{form.category}</option>}
                    {SITE_CATEGORY_GROUPS.map((g) => (
                      <optgroup key={g.group} label={g.group}>
                        {g.categories.map((c) => <option key={c} value={c}>{c}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </div>
                <div><label className="block text-xs font-semibold mb-1.5">Marque</label><input value={form.brand} onChange={(e) => set("brand", e.target.value)} className={inp} /></div>
                <div><label className="block text-xs font-semibold mb-1.5">Prix (FCFA)</label><input value={form.price} onChange={(e) => set("price", e.target.value)} className={inp} /></div>
                <div className="md:col-span-2"><label className="block text-xs font-semibold mb-1.5">Caractéristiques / à quoi ça sert</label><textarea value={form.features} onChange={(e) => set("features", e.target.value)} rows={3} className={inp} placeholder="Ex : retire les grains de maïs en 3 secondes, acier inox, ergonomique…" /></div>
                <div><label className="block text-xs font-semibold mb-1.5">Couleur</label><input value={form.color} onChange={(e) => set("color", e.target.value)} className={inp} /></div>
                <div><label className="block text-xs font-semibold mb-1.5">Matière</label><input value={form.material} onChange={(e) => set("material", e.target.value)} className={inp} /></div>
                <div><label className="block text-xs font-semibold mb-1.5">Taille / dimensions</label><input value={form.size} onChange={(e) => set("size", e.target.value)} className={inp} /></div>
                <div><label className="block text-xs font-semibold mb-1.5">Utilisation / contexte</label><input value={form.usage} onChange={(e) => set("usage", e.target.value)} className={inp} placeholder="Cuisine, sport, bureau…" /></div>
                <div className="md:col-span-2"><label className="block text-xs font-semibold mb-1.5">Public cible</label><input value={form.audience} onChange={(e) => set("audience", e.target.value)} className={inp} placeholder="Ex : ménagères, restaurateurs, jeunes actifs…" /></div>
              </div>
              <button onClick={run} disabled={loading} className="w-full py-3.5 rounded-full bg-gradient-primary text-black font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
                {loading ? <><Loader2 className="animate-spin" size={16} /> Recherche des mots-clés et rédaction… (≈ 1 min)</> : <><Wand2 size={16} /> Générer la fiche SEO</>}
              </button>
            </>
          )}

          {result && (
            <div className="space-y-5">
              {/* Scores */}
              <div className="bg-gradient-primary/10 border border-primary/30 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2"><TrendingUp size={16} className="text-primary" /><span className="font-bold text-sm">Score global : {result.scores.global}/100</span></div>
                  <button onClick={() => setResult(null)} className="text-xs text-muted-foreground hover:text-primary underline">Recommencer</button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <ScoreBar label="SEO Google" value={result.scores.seoGoogle} />
                  <ScoreBar label="SEO Marketplace" value={result.scores.seoMarketplace} />
                  <ScoreBar label="Conversion" value={result.scores.conversion} />
                  <ScoreBar label="Qualité" value={result.scores.content} />
                </div>
              </div>

              {/* Titles */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">🏷️ Titres proposés (sélectionnez le meilleur)</p>
                <div className="space-y-2">
                  {result.titles.map((t, i) => (
                    <label key={i} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${selectedTitle === t.text ? "border-primary bg-primary/10" : "border-border hover:border-primary/40"}`}>
                      <input type="radio" checked={selectedTitle === t.text} onChange={() => setSelectedTitle(t.text)} className="mt-1" />
                      <div className="flex-1">
                        <p className="text-sm font-semibold">{t.text}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">Score SEO : {t.score}/100 · {t.text.length} caractères</p>
                      </div>
                      <button type="button" onClick={(e) => { e.preventDefault(); copy(t.text); }} className="w-7 h-7 grid place-items-center rounded-lg hover:bg-secondary"><Copy size={12} /></button>
                    </label>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div>
                <div className="flex items-center justify-between mb-2"><p className="text-xs font-semibold text-muted-foreground">📝 Description (HTML, avec listes à puces)</p><button onClick={() => copy(result.description)} className="text-xs px-2 py-1 rounded-lg bg-secondary flex items-center gap-1"><Copy size={11} /> Copier</button></div>
                <div className="border border-border rounded-xl p-4 bg-background max-h-64 overflow-y-auto prose prose-sm prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: result.description }} />
              </div>

              {/* Meta */}
              <div className="grid md:grid-cols-2 gap-3">
                <div className="bg-secondary rounded-xl p-3">
                  <p className="text-[11px] font-semibold text-muted-foreground mb-1">Slug URL</p>
                  <p className="text-xs font-mono break-all">{result.slug}</p>
                </div>
                <div className="bg-secondary rounded-xl p-3">
                  <p className="text-[11px] font-semibold text-muted-foreground mb-1">Meta title</p>
                  <p className="text-xs">{result.metaTitle}</p>
                </div>
                <div className="bg-secondary rounded-xl p-3 md:col-span-2">
                  <p className="text-[11px] font-semibold text-muted-foreground mb-1">Meta description</p>
                  <p className="text-xs">{result.metaDescription}</p>
                </div>
              </div>

              {/* Keywords */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">🔍 Mots-clés</p>
                <div className="flex flex-wrap gap-1.5">
                  <span className="px-3 py-1 rounded-full bg-primary text-black text-xs font-semibold">★ {result.keywords.primary}</span>
                  {result.keywords.secondary.map((k, i) => <span key={i} className="px-3 py-1 rounded-full bg-secondary text-xs">{k}</span>)}
                  {result.keywords.longTail.map((k, i) => <span key={i} className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs">🎯 {k}</span>)}
                </div>
              </div>

              {/* Selling points + benefits */}
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">💎 Puces de vente</p>
                  <ul className="space-y-1.5">{result.sellingPoints.map((p, i) => <li key={i} className="text-xs flex gap-2"><Check size={12} className="text-emerald-400 mt-0.5 shrink-0" />{p}</li>)}</ul>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">🎁 Bénéfices marketing</p>
                  <ul className="space-y-1.5">{result.benefits.map((b, i) => <li key={i} className="text-xs flex gap-2"><Check size={12} className="text-primary mt-0.5 shrink-0" />{b}</li>)}</ul>
                </div>
              </div>

              {/* CTAs + tags */}
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">📣 CTA suggérés</p>
                  <div className="space-y-1.5">{result.ctas.map((c, i) => <div key={i} className="text-xs px-3 py-2 rounded-lg bg-secondary">{c}</div>)}</div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">🏷️ Tags de recherche</p>
                  <div className="flex flex-wrap gap-1.5">{result.tags.map((t, i) => <span key={i} className="px-2 py-0.5 rounded-full border border-border text-[11px]">{t}</span>)}</div>
                </div>
              </div>

              {/* Improvements */}
              {result.improvements?.length > 0 && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                  <p className="text-xs font-semibold text-amber-400 mb-2">💡 Améliorations recommandées</p>
                  <ul className="space-y-1">{result.improvements.map((i, k) => <li key={k} className="text-xs text-muted-foreground">• {i}</li>)}</ul>
                </div>
              )}

              {/* Aperçu temps réel de ce qui sera appliqué au produit */}
              <div className="rounded-2xl border-2 border-primary/40 bg-primary/5 p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-primary">👁️ Aperçu en temps réel · ce qui sera publié</p>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/20 text-primary font-semibold">LIVE</span>
                </div>
                <div className="bg-background rounded-xl p-4 border border-border space-y-3">
                  <h2 className="text-lg font-bold leading-tight">{selectedTitle || result.recommendedTitle}</h2>
                  <p className="text-[11px] text-muted-foreground">{(selectedTitle || result.recommendedTitle).length} caractères · titre du produit</p>
                  <div className="border-t border-border pt-3 prose prose-sm prose-invert max-w-none max-h-56 overflow-y-auto" dangerouslySetInnerHTML={{ __html: result.description }} />
                </div>
              </div>
            </div>
          )}
        </div>

        {result && (
          <div className="p-5 border-t border-border flex flex-col sm:flex-row gap-2">
            <button onClick={onClose} className="flex-1 py-3 rounded-full bg-secondary font-semibold text-sm">Fermer sans appliquer</button>
            <button onClick={apply} className="flex-1 py-3 rounded-full bg-gradient-primary text-black font-semibold text-sm flex items-center justify-center gap-2"><Check size={14} /> Appliquer au produit</button>
          </div>
        )}
      </div>
    </div>
  );
}
