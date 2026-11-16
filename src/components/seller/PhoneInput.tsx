import { useState } from "react";
import { cmDigits, cmPhoneError } from "@/lib/phone";

/**
 * Champ téléphone Cameroun : « +237 » fixe, puis 9 chiffres commençant par 6.
 * Les lettres et autres caractères sont ignorés à la frappe ; au-delà de 9 chiffres, rien n'est ajouté.
 */
export function PhoneInput({ value, onChange, className = "", required, disabled, name, placeholder = "6XX XX XX XX" }: {
  value: string; onChange: (digits: string) => void; className?: string; required?: boolean; disabled?: boolean; name?: string; placeholder?: string;
}) {
  const [touched, setTouched] = useState(false);
  const d = cmDigits(value);
  const err = d ? cmPhoneError(d, !touched) : touched && required ? cmPhoneError("") : null;
  return (
    <div>
      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">+237</span>
        <input
          type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={9} name={name}
          required={required} disabled={disabled} placeholder={placeholder} value={d}
          onChange={(e) => onChange(cmDigits(e.target.value))}
          onKeyDown={(e) => { if (e.key.length === 1 && !/\d/.test(e.key) && !e.ctrlKey && !e.metaKey) e.preventDefault(); }}
          onBlur={() => setTouched(true)}
          aria-invalid={!!err}
          className={`${className} !pl-14 ${err ? "!border-red-500" : ""}`}
        />
      </div>
      {err && <p className="mt-1 text-xs font-medium text-red-500">{err}</p>}
    </div>
  );
}
