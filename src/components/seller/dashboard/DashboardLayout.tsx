import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { playSound, setSoundEnabled, soundEnabled } from "@/lib/sound";
import { useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ensureSellerProfile } from "@/lib/sellerProfile";
import { money, useNavBadges, useSellerStats } from "@/lib/sellerStats";
import {
  LayoutDashboard, Store, Package, ShoppingCart, Users, CreditCard, Truck,
  BarChart3, Megaphone, Star, Bell, MessageSquare, Settings, HelpCircle, LogOut,
  RotateCcw, Sun, Moon, Volume2, VolumeX, Wallet, ChevronDown, AppWindow, Menu, X, AlertTriangle, PackagePlus,
} from "lucide-react";
import { useTheme } from "@/components/theme-provider";

const NAV = [
  { icon: LayoutDashboard, label: "Aperçu", to: "/dashboard" },
  { icon: Store, label: "Ma Boutique", to: "/dashboard/boutique" },
  { icon: Package, label: "Produits", to: "/dashboard/produits" },
  { icon: PackagePlus, label: "Réapprovisionnement", to: "/dashboard/reapprovisionnement" },
  { icon: ShoppingCart, label: "Commandes", to: "/dashboard/commandes" },
  { icon: RotateCcw, label: "Retours", to: "/dashboard/retours" },
  { icon: Users, label: "Clients", to: "/dashboard/clients" },
  { icon: CreditCard, label: "Paiements", to: "/dashboard/paiements" },
  { icon: Truck, label: "Livraison", to: "/dashboard/livraison" },
  { icon: BarChart3, label: "Analytique", to: "/dashboard/analytique" },
  { icon: Megaphone, label: "Promotions", to: "/dashboard/promotions" },
  { icon: Star, label: "Sponsoring", to: "/dashboard/sponsoring" },
  { icon: AppWindow, label: "Applications", to: "/dashboard/applications" },
  { icon: Bell, label: "Notifications", to: "/dashboard/notifications" },
  { icon: AlertTriangle, label: "Produits signalés", to: "/dashboard/signalements" },
  { icon: MessageSquare, label: "Avis", to: "/dashboard/avis" },

  { icon: Settings, label: "Paramètres", to: "/dashboard/parametres" },
] as const;

