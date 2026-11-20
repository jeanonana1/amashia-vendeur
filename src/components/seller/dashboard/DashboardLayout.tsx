import { ReviewPrompt } from "@/components/seller/dashboard/ReviewPrompt";
import { LANG_KEY, preferredLang, setSellerLang } from "@/lib/sellerLang";
import { LangToggle } from "@/components/seller/LangToggle";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { playSound, setSoundEnabled, soundEnabled } from "@/lib/sound";
import { useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ensureSellerProfile } from "@/lib/sellerProfile";
import { money, useNavBadges, useSellerStats } from "@/lib/sellerStats";
import {
  LayoutDashboard, Store, Package, ShoppingCart, Users, CreditCard, Truck,
  BarChart3, Megaphone, Star, Bell, MessageSquare, Settings, LogOut,
  RotateCcw, Sun, Moon, Volume2, VolumeX, Wallet, ChevronDown, AppWindow, Menu, X, AlertTriangle, PackagePlus, Percent } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { SellerLogo } from "@/components/seller/SellerLogo";

type NavItem = { icon: typeof LayoutDashboard; label: string; to: string };
/** Menu regroupé par usage. */
const GROUPS: { title: string; items: NavItem[] }[] = [
  { title: "Boutique", items: [
    { icon: LayoutDashboard, label: "Aperçu", to: "/dashboard" },
    { icon: Store, label: "Ma boutique", to: "/dashboard/boutique" },
    { icon: Package, label: "Produits", to: "/dashboard/produits" },
    { icon: PackagePlus, label: "Réapprovisionnement", to: "/dashboard/reapprovisionnement" },
  ] },
  { title: "Ventes", items: [
    { icon: ShoppingCart, label: "Commandes", to: "/dashboard/commandes" },
    { icon: Truck, label: "Livraison", to: "/dashboard/livraison" },
    { icon: RotateCcw, label: "Retours", to: "/dashboard/retours" },
    { icon: Users, label: "Clients", to: "/dashboard/clients" },
    { icon: MessageSquare, label: "Avis", to: "/dashboard/avis" },
  ] },
  { title: "Argent", items: [
    { icon: CreditCard, label: "Paiements", to: "/dashboard/paiements" },
    { icon: Percent, label: "Commissions", to: "/dashboard/commissions" },
  ] },
  { title: "Croissance", items: [
    { icon: BarChart3, label: "Analytique", to: "/dashboard/analytique" },
    { icon: Megaphone, label: "Promotions", to: "/dashboard/promotions" },
    { icon: Star, label: "Sponsoring", to: "/dashboard/sponsoring" },
    { icon: AppWindow, label: "Applications", to: "/dashboard/applications" },
  ] },
  { title: "Compte", items: [
    { icon: Bell, label: "Notifications", to: "/dashboard/notifications" },
    { icon: AlertTriangle, label: "Produits signalés", to: "/dashboard/signalements" },
    { icon: Settings, label: "Paramètres", to: "/dashboard/parametres" },
  ] },
];
const NAV = GROUPS.flatMap((g) => g.items);

import { NewOrderAlarm } from "@/components/seller/dashboard/NewOrderAlarm";
import { PushAlertsButton } from "@/components/seller/dashboard/PushAlertsButton";
import { registerAppPush } from "@/lib/nativeApp";
/** Application Android Amachia Seller : enregistre ce téléphone pour les alertes de commandes. */
function AppPushRegister({ uid }: { uid: string }) {
  useEffect(() => { void registerAppPush(); }, [uid]);
  return null;
}

