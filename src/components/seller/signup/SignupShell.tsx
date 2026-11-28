import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { IconRetour as ArrowLeft } from "@/components/icons/AmachiaIcons";
import { useFramedFields } from "@/lib/framedFields";

const STEPS = ["Infos", "Détails", "Documents", "Vérif.", "Boutique"];

export function SignupShell({ step, children, onBack }: { step: number; children: React.ReactNode; onBack?: () => void }) {
  useFramedFields();
  const progress = (step / STEPS.length) * 100;
  return (
    <div className="w-full rounded-none border-y border-border bg-card px-4 py-6 shadow-card sm:rounded-[1.6rem] sm:border sm:p-8 md:p-10">
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
      <div className="grid grid-cols-5 gap-1 mb-8">
        {STEPS.map((label, i) => {
          const num = i + 1;
          const done = num < step;
          const active = num === step;
          return (
            <div key={label} className="flex flex-col items-center text-center">
              <div className={`w-10 h-10 sm:w-9 sm:h-9 rounded-full grid place-items-center text-sm sm:text-xs font-bold mb-1.5 transition ${done || active ? "bg-gradient-primary text-black" : "bg-secondary text-muted-foreground"}`}>
                {done ? <Check size={16} /> : num}
              </div>
              {/* mobile : seul le titre de l'étape en cours s'affiche ; ordinateur : tous les titres */}
              <span className={`text-[10px] ${active ? "text-foreground font-semibold" : "text-muted-foreground hidden sm:block"} whitespace-nowrap`}>{label}</span>
            </div>
          );
        })}
      </div>
      {children}
    </div>
  );
}
