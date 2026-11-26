// Fonction Supabase « compress-image » : compression automatique (TinyPNG / Tinify) des images envoyées
// par les clients, les vendeurs et l'administration dans le stockage « product-images ».
// La base place chaque nouvelle image dans une file (image_compression_jobs) et appelle cette fonction ;
// une tâche planifiée la relance toutes les 10 minutes pour les images restées en attente.
// L'image compressée remplace l'originale au même emplacement : même adresse, aucune mise à jour à faire ailleurs.
// Clé : secret TINIFY_API_KEY des fonctions Supabase (jamais dans le code).
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const KEY = Deno.env.get("TINIFY_API_KEY") ?? "";
const SUPPORTED = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const MIN_BYTES = 8 * 1024; // en dessous, le gain ne vaut pas une compression du quota
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

type Job = { id: number; bucket: string; name: string };
class Pause extends Error {} // quota atteint / clé absente : on s'arrête, la file reprendra plus tard

async function finish(id: number, patch: Record<string, unknown>) {
  await db.from("image_compression_jobs").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
}

async function compress(job: Job) {
  const { data: blob, error } = await db.storage.from(job.bucket).download(job.name);
  if (error || !blob) throw new Error(`lecture impossible : ${error?.message ?? "fichier absent"}`);
  const type = (blob.type || "").split(";")[0];
  const before = blob.size;
  if (!SUPPORTED.has(type)) return finish(job.id, { status: "skipped", size_before: before, error: `format non pris en charge (${type || "inconnu"})` });
  if (before < MIN_BYTES) return finish(job.id, { status: "skipped", size_before: before, error: "image déjà légère" });

  const auth = "Basic " + btoa(`api:${KEY}`);
  const shrink = await fetch("https://api.tinify.com/shrink", { method: "POST", headers: { Authorization: auth }, body: await blob.arrayBuffer() });
  if (shrink.status === 401) throw new Pause("clé TinyPNG refusée");
  if (shrink.status === 429) throw new Pause("quota TinyPNG du mois atteint");
  if (!shrink.ok) throw new Error(`TinyPNG ${shrink.status} : ${(await shrink.text()).slice(0, 200)}`);
  const out = await shrink.json() as { output: { size: number; url: string } };
  const count = Number(shrink.headers.get("Compression-Count") ?? 0) || null;
  // gain négligeable : on garde l'original intact
  if (out.output.size >= before * 0.97) return finish(job.id, { status: "skipped", size_before: before, size_after: out.output.size, compression_count: count, error: "gain inférieur à 3 %" });

  const res = await fetch(out.output.url, { headers: { Authorization: auth } });
  if (!res.ok) throw new Error(`téléchargement TinyPNG ${res.status}`);
  const small = new Uint8Array(await res.arrayBuffer());
  const { data: meta } = await db.from("image_compression_jobs").select("cache_control").eq("id", job.id).single();
  const { error: upErr } = await db.storage.from(job.bucket).upload(job.name, small, {
    upsert: true, contentType: type, cacheControl: String(meta?.cache_control ?? "31536000").replace(/^max-age=/, ""),
  });
  if (upErr) throw new Error(`écriture impossible : ${upErr.message}`);
  await finish(job.id, { status: "done", size_before: before, size_after: small.byteLength, compression_count: count, error: null });
}

async function run(ids: number[] | null, limit: number) {
  if (!KEY) {
    const msg = "clé TINIFY_API_KEY absente";
    await db.from("image_compression_jobs").update({ error: msg }).eq("status", "pending");
    return { paused: msg };
  }
  const { data: jobs } = await db.rpc("image_compression_claim", { _ids: ids, _limit: limit });
  let done = 0;
  for (const job of (jobs ?? []) as Job[]) {
    try { await compress(job); done++; }
    catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (e instanceof Pause) {
        // remise en attente de tout ce qui a été réservé, sans compter d'échec
        await db.from("image_compression_jobs").update({ status: "pending", error: msg }).eq("status", "processing");
        return { done, paused: msg };
      }
      await finish(job.id, { status: "failed", error: msg.slice(0, 500) });
    }
  }
  return { done };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST uniquement" }, 405);
  const body = await req.json().catch(() => ({}));
  const id = Number(body?.id);
  const ids = Number.isInteger(id) && id > 0 ? [id] : null;
  // réponse immédiate : la compression continue en arrière-plan
  const task = run(ids, ids ? 1 : 15).catch((e) => console.error("compress-image", e));
  // @ts-ignore EdgeRuntime est fourni par Supabase
  if (typeof EdgeRuntime !== "undefined") { EdgeRuntime.waitUntil(task); return json({ accepted: true }, 202); }
  return json(await task);
});