export function DashboardLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const badges = useNavBadges();
  // sons de l'espace vendeur : activés par défaut, coupables d'un clic
  const [sound, setSound] = useState(true);
  useEffect(() => { setSound(soundEnabled()); }, []);
  const toggleSound = () => { const next = !sound; setSoundEnabled(next); setSound(next); if (next) playSound("success"); };
  // Solde disponible réel : ventes livrées (le montant en attente apparaît au survol)
  const { stats: balanceStats } = useSellerStats(30, 120_000);
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [name, setName] = useState("Vendeur");
  const [avatar, setAvatar] = useState<string | null>(null);
  // mise à jour immédiate après un changement dans Paramètres
  useEffect(() => {
    const onProfile = (e: Event) => { const d = (e as CustomEvent<{ name?: string; avatar?: string | null }>).detail; if (d?.name) setName(d.name); if (d && "avatar" in d) setAvatar(d.avatar ?? null); };
    window.addEventListener("amashia-profile", onProfile);
    return () => window.removeEventListener("amashia-profile", onProfile);
  }, []);
  const [authReady, setAuthReady] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close drawer on route change
  useEffect(() => { setDrawerOpen(false); }, [path]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;
      if (!session?.user) { navigate({ to: "/connexion", replace: true }); return; }
      const { data: { user } } = await supabase.auth.getUser();
      if (!mounted) return;
      if (!user) { navigate({ to: "/connexion", replace: true }); return; }
      await ensureSellerProfile(user);
      const { data } = await (supabase as any).from("seller_profiles").select("first_name, avatar_url").eq("id", user.id).maybeSingle();
      if (data?.first_name) setName(data.first_name);
      setAvatar((data as { avatar_url?: string | null } | null)?.avatar_url ?? null);
      setAuthReady(true);
    })();
    return () => { mounted = false; };
  }, [navigate]);

  async function logout() {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  if (!authReady) {
    return (
      <div className="min-h-screen bg-background grid place-items-center px-6 text-center">
        <div>
          <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-primary animate-pulse" />
          <p className="mt-4 text-sm text-muted-foreground">Chargement du tableau de bord…</p>
        </div>
      </div>
    );
  }

  const SidebarInner = (
    <>
      <Link to="/" className="flex items-center gap-3 font-display font-extrabold text-lg p-6 border-b border-border">
        <span className="w-9 h-9 rounded-xl bg-gradient-primary grid place-items-center text-black text-sm">a</span>
        <span>Amashia Seller</span>
      </Link>
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = path === item.to || (item.to !== "/dashboard" && path.startsWith(item.to));
          const badge = item.to === "/dashboard/signalements" ? badges.reports : item.to === "/dashboard/commandes" ? badges.orders : item.to === "/dashboard/avis" ? badges.reviews : item.to === "/dashboard/notifications" ? badges.notifications : 0;
          return (
            <Link key={item.to} to={item.to} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition ${active ? "bg-primary/15 text-primary font-semibold" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}>
              <Icon size={18} />
              <span className="flex-1">{item.label}</span>
              {badge > 0 && (
                <span className={`min-w-[20px] rounded-full px-1.5 py-0.5 text-center text-[10px] font-bold leading-none text-black ${item.to === "/dashboard/signalements" ? "bg-red-500" : "bg-primary"}`}>
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="p-3 border-t border-border space-y-1">
        <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-muted-foreground hover:bg-secondary hover:text-foreground transition">
          <HelpCircle size={18} /> Aide
        </button>
        <button onClick={logout} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-destructive hover:bg-destructive/10 transition">
          <LogOut size={18} /> Déconnexion
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 shrink-0 bg-card border-r border-border flex-col sticky top-0 h-screen">
        {SidebarInner}
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <>
          <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={() => setDrawerOpen(false)} />
          <aside className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] bg-card border-r border-border flex flex-col lg:hidden animate-in slide-in-from-left duration-200">
            <button onClick={() => setDrawerOpen(false)} className="absolute top-4 right-4 w-8 h-8 grid place-items-center rounded-full bg-secondary text-muted-foreground hover:text-foreground" aria-label="Fermer">
              <X size={16} />
            </button>
            {SidebarInner}
          </aside>
        </>
      )}

      <main className="flex-1 min-w-0 overflow-x-hidden">
        {/* Mobile / tablet top bar */}
        <div className="lg:hidden sticky top-0 z-30 flex items-center justify-between gap-3 px-4 py-3 bg-card/95 backdrop-blur border-b border-border">
          <button onClick={() => setDrawerOpen(true)} className="w-10 h-10 grid place-items-center rounded-xl bg-secondary text-foreground" aria-label="Ouvrir le menu">
            <Menu size={20} />
          </button>
          <Link to="/" className="flex items-center gap-2 font-display font-extrabold text-base">
            <span className="w-8 h-8 rounded-lg bg-gradient-primary grid place-items-center text-black text-xs">a</span>
            <span>Amashia</span>
          </Link>
          <div className="flex items-center gap-2">
            <button onClick={toggle} className="w-10 h-10 grid place-items-center rounded-full bg-secondary text-muted-foreground" aria-label="Thème">
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button onClick={toggleSound} className="w-10 h-10 grid place-items-center rounded-full bg-secondary text-muted-foreground" aria-label={sound ? "Couper les sons" : "Activer les sons"}>
              {sound ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>
            <Link to="/dashboard/notifications" className="relative w-10 h-10 grid place-items-center rounded-full bg-secondary text-muted-foreground" aria-label="Notifications">
              <Bell size={16} />
              {badges.notifications > 0 && <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-primary text-black text-[9px] font-bold grid place-items-center">{badges.notifications > 99 ? "99+" : badges.notifications}</span>}
            </Link>
          </div>
        </div>

        <div className="p-4 sm:p-6 lg:p-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6 md:mb-8">
            <div className="text-center md:text-left min-w-0">
              <h1 className="text-2xl md:text-3xl font-extrabold break-words">{title}</h1>
              {subtitle && <p className="text-muted-foreground text-sm mt-1">{subtitle}</p>}
            </div>
            <div className="flex flex-wrap items-center justify-center md:justify-end gap-3 md:gap-4">
              <div className="hidden md:flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-2.5">
                <Wallet className="text-primary" size={18} />
                <div>
                  <p className="text-[11px] text-muted-foreground">Solde disponible</p>
                  <p className="font-bold text-sm" title={balanceStats ? `En attente de livraison : ${money(balanceStats.pending_balance)}` : undefined}>
                    {balanceStats ? money(balanceStats.balance) : "…"}
                  </p>
                </div>
              </div>
              <button onClick={toggle} className="hidden lg:grid w-10 h-10 place-items-center rounded-full bg-secondary text-muted-foreground hover:text-primary transition">
                {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              <button onClick={toggleSound} className="hidden lg:grid w-10 h-10 place-items-center rounded-full bg-secondary text-muted-foreground hover:text-primary transition" title={sound ? "Couper les sons" : "Activer les sons"}>
                {sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
              </button>
              <Link to="/dashboard/notifications" className="hidden lg:grid relative w-10 h-10 place-items-center rounded-full bg-secondary text-muted-foreground hover:text-primary transition" title="Notifications">
                <Bell size={18} />
                {badges.notifications > 0 && <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-primary text-black text-[10px] font-bold grid place-items-center">{badges.notifications > 99 ? "99+" : badges.notifications}</span>}
              </Link>
              <button className="flex items-center gap-2 bg-secondary rounded-full pl-1 pr-3 py-1">
                {avatar
                  ? <img src={avatar} alt="" className="h-8 w-8 rounded-full object-cover" />
                  : <div className="w-8 h-8 rounded-full bg-gradient-primary grid place-items-center text-black text-xs font-bold">{name[0]}</div>}
                <ChevronDown size={14} />
              </button>
            </div>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}

export function useSellerName() {
  const [name, setName] = useState("Vendeur");
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("seller_profiles").select("first_name").eq("id", user.id).maybeSingle();
      if (data?.first_name) setName(data.first_name);
    })();
  }, []);
  return name;
}
