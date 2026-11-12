import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, CheckCircle2, ShoppingCart, Store, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/p/$id")({
  head: () => ({ meta: [
    { title: "Produit — Amashia Marketplace" },
    { name: "description", content: "Découvrez et commandez ce produit publié sur Amashia Marketplace." },
    { property: "og:title", content: "Produit — Amashia Marketplace" },
    { property: "og:description", content: "Découvrez et commandez ce produit publié sur Amashia Marketplace." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: PublicProduct,
  errorComponent: () => <div className="p-8 text-center">Erreur de chargement</div>,
  notFoundComponent: () => <div className="p-8 text-center">Produit introuvable</div>,
});

function PublicProduct() {
  const { id } = Route.useParams();
  const [p, setP] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<{ order_number: string; amount: number } | null>(null);
  const [form, setForm] = useState({ customerName: "", customerContact: "", deliveryAddress: "", quantity: 1, paymentMethod: "À la livraison" });

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any).from("marketplace_listings").select("*").eq("product_id", id).eq("status", "published").maybeSingle();
      setP(data);
      setLoading(false);
    })();
  }, [id]);

  if (loading) return <div className="p-12 text-center text-muted-foreground">Chargement…</div>;
  if (!p) return <div className="p-12 text-center"><p className="mb-4">Produit introuvable</p><Link to="/" className="text-primary">Retour</Link></div>;

  const specs = (p.specifications as { name: string; value: string }[]) || [];

  async function order() {
    setSubmitting(true);
    try {
      const response = await fetch("/api/public/marketplace-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: id, ...form }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Commande impossible");
      setSuccess(payload.order);
      setP((current: any) => ({ ...current, stock: Math.max(0, current.stock - form.quantity) }));
    } catch (error) {
      alert(error instanceof Error ? error.message : "Commande impossible");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 text-sm font-bold"><Store size={18} className="text-primary" /> Amashia</Link>
        <button onClick={() => window.close()} className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1"><ArrowLeft size={12} /> Fermer</button>
      </header>
      <div className="max-w-5xl mx-auto p-6 grid md:grid-cols-2 gap-8">
        <div>
          {p.images?.[0] ? (
            <img src={p.images[0]} alt={p.title} className="w-full aspect-square object-cover rounded-2xl" />
          ) : (
            <div className="w-full aspect-square bg-gradient-primary rounded-2xl" />
          )}
          {p.images?.length > 1 && (
            <div className="grid grid-cols-4 gap-2 mt-3">
              {p.images.slice(1, 5).map((u: string, i: number) => <img key={i} src={u} className="aspect-square object-cover rounded-lg" />)}
            </div>
          )}
        </div>
        <div className="space-y-4">
          <span className="text-xs text-muted-foreground">{p.category || "Marketplace"}</span>
          <h1 className="text-3xl font-extrabold">{p.title}</h1>
          <p className="text-3xl font-extrabold text-primary">{Number(p.price).toLocaleString()} FCFA</p>
          <p className="text-sm text-muted-foreground">Stock : {p.stock}</p>
          {p.description && <p className="text-sm leading-relaxed whitespace-pre-line">{p.description}</p>}
          {specs.length > 0 && (
            <div className="border-t border-border pt-4">
              <h3 className="font-bold mb-3">Caractéristiques</h3>
              <table className="w-full text-sm">
                <tbody>
                  {specs.map((s, i) => (
                    <tr key={i} className="border-b border-border/50"><td className="py-2 text-muted-foreground">{s.name}</td><td className="py-2 font-semibold text-right">{s.value}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Button onClick={() => setCheckoutOpen(true)} disabled={p.status !== "published" || p.stock === 0} className="w-full h-12 rounded-full bg-gradient-primary">
            <ShoppingCart size={16} /> {p.stock === 0 ? "Rupture de stock" : "Acheter maintenant"}
          </Button>
        </div>
      </div>

      {checkoutOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4 backdrop-blur-sm" onClick={() => setCheckoutOpen(false)}>
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-5 flex items-start justify-between gap-3">
              <div><h2 className="text-xl font-bold">Finaliser la commande</h2><p className="text-sm text-muted-foreground">{p.title}</p></div>
              <Button variant="ghost" size="icon" onClick={() => setCheckoutOpen(false)} aria-label="Fermer"><X /></Button>
            </div>
            {success ? (
              <div className="py-8 text-center">
                <CheckCircle2 className="mx-auto mb-3 text-primary" size={42} />
                <h3 className="text-lg font-bold">Commande confirmée</h3>
                <p className="mt-2 text-sm text-muted-foreground">Référence {success.order_number}</p>
                <p className="mt-1 font-bold text-primary">{Number(success.amount).toLocaleString("fr-FR")} FCFA</p>
              </div>
            ) : (
              <div className="space-y-3">
                <input value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} placeholder="Nom complet" className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm" />
                <input value={form.customerContact} onChange={(e) => setForm({ ...form, customerContact: e.target.value })} placeholder="Téléphone ou e-mail" className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm" />
                <textarea value={form.deliveryAddress} onChange={(e) => setForm({ ...form, deliveryAddress: e.target.value })} placeholder="Adresse de livraison" className="min-h-24 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm" />
                <div className="grid grid-cols-2 gap-3">
                  <input type="number" min={1} max={p.stock} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Math.max(1, Number(e.target.value)) })} className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm" />
                  <select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })} className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm"><option>À la livraison</option><option>Mobile Money</option></select>
                </div>
                <div className="flex items-center justify-between border-t border-border pt-3 font-bold"><span>Total</span><span className="text-primary">{Number(p.price * form.quantity).toLocaleString("fr-FR")} FCFA</span></div>
                <Button onClick={order} disabled={submitting || !form.customerName || !form.customerContact || !form.deliveryAddress} className="w-full rounded-full bg-gradient-primary">{submitting ? "Confirmation…" : "Confirmer la commande"}</Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
