// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    server: {
      proxy: {
        // Local dev only: forwards same-origin /api/* calls to a backend
        // running locally on this port, so src/lib/api.ts's default (no
        // VITE_API_BASE_URL set) works without any extra config. Deployed
        // builds call the backend directly via VITE_API_BASE_URL instead --
        // see .env.example and README.md.
        "/api": {
          target: "http://localhost:7860",
          changeOrigin: true,
        },
      },
    },
  },
});
