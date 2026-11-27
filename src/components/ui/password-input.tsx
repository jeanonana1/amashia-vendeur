import { useState, InputHTMLAttributes } from "react";
import { IconVoir as Eye, IconMasquer as EyeOff } from "@/components/icons/AmachiaIcons";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export function PasswordInput({ className = "", ...props }: Props) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        {...props}
        type={show ? "text" : "password"}
        className={`${className} pr-11`}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition"
        tabIndex={-1}
        aria-label={show ? "Masquer le mot de passe" : "Afficher le mot de passe"}
      >
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}
