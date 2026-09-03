import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    /**
     * Les tests tournent à l'heure de Paris, pas en UTC.
     *
     * Ce n'est pas un détail de confort. Un bug entier a vécu ici sans être
     * vu : une date civile passée par `new Date("…T00:00:00")` est interprétée
     * en heure LOCALE, si bien qu'à Paris « aujourd'hui » redevenait « hier »
     * une fois réécrit en UTC. En UTC le calcul tombait juste — donc les tests
     * ET la CI étaient verts, et seul le téléphone de l'utilisateur voyait le
     * défaut.
     *
     * Faire tourner la suite dans le fuseau où vivent réellement les
     * utilisateurs rend cette famille d'erreurs visible là où elle doit
     * l'être : avant la publication.
     */
    env: { TZ: "Europe/Paris" },
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // Edge Function helpers are plain TypeScript and worth testing too.
    include: [
      "src/**/*.{test,spec}.{ts,tsx}",
      "supabase/functions/**/*.{test,spec}.ts",
      "scripts/**/*.{test,spec}.ts",
    ],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
