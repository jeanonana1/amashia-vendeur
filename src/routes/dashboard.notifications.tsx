import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/seller/dashboard/DashboardLayout";
import { ShoppingCart, Star, Wallet, AlertCircle, Bell, CheckCheck, XCircle, Flag, Rocket, UserPlus, RotateCcw, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { NOTIFS_SEEN_EVENT } from "@/lib/sellerStats";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/notifications")({
  head: () => ({ meta: [{ title: "Notifications — Amashia Seller" }, { name: "description", content: "Toutes les notifications de votre boutique Amashia." }] }),
  component: NotificationsPage,
});

type Notif = { id: string; kind: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string };

const KINDS: Record<string, { icon: typeof Bell; color: string }> = {
  order: { icon: ShoppingCart, color: "bg-emerald-500/20 text-emerald-400" },
  cancel: { icon: XCircle, color: "bg-red-500/15 text-red-400" },
  review: { icon: Star, color: "bg-violet-500/20 text-violet-400" },
  report: { icon: Flag, color: "bg-red-500/15 text-red-400" },
  stock: { icon: AlertCircle, color: "bg-amber-500/20 text-amber-400" },
  published: { icon: Rocket, color: "bg-primary/20 text-primary" },
  follower: { icon: UserPlus, color: "bg-sky-500/20 text-sky-400" },
  payout: { icon: Wallet, color: "bg-amber-500/20 text-amber-400" },
  return: { icon: RotateCcw, color: "bg-orange-500/20 text-orange-400" },
};

const TABS: { key: string; label: string; kinds?: string[] }[] = [
  { key: "all", label: "Toutes" },
  { key: "unread", label: "Non lues" },
  { key: "orders", label: "Commandes", kinds: ["order", "cancel", "return"] },
  { key: "reviews", label: "Avis", kinds: ["review", "report"] },
  { key: "stock", label: "Stock", kinds: ["stock", "published"] },
  { key: "payouts", label: "Paiements", kinds: ["payout"] },
];

function ago(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "À l'instant";
  if (s < 3600) return `Il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `Il y a ${Math.floor(s / 3600)} h`;
  if (s < 172800) return "Hier";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function NotificationsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Notif[] | null>(null);
  const [tab, setTab] = useState("all");

  async function load() {
    const { data } = await (supabase as any).from("seller_notifications").select("id,kind,title,body,link,read_at,created_at").order("created_at", { ascending: false }).limit(200);
    setItems((data as Notif[]) ?? []);
  }
  useEffect(() => {
    void load();
    const t = window.setInterval(load, 20_000);
    return () => window.clearInterval(t);
  }, []);

  const list = useMemo(() => {
    const all = items ?? [];
    const t = TABS.find((x) => x.key === tab)!;
    if (tab === "unread") return all.filter((n) => !n.read_at);
    if (t.kinds) return all.filter((n) => t.kinds!.includes(n.kind));
    return all;
  }, [items, tab]);
  const unread = (items ?? []).filter((n) => !n.read_at).length;

  async function markRead(ids?: string[]) {
    await (supabase as any).rpc("mark_notifications_read", { _ids: ids ?? null });
    const now = new Date().toISOString();
    setItems((prev) => (prev ?? []).map((n) => (!ids || ids.includes(n.id) ? { ...n, read_at: n.read_at ?? now } : n)));
    window.dispatchEvent(new Event(NOTIFS_SEEN_EVENT)); // la pastille de la cloche se met à jour
  }

  async function open(n: Notif) {
    if (!n.read_at) await markRead([n.id]);
    if (n.link) navigate({ to: n.link as never });
  }

  async function remove(n: Notif) {
    const { error } = await (supabase as any).from("seller_notifications").delete().eq("id", n.id);
    if (error) return toast.error("Suppression impossible");
    setItems((prev) => (prev ?? []).filter((x) => x.id !== n.id));
    window.dispatchEvent(new Event(NOTIFS_SEEN_EVENT));
  }

  return (
    <DashboardLayout title="Notifications" subtitle="Tout ce qui se passe dans votre boutique, en temps réel">
      <div className="rounded-2xl border border-border bg-card p-4 sm:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex max-w-full overflow-x-auto rounded-full bg-secondary p-1 text-xs">
            {TABS.map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)} className={`shrink-0 rounded-full px-4 py-1.5 ${tab === t.key ? "bg-primary font-semibold text-black" : ""}`}>
                {t.label}{t.key === "unread" && unread > 0 ? ` (${unread})` : ""}
              </button>
            ))}
          </div>
          <button onClick={() => markRead()} disabled={!unread} className="flex items-center gap-2 text-sm text-primary disabled:opacity-40"><CheckCheck size={14} /> Tout marquer comme lu</button>
        </div>

        {items === null ? (
          <div className="h-40 animate-pulse rounded-xl bg-secondary/40" />
        ) : list.length === 0 ? (
          <p className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground"><Bell size={26} /> {tab === "unread" ? "Aucune notification non lue." : "Aucune notification pour le moment. Vos commandes, avis et alertes de stock apparaîtront ici."}</p>
        ) : (
          <div className="space-y-2">
            {list.map((n) => {
              const k = KINDS[n.kind] ?? { icon: Bell, color: "bg-primary/20 text-primary" };
              const Icon = k.icon;
              return (
                <div key={n.id} className={`group flex items-start gap-4 rounded-2xl p-4 transition ${n.read_at ? "hover:bg-secondary/30" : "border border-primary/20 bg-primary/5"}`}>
                  <button onClick={() => open(n)} className="flex min-w-0 flex-1 items-start gap-4 text-left">
                    <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${k.color}`}><Icon size={18} /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold">{n.title}</p>
                        {!n.read_at && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
                      </div>
                      {n.body && <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{n.body}</p>}
                      <p className="mt-1 text-[11px] text-muted-foreground">{ago(n.created_at)}</p>
                    </div>
                  </button>
                  <button onClick={() => remove(n)} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground opacity-60 hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100" aria-label="Supprimer"><Trash2 size={14} /></button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
