import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { VitePWA } from "vite-plugin-pwa";

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    "BASE_PATH environment variable is required but was not provided.",
  );
}

const normalizedBasePath = basePath.endsWith("/") ? basePath : `${basePath}/`;

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: null,
      manifest: {
        name: "FarmAssist — довідник лікарських засобів",
        short_name: "ФармАсист",
        description:
          "Оперативний довідник зареєстрованих лікарських засобів України.",
        lang: "uk",
        start_url: normalizedBasePath,
        scope: normalizedBasePath,
        display: "standalone",
        background_color: "#122629",
        theme_color: "#122629",
        shortcuts: [
          {
            name: "Перевірка відпуску",
            short_name: "Відпуск",
            description: "Відкрити професійну перевірку відпуску",
            url: `${normalizedBasePath}dispense`,
            icons: [
              {
                src: "shortcut-dispense-96x96.png",
                sizes: "96x96",
                type: "image/png",
              },
            ],
          },
          {
            name: "Перевірка взаємодій",
            short_name: "Взаємодії",
            description: "Перевірити взаємодії вибраних препаратів",
            url: `${normalizedBasePath}interactions`,
            icons: [
              {
                src: "shortcut-interactions-96x96.png",
                sizes: "96x96",
                type: "image/png",
              },
            ],
          },
        ],
        icons: [
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "pwa-maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{html,js,css,svg,png,ico,woff,woff2}"],
        globIgnores: [
          "**/review-*.js",
          "**/beta-dashboard-*.js",
          "**/data-quality-*.js",
          "**/perf-metrics-*.js",
          "**/import-*.js",
          "**/about-*.js",
          "**/ai-reference-*.js",
          "**/analogs-*.js",
          "**/compare-*.js",
          "**/dispensing-*.js",
          "**/drug-detail-*.js",
          "**/favorites-*.js",
          "**/history-*.js",
          "**/instruction-search-*.js",
          "**/interactions-*.js",
          "**/login-*.js",
          "**/not-found-*.js",
          "**/pharmacovigilance-*.js",
          "**/regulatory-radar-*.js",
        ],
        navigateFallback: "index.html",
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            urlPattern: /\/api\/catalog(?:\/|$)/,
            handler: "NetworkOnly",
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\//,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "google-fonts-stylesheets",
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\//,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-webfonts",
              expiration: {
                maxEntries: 8,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(
        import.meta.dirname,
        "..",
        "..",
        "attached_assets",
      ),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
