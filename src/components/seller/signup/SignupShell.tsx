import { Link } from "@tanstack/react-router";
import { ArrowLeft, Check } from "lucide-react";
import { SellerLogo } from "@/components/seller/SellerLogo";

const STEPS = ["Infos", "Détails", "Documents", "Paiement", "Localisation", "Vérif.", "Fini"];

export function SignupShell({ step, children, onBack }: { step: number; children: React.ReactNode; onBack?: () => void }) {
  const progress = (step / STEPS.length) * 100;
  return (
    <div className="w-full max-w-3xl bg-card border border-border rounded-3xl p-8 md:p-10">
      <div className="flex justify-center mb-6">
        <SellerLogo className="h-10 md:h-12" />
      </div>
      {onBack ? (
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary mb-4">
          <ArrowLeft size={16} /> Retour
        </button>
      ) : (
        <Link to="/inscription" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary mb-4">
          <ArrowLeft size={16} /> Retour
        </Link>
      )}
      <div className="h-1.5 bg-secondary rounded-full overflow-hidden mb-4">
        <div className="h-full bg-gradient-primary transition-all duration-500" style={{ width: `${progress}%` }} />
      </div>
      <div className="grid grid-cols-7 gap-1 mb-8">
        {STEPS.map((label, i) => {
          const num = i + 1;
          const done = num < step;
          const active = num === step;
          return (
            <div key={label} className="flex flex-col items-center text-center">
              <div className={`w-9 h-9 rounded-full grid place-items-center text-xs font-bold mb-1.5 transition ${done || active ? "bg-gradient-primary text-black" : "bg-secondary text-muted-foreground"}`}>
                {done ? <Check size={16} /> : num}
              </div>
              <span className={`text-[10px] ${active ? "text-foreground font-semibold" : "text-muted-foreground"}`}>{label}</span>
            </div>
          );
        })}
      </div>
      {children}
    </div>
  );
}
