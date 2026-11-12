import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

let admin: ReturnType<typeof createClient<Database>> | undefined;
export const supabaseAdmin = new Proxy({} as ReturnType<typeof createClient<Database>>, {
  get(_, property) {
    if (!admin) {
      const url = process.env.SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!url || !key) throw new Error("Configuration serveur manquante : renseignez les variables d’environnement.");
      admin = createClient<Database>(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    }
    const value = Reflect.get(admin, property);
    return typeof value === "function" ? value.bind(admin) : value;
  },
});