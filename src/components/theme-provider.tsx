import { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light";
const ThemeCtx = createContext<{ theme: Theme; toggle: () => void }>({ theme: "dark", toggle: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");
  const [ready, setReady] = useState(false);

  // Thème mémorisé lu une seule fois ; il n'est réécrit qu'une fois chargé (sinon « sombre » l'écraserait au chargement).
  useEffect(() => {
    let stored: string | null = null;
    try { stored = localStorage.getItem("amashia-seller-theme"); } catch { /* stockage indisponible */ }
    if (stored === "light" || stored === "dark") setTheme(stored);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
    try { localStorage.setItem("amashia-seller-theme", theme); } catch { /* stockage indisponible */ }
  }, [theme, ready]);

  return (
    <ThemeCtx.Provider value={{ theme, toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")) }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export const useTheme = () => useContext(ThemeCtx);
