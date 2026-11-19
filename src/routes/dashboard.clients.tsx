import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/seller/dashboard/DashboardLayout";
import { Search, X, MapPin, ShoppingBag, Wallet, Calendar, Users, Repeat } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { dateTime, money, num } from "@/lib/sellerStats";

export const Route = createFileRoute("/dashboard/clients")({
  head: () => ({ meta: [{ title: "Clients — Amashia Seller" }, { name: "description", content: "Clients : votre espace vendeur Amashia pour gérer votre activité." }, { property: "og:title", content: "Clients — Amashia Seller" }, { property: "og:description", content: "Clients : votre espace vendeur Amashia pour gérer votre activité." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: ClientsPage,
});

/** Client ayant acheté dans la boutique (aucune coordonnée personnelle : nom et quartier uniquement). */
type ClientOrder = { order_number: string; created_at: string; amount: number; items: number; status: string; products: string[] };
type Client = {
  id: string; code: string; name: string; area: string; orders: number; items: number; spent: number;
  first_order: string; last_order: string; products: string[]; order_list: ClientOrder[];
};

const ORDER_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "Commande reçue", cls: "bg-amber-500/15 text-amber-400" },
  preparing: { label: "En préparation", cls: "bg-blue-500/15 text-blue-400" },
  shipped: { label: "En cours de livraison", cls: "bg-violet-500/15 text-violet-400" },
  delivered: { label: "Livrée", cls: "bg-emerald-500/15 text-emerald-400" },
  cancelled: { label: "Annulée", cls: "bg-red-500/15 text-red-400" },
};

function segment(c: Client): { label: string; cls: string } {
  if (c.orders >= 5 || c.spent >= 200_000) return { label: "VIP", cls: "bg-amber-500/20 text-amber-400" };
  if (c.orders >= 3) return { label: "Fidèle", cls: "bg-emerald-500/20 text-emerald-400" };
  if (c.orders === 2) return { label: "Régulier", cls: "bg-blue-500/20 text-blue-400" };
  if (c.orders === 0) return { label: "Annulé", cls: "bg-red-500/15 text-red-400" };
  return { label: "Nouveau", cls: "bg-violet-500/20 text-violet-400" };
}

const SORTS = { recent: "Dernière commande", spent: "Montant dépensé", orders: "Nombre de commandes", name: "Nom" } as const;

function ClientsPage() {
  const [clients, setClients] = useState<Client[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Client | null>(null);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<keyof typeof SORTS>("recent");

  useEffect(() => {
    let alive = true;
    const load = async () => {
      let data: unknown = null; let error: { message: string } | null = null;
      try { ({ data, error } = await (supabase as any).rpc("seller_customers")); } catch (e) { error = { message: (e as Error).message }; }
      if (!alive) return;
      // une coupure réseau passagère (veille du téléphone, changement de page…) n'efface pas les données
      // déjà affichées et le message disparaît dès que la connexion revient
      if (error) setError(error.message);
      else { setClients((data as Client[]) || []); setError(null); }
    };
    void load();
    const t = window.setInterval(load, 60_000);
    return () => { alive = false; window.clearInterval(t); };
  }, []);

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    const l = (clients ?? []).filter((c) => !term || c.name.toLowerCase().includes(term) || c.area.toLowerCase().includes(term) || c.code.toLowerCase().includes(term.replace("#", "")));
    return [...l].sort((a, b) =>
      sort === "spent" ? b.spent - a.spent :
      sort === "orders" ? b.orders - a.orders :
      sort === "name" ? a.name.localeCompare(b.name, "fr") :
      b.last_order.localeCompare(a.last_order));
  }, [clients, q, sort]);

  const totals = useMemo(() => {
    const c = clients ?? [];
    const spent = c.reduce((s, x) => s + x.spent, 0);
    const orders = c.reduce((s, x) => s + x.orders, 0);
    return { count: c.length, returning: c.filter((x) => x.orders >= 2).length, spent, basket: orders ? spent / orders : 0 };
  }, [clients]);

  return (
    <DashboardLayout title="Clients" subtitle="Les personnes qui ont acheté dans votre boutique">
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={Users} label="Clients" value={num(totals.count)} />
        <Kpi icon={Repeat} label="Clients fidèles (2+ commandes)" value={num(totals.returning)} />
        <Kpi icon={Wallet} label="Total dépensé" value={money(totals.spent)} />
        <Kpi icon={ShoppingBag} label="Panier moyen" value={money(totals.basket)} />
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 sm:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un client ou une ville" className="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-3 text-sm" />
          </div>
          <select value={sort} onChange={(e) => setSort(e.target.value as keyof typeof SORTS)} className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm">
            {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>Trier : {v}</option>)}
          </select>
        </div>

        {error && clients === null && <p className="py-6 text-center text-sm text-red-400">Connexion impossible pour le moment. Nouvel essai automatique dans quelques secondes…</p>}
        {clients === null && !error && <div className="h-40 animate-pulse rounded-xl bg-secondary/40" />}
        {clients && list.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {clients.length === 0 ? "Aucun client pour le moment. Vos acheteurs apparaîtront ici après leur première commande." : "Aucun client ne correspond à votre recherche."}
          </p>
        )}

        {list.length > 0 && (
          <>
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:hidden">
            {list.map((c) => {
              const seg = segment(c);
              return (
                <li key={c.id}>
                  <button type="button" onClick={() => setSelected(c)} className="flex w-full items-center gap-3 rounded-xl border border-border/70 p-3 text-left transition active:bg-secondary/40">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-bold text-primary">{initials(c.name)}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold">{c.name}</p>
                        <p className="shrink-0 text-sm font-bold">{money(c.spent)}</p>
                      </div>
                      <p className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground"><MapPin size={11} className="shrink-0" /><span className="truncate">{c.area || "—"}</span><span className="shrink-0">· {c.orders} cmd</span></p>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <span className={`truncate rounded-full px-2 py-0.5 text-[10px] font-semibold ${seg.cls}`}>{seg.label}</span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">{dateTime(c.last_order)}</span>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase text-muted-foreground">
                  <th className="py-3 text-left font-semibold">Client</th>
                  <th className="py-3 text-left font-semibold">Commandes</th>
                  <th className="py-3 text-left font-semibold">Total dépensé</th>
                  <th className="py-3 text-left font-semibold">Dernière commande</th>
                  <th className="py-3 text-left font-semibold">Statut</th>
                </tr>
              </thead>
              <tbody>
                {list.map((c) => {
                  const seg = segment(c);
                  return (
                    <tr key={c.id} onClick={() => setSelected(c)} className="cursor-pointer border-b border-border/50 transition hover:bg-secondary/30">
                      <td className="py-3">
                        <div className="flex items-center gap-3">
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-bold text-primary">{initials(c.name)}</span>
                          <div className="min-w-0">
                            <p className="max-w-[200px] truncate font-semibold">{c.name}</p>
                            <p className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin size={11} /> {c.area || "—"}</p>
                          </div>
                        </div>
                      </td>
                      <td>{c.orders}</td>
                      <td className="font-semibold">{money(c.spent)}</td>
                      <td className="whitespace-nowrap text-muted-foreground">{dateTime(c.last_order)}</td>
                      <td><span className={`rounded-full px-3 py-1 text-xs font-semibold ${seg.cls}`}>{seg.label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setSelected(null)}>
          <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-card p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-5 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <span className="grid h-12 w-12 place-items-center rounded-full bg-primary/15 font-bold text-primary">{initials(selected.name)}</span>
                <div>
                  <h3 className="text-lg font-bold">{selected.name}</h3>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin size={12} /> {selected.area || "—"}</p>
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="grid h-8 w-8 place-items-center rounded-full hover:bg-secondary" aria-label="Fermer"><X size={16} /></button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Detail icon={ShoppingBag} label="Commandes" value={String(selected.orders)} />
              <Detail icon={Wallet} label="Total dépensé" value={money(selected.spent)} />
              <Detail icon={Calendar} label="Premier achat" value={dateTime(selected.first_order)} />
              <Detail icon={Calendar} label="Dernier achat" value={dateTime(selected.last_order)} />
            </div>
            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold text-muted-foreground">Toutes ses commandes ({selected.order_list?.length ?? 0})</p>
              <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                {(selected.order_list ?? []).map((o) => {
                  const st = ORDER_STATUS[o.status] ?? ORDER_STATUS.pending;
                  return (
                    <div key={o.order_number} className="rounded-xl border border-border p-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">{o.order_number}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${st.cls}`}>{st.label}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">{dateTime(o.created_at)} · {o.items} article{o.items > 1 ? "s" : ""} · <b className="text-foreground">{money(o.amount)}</b></p>
                      <ul className="mt-1 text-xs text-muted-foreground">{o.products.map((p, i) => <li key={i} className="line-clamp-1">• {p}</li>)}</ul>
                    </div>
                  );
                })}
              </div>
            </div>
            <p className="mt-5 text-[11px] text-muted-foreground">Par confidentialité, le téléphone et l'e-mail des clients ne sont pas communiqués aux vendeurs.</p>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

function initials(n: string) {
  return n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "C";
}

function Kpi({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <Icon size={18} className="mb-2 text-primary" />
      <p className="text-xl font-extrabold">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

function Detail({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-secondary/40 p-3">
      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Icon size={12} /> {label}</p>
      <p className="mt-0.5 font-semibold">{value}</p>
    </div>
  );
}