export function DashboardLayout({ title, subtitle, actions, children }: { title: string; subtitle?: string; actions?: ReactNode; children: ReactNode }) {
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
  const [uid, setUid] = useState<string | null>(null);
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
      const { data } = await (supabase as any).from("seller_profiles").select("first_name, avatar_url, language").eq("id", user.id).maybeSingle();
      if (data?.first_name) setName(data.first_name);
      // langue choisie par le vendeur (inscription / paramètres) : appliquée sur un nouvel appareil
      try {
        const lg = (data as { language?: string | null } | null)?.language;
        if ((lg === "en" || lg === "fr") && !localStorage.getItem(LANG_KEY) && lg !== preferredLang()) setSellerLang(lg);
      } catch { /* stockage indisponible */ }
      setAvatar((data as { avatar_url?: string | null } | null)?.avatar_url ?? null);
      setUid(user.id);
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
          <SellerLogo className="mx-auto h-12" />
          <div className="mx-auto mt-6 h-1.5 w-48 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-label="Chargement">
            <div className="animate-loading h-full w-2/5 rounded-full bg-primary" />
          </div>
          <p className="mt-4 text-sm text-muted-foreground">Chargement du tableau de bord…</p>
        </div>
      </div>
    );
  }

  const badgeOf = (to: string) => to === "/dashboard/signalements" ? badges.reports : to === "/dashboard/commandes" ? badges.orders : to === "/dashboard/avis" ? badges.reviews : to === "/dashboard/notifications" ? badges.notifications : to === "/dashboard/retours" ? badges.returns : 0;
  const current = NAV.find((n) => path === n.to || (n.to !== "/dashboard" && path.startsWith(n.to)));

  const SidebarInner = (
    <>
      <div className="flex h-[4.5rem] items-center px-5">
        <Link to="/" className="flex items-center" aria-label="Accueil amachia seller"><SellerLogo className="h-10" /></Link>
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4 pt-2">
        {GROUPS.map((g) => (
          <div key={g.title}>
            <p className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70">{g.title}</p>
            <div className="space-y-0.5">
              {g.items.map((item) => {
                const Icon = item.icon;
                const active = current?.to === item.to;
                const badge = badgeOf(item.to);
                return (
                  <Link key={item.to} to={item.to} className={`group relative flex w-full items-center gap-3 rounded-xl px-3 py-2 text-[13.5px] transition ${active ? "bg-primary/12 font-semibold text-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}>
                    {active && <span className="absolute -left-3 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary" />}
                    <Icon size={17} className={active ? "text-primary" : ""} />
                    <span className="flex-1 truncate">{item.label}</span>
                    {badge > 0 && (
                      <span key={badge} className={`badge-beat min-w-[20px] rounded-full px-1.5 py-0.5 text-center text-[10px] font-bold leading-none text-black ${item.to === "/dashboard/signalements" ? "bg-red-500" : "bg-primary"}`}>{badge > 99 ? "99+" : badge}</span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-border p-3">
        {/* Mobile : thème et sons accessibles depuis le menu */}
        <div className="mb-2 grid grid-cols-2 gap-2 lg:hidden">
          <button onClick={toggle} className="flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-secondary text-xs font-semibold">
            {theme === "dark" ? <><Sun size={15} /> Mode clair</> : <><Moon size={15} /> Mode sombre</>}
          </button>
          <button onClick={toggleSound} className="flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-secondary text-xs font-semibold">
            {sound ? <><VolumeX size={15} /> Couper les sons</> : <><Volume2 size={15} /> Activer les sons</>}
          </button>
        </div>
        <div className="mb-2 flex items-center justify-between gap-2 rounded-xl px-2 py-1 text-xs font-semibold text-muted-foreground">Langue / Language <LangToggle /></div>
        <div className="flex items-center gap-3 rounded-xl px-2 py-2">
          {avatar ? <img src={avatar} alt="" className="h-9 w-9 rounded-full object-cover" /> : <div className="grid h-9 w-9 place-items-center rounded-full bg-primary text-sm font-bold text-black">{name[0]}</div>}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{name}</p>
            <a href="https://amachia.com" target="_blank" rel="noreferrer" className="text-[11px] text-muted-foreground hover:text-primary">Voir Amachia ↗</a>
          </div>
          <button onClick={logout} className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive" title="Déconnexion" aria-label="Déconnexion"><LogOut size={16} /></button>
        </div>
      </div>
    </>
  );

  const iconBtn = "grid h-10 w-10 place-items-center rounded-xl border border-border bg-card text-muted-foreground transition hover:text-foreground";
  return (
    <div className="flex min-h-screen bg-background">
      {/* Barre latérale (ordinateur) */}
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r border-border bg-card/40 lg:flex">
        {SidebarInner}
      </aside>

      {/* Menu (mobile) */}
      {drawerOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden" onClick={() => setDrawerOpen(false)} />
          <aside className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-border bg-card animate-in slide-in-from-left duration-200 lg:hidden">
            <button onClick={() => setDrawerOpen(false)} className="absolute right-3 top-4 grid h-8 w-8 place-items-center rounded-full bg-secondary text-muted-foreground hover:text-foreground" aria-label="Fermer"><X size={16} /></button>
            {SidebarInner}
          </aside>
        </>
      )}

      <main className="min-w-0 flex-1 overflow-x-clip">
        {/* Barre du haut */}
        <header className="sticky top-0 z-30 border-b border-border bg-background">
          <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-3 px-4 sm:px-6 lg:px-8">
            <button onClick={() => setDrawerOpen(true)} className={`${iconBtn} lg:hidden`} aria-label="Ouvrir le menu"><Menu size={18} /></button>
            <Link to="/" className="flex min-w-0 items-center lg:hidden" aria-label="Accueil amachia seller"><SellerLogo className="h-8 max-w-full" /></Link>
            <div className="hidden min-w-0 items-center gap-2 text-sm text-muted-foreground lg:flex">
              <span>Espace vendeur</span><span className="text-border">/</span><span className="truncate font-semibold text-foreground">{current?.label ?? title}</span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <div className="hidden items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-1.5 md:flex" title={balanceStats ? `En attente de livraison : ${money(balanceStats.pending_balance)}` : undefined}>
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/12 text-primary"><Wallet size={15} /></span>
                <div className="leading-tight">
                  <p className="text-[10px] text-muted-foreground">Solde disponible</p>
                  <p className="tabular text-sm font-bold">{balanceStats ? money(balanceStats.balance) : "…"}</p>
                </div>
              </div>
              <div className="hidden sm:block"><LangToggle /></div>
              <button onClick={toggle} className={`${iconBtn} hidden sm:grid`} aria-label="Thème">{theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}</button>
              <button onClick={toggleSound} className={`${iconBtn} hidden sm:grid`} title={sound ? "Couper les sons" : "Activer les sons"} aria-label={sound ? "Couper les sons" : "Activer les sons"}>{sound ? <Volume2 size={17} /> : <VolumeX size={17} />}</button>
              <PushAlertsButton className={iconBtn} />
              <Link to="/dashboard/notifications" className={`${iconBtn} relative`} title="Notifications" aria-label="Notifications">
                <Bell size={17} />
                {badges.notifications > 0 && <span key={badges.notifications} className="badge-beat absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-black">{badges.notifications > 99 ? "99+" : badges.notifications}</span>}
              </Link>
              <Link to="/dashboard/parametres" className="hidden items-center gap-2 rounded-xl border border-border bg-card py-1 pl-1 pr-2.5 sm:flex" title="Paramètres du compte">
                {avatar ? <img src={avatar} alt="" className="h-8 w-8 rounded-lg object-cover" /> : <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-xs font-bold text-black">{name[0]}</div>}
                <ChevronDown size={14} className="text-muted-foreground" />
              </Link>
            </div>
          </div>
        </header>

        <div data-dash className="mx-auto max-w-[1440px] p-4 sm:p-6 lg:p-8">
          <div className="mb-6 flex items-start justify-between gap-3 md:mb-8">
            <div className="min-w-0">
              <h1 className="break-words text-2xl font-extrabold md:text-[2rem]">{title}</h1>
              {subtitle && <p className="mt-1 text-sm text-muted-foreground md:text-[15px]">{subtitle}</p>}
            </div>
            {actions && <div className="shrink-0">{actions}</div>}
          </div>
          {children}
          {uid && <ReviewPrompt uid={uid} />}
          {uid && <NewOrderAlarm uid={uid} />}
          {uid && <AppPushRegister uid={uid} />}
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
