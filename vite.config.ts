import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

/**
 * Optimiseur d'images Vercel (/_vercel/image) : redimensionne et convertit en
 * WebP/AVIF les photos du stockage Supabase. `sizes` = largeurs de src/lib/img.ts.
 */
const nitroConfig = {
  vercel: {
    config: {
      images: {
        sizes: [64, 128, 256, 384, 640, 828, 1080, 1600],
        qualities: [75],
        formats: ["image/avif", "image/webp"],
        minimumCacheTTL: 2678400,
        domains: ["oawobzuyjkcnmaorqfmh.supabase.co"],
      },
    },
  },
} as unknown as Parameters<typeof nitro>[0];

export default defineConfig({
  plugins: [
    tsconfigPaths(),
    tailwindcss(),
    tanstackStart({ server: { entry: "server" } }),
    react(),
    nitro(nitroConfig),
  ],
  server: { host: "0.0.0.0", port: 8080 },
});