// vite.config.js
import { defineConfig, loadEnv } from "file:///C:/Users/Hugo%20Santiago/OneDrive/Documentos/Invitacion/CRM/frontend/node_modules/vite/dist/node/index.js";
import react from "file:///C:/Users/Hugo%20Santiago/OneDrive/Documentos/Invitacion/CRM/frontend/node_modules/@vitejs/plugin-react/dist/index.js";
import path from "path";
import { VitePWA } from "file:///C:/Users/Hugo%20Santiago/OneDrive/Documentos/Invitacion/CRM/frontend/node_modules/vite-plugin-pwa/dist/index.js";
var __vite_injected_original_dirname = "C:\\Users\\Hugo Santiago\\OneDrive\\Documentos\\Invitacion\\CRM\\frontend";
var modeIndex = process.argv.findIndex((arg) => arg === "--mode" || arg === "-m");
var mode = modeIndex >= 0 ? process.argv[modeIndex + 1] : process.env.NODE_ENV || "development";
var env = loadEnv(mode, process.cwd(), "");
var BASE = process.env.VITE_BASE_PATH || env.VITE_BASE_PATH || "/crm/";
var ESC = BASE.replace(/\//g, "\\/");
var API_TARGET = process.env.VITE_API_TARGET || env.VITE_API_TARGET || "http://localhost:3001";
var ES_REMOTO = /^https?:\/\/(?!localhost|127\.)/.test(API_TARGET);
var makeApiProxy = () => ({
  target: API_TARGET,
  changeOrigin: true,
  // Contra staging la direccion ya viene bien (/testeo/api/...); contra el
  // backend local hay que quitarle el prefijo, que ahi no existe.
  ...ES_REMOTO ? {} : { rewrite: (p) => p.replace(/^\/(?:testeo2|testeo|crm)/, "") },
  // La sesion viaja en una cookie de 360crm.tech: sin quitarle el dominio, el
  // navegador la tira y no se puede ni entrar.
  cookieDomainRewrite: { "*": "" }
});
var vite_config_default = defineConfig({
  plugins: [
    react(),
    VitePWA({
      // selfDestroying=true publica un SW que se autoinstala, toma el control y
      // se desinstala limpiando caches. Resuelve definitivamente el problema de
      // "Sin conexión" causado por SWs antiguos que cachearon URLs HTTP del
      // dominio anterior. Cuando todos los navegadores se hayan limpiado
      // podremos reintroducir el PWA con cuidado.
      selfDestroying: true,
      registerType: "autoUpdate",
      injectRegister: "auto",
      base: BASE,
      scope: BASE,
      manifest: false,
      includeAssets: ["offline.html", "favicon.svg", "icons/*.png"],
      workbox: {
        // Sin clientsClaim/skipWaiting: el SW nuevo espera a que el usuario recargue.
        clientsClaim: false,
        skipWaiting: false,
        cleanupOutdatedCaches: true,
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        navigateFallback: `${BASE}offline.html`,
        navigateFallbackDenylist: [new RegExp(`^${ESC}api\\/`), new RegExp(`^${ESC}embed\\/`)],
        runtimeCaching: [
          // Google Fonts: cache largo
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }
            }
          },
          // Auth/login: NUNCA cachear
          {
            urlPattern: new RegExp(`${ESC}api\\/auth(\\/|$)`),
            handler: "NetworkOnly"
          },
          // Endpoints autenticados (lectura): NetworkFirst con timeout corto
          {
            urlPattern: new RegExp(`${ESC}api\\/(leads|clients|products|users|matriculas|conversions|reports|dashboard|email-sequences|forms|webhooks|projects|notifications|payroll|commissions|accounting|webhook-tokens|field-definitions|status|ia|claude|seo|campaigns|woocommerce|documents|reports-ia|audiences)(\\/|$|\\?)`, "i"),
            handler: "NetworkFirst",
            method: "GET",
            options: {
              cacheName: "api-data",
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 5 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          // Imagenes/avatares/logos (assets binarios servidos por API)
          {
            urlPattern: new RegExp(`${ESC}api\\/.*\\/(logo|avatar)`, "i"),
            handler: "StaleWhileRevalidate",
            method: "GET",
            options: {
              cacheName: "api-images",
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          // Fuentes Google (binarios fonts.gstatic.com)
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-static",
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          // Imagenes/iconos servidos desde el origen
          {
            urlPattern: ({ request, sameOrigin }) => sameOrigin && request.destination === "image",
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "static-images",
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 }
            }
          },
          // Estaticos JS/CSS (revalida en background)
          {
            urlPattern: ({ request, sameOrigin }) => sameOrigin && (request.destination === "script" || request.destination === "style"),
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "static-assets",
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 7 }
            }
          }
        ]
      },
      devOptions: { enabled: false }
    })
  ],
  base: BASE,
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test/setup.js",
    exclude: ["**/node_modules/**", "**/dist/**", "**/e2e/**", "**/playwright-report/**", "**/test-results/**"]
  },
  resolve: {
    alias: {
      "@": path.resolve(__vite_injected_original_dirname, "./src")
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-recharts": ["recharts"],
          "vendor-ui": ["@phosphor-icons/react", "class-variance-authority", "clsx", "tailwind-merge"],
          "vendor-forms": ["react-hook-form", "@hookform/resolvers", "zod"],
          "vendor-uploads": ["react-dropzone"]
        }
      }
    }
  },
  server: {
    port: 5173,
    proxy: {
      "/crm/api": makeApiProxy(),
      "/testeo/api": makeApiProxy(),
      "/testeo2/api": makeApiProxy()
    }
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxIdWdvIFNhbnRpYWdvXFxcXE9uZURyaXZlXFxcXERvY3VtZW50b3NcXFxcSW52aXRhY2lvblxcXFxDUk1cXFxcZnJvbnRlbmRcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIkM6XFxcXFVzZXJzXFxcXEh1Z28gU2FudGlhZ29cXFxcT25lRHJpdmVcXFxcRG9jdW1lbnRvc1xcXFxJbnZpdGFjaW9uXFxcXENSTVxcXFxmcm9udGVuZFxcXFx2aXRlLmNvbmZpZy5qc1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vQzovVXNlcnMvSHVnbyUyMFNhbnRpYWdvL09uZURyaXZlL0RvY3VtZW50b3MvSW52aXRhY2lvbi9DUk0vZnJvbnRlbmQvdml0ZS5jb25maWcuanNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcsIGxvYWRFbnYgfSBmcm9tICd2aXRlJztcclxuaW1wb3J0IHJlYWN0IGZyb20gJ0B2aXRlanMvcGx1Z2luLXJlYWN0JztcclxuaW1wb3J0IHBhdGggZnJvbSAncGF0aCc7XHJcbmltcG9ydCB7IFZpdGVQV0EgfSBmcm9tICd2aXRlLXBsdWdpbi1wd2EnO1xyXG5cclxuY29uc3QgbW9kZUluZGV4ID0gcHJvY2Vzcy5hcmd2LmZpbmRJbmRleCgoYXJnKSA9PiBhcmcgPT09ICctLW1vZGUnIHx8IGFyZyA9PT0gJy1tJyk7XHJcbmNvbnN0IG1vZGUgPSBtb2RlSW5kZXggPj0gMCA/IHByb2Nlc3MuYXJndlttb2RlSW5kZXggKyAxXSA6IHByb2Nlc3MuZW52Lk5PREVfRU5WIHx8ICdkZXZlbG9wbWVudCc7XHJcbmNvbnN0IGVudiA9IGxvYWRFbnYobW9kZSwgcHJvY2Vzcy5jd2QoKSwgJycpO1xyXG5cclxuLy8gQmFzZSBwYXRoIHBvciBlbnRvcm5vOiBWSVRFX0JBU0VfUEFUSD0vY3JtLyAocHJvZCkgbyAvdGVzdGVvLyAoc3RhZ2luZylcclxuY29uc3QgQkFTRSA9IHByb2Nlc3MuZW52LlZJVEVfQkFTRV9QQVRIIHx8IGVudi5WSVRFX0JBU0VfUEFUSCB8fCAnL2NybS8nO1xyXG5jb25zdCBFU0MgPSBCQVNFLnJlcGxhY2UoL1xcLy9nLCAnXFxcXC8nKTtcclxuXHJcbi8vIEEgcXVlIGJhY2tlbmQgaGFibGEgZWwgYG5wbSBydW4gZGV2YC5cclxuLy9cclxuLy8gUG9yIGRlZmVjdG8sIGVsIGRlIHR1IG1hcXVpbmEuIENvbiBWSVRFX0FQSV9UQVJHRVQgc2UgYXB1bnRhIGEgc3RhZ2luZyB5XHJcbi8vIGVudG9uY2VzIE5PIGhhY2UgZmFsdGEgbGV2YW50YXIgYmFja2VuZCBuaSBiYXNlIGRlIGRhdG9zIFx1MjAxNCB1dGlsIHBhcmEgcXVpZW5cclxuLy8gdHJhYmFqYSBzb2xvIGVsIGRpc2VcdTAwRjFvLlxyXG4vL1xyXG4vLyBWYSBwb3IgZWwgcHJveHkgZGUgVml0ZSBhIHByb3Bvc2l0bzogZWwgbmF2ZWdhZG9yIHNvbG8gaGFibGEgY29uIGxvY2FsaG9zdCxcclxuLy8gYXNpIHF1ZSBubyBoYXkgQ09SUyBkZSBwb3IgbWVkaW8gbmkgaGF5IHF1ZSBhYnJpciBuYWRhIGVuIGVsIHNlcnZpZG9yLlxyXG5jb25zdCBBUElfVEFSR0VUID0gcHJvY2Vzcy5lbnYuVklURV9BUElfVEFSR0VUIHx8IGVudi5WSVRFX0FQSV9UQVJHRVQgfHwgJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMSc7XHJcbmNvbnN0IEVTX1JFTU9UTyA9IC9eaHR0cHM/OlxcL1xcLyg/IWxvY2FsaG9zdHwxMjdcXC4pLy50ZXN0KEFQSV9UQVJHRVQpO1xyXG5cclxuY29uc3QgbWFrZUFwaVByb3h5ID0gKCkgPT4gKHtcclxuICB0YXJnZXQ6IEFQSV9UQVJHRVQsXHJcbiAgY2hhbmdlT3JpZ2luOiB0cnVlLFxyXG4gIC8vIENvbnRyYSBzdGFnaW5nIGxhIGRpcmVjY2lvbiB5YSB2aWVuZSBiaWVuICgvdGVzdGVvL2FwaS8uLi4pOyBjb250cmEgZWxcclxuICAvLyBiYWNrZW5kIGxvY2FsIGhheSBxdWUgcXVpdGFybGUgZWwgcHJlZmlqbywgcXVlIGFoaSBubyBleGlzdGUuXHJcbiAgLi4uKEVTX1JFTU9UTyA/IHt9IDogeyByZXdyaXRlOiAocCkgPT4gcC5yZXBsYWNlKC9eXFwvKD86dGVzdGVvMnx0ZXN0ZW98Y3JtKS8sICcnKSB9KSxcclxuICAvLyBMYSBzZXNpb24gdmlhamEgZW4gdW5hIGNvb2tpZSBkZSAzNjBjcm0udGVjaDogc2luIHF1aXRhcmxlIGVsIGRvbWluaW8sIGVsXHJcbiAgLy8gbmF2ZWdhZG9yIGxhIHRpcmEgeSBubyBzZSBwdWVkZSBuaSBlbnRyYXIuXHJcbiAgY29va2llRG9tYWluUmV3cml0ZTogeyAnKic6ICcnIH0sXHJcbn0pO1xyXG5cclxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcclxuICBwbHVnaW5zOiBbXHJcbiAgICByZWFjdCgpLFxyXG4gICAgVml0ZVBXQSh7XHJcbiAgICAgIC8vIHNlbGZEZXN0cm95aW5nPXRydWUgcHVibGljYSB1biBTVyBxdWUgc2UgYXV0b2luc3RhbGEsIHRvbWEgZWwgY29udHJvbCB5XHJcbiAgICAgIC8vIHNlIGRlc2luc3RhbGEgbGltcGlhbmRvIGNhY2hlcy4gUmVzdWVsdmUgZGVmaW5pdGl2YW1lbnRlIGVsIHByb2JsZW1hIGRlXHJcbiAgICAgIC8vIFwiU2luIGNvbmV4aVx1MDBGM25cIiBjYXVzYWRvIHBvciBTV3MgYW50aWd1b3MgcXVlIGNhY2hlYXJvbiBVUkxzIEhUVFAgZGVsXHJcbiAgICAgIC8vIGRvbWluaW8gYW50ZXJpb3IuIEN1YW5kbyB0b2RvcyBsb3MgbmF2ZWdhZG9yZXMgc2UgaGF5YW4gbGltcGlhZG9cclxuICAgICAgLy8gcG9kcmVtb3MgcmVpbnRyb2R1Y2lyIGVsIFBXQSBjb24gY3VpZGFkby5cclxuICAgICAgc2VsZkRlc3Ryb3lpbmc6IHRydWUsXHJcbiAgICAgIHJlZ2lzdGVyVHlwZTogJ2F1dG9VcGRhdGUnLFxyXG4gICAgICBpbmplY3RSZWdpc3RlcjogJ2F1dG8nLFxyXG4gICAgICBiYXNlOiBCQVNFLFxyXG4gICAgICBzY29wZTogQkFTRSxcclxuICAgICAgbWFuaWZlc3Q6IGZhbHNlLFxyXG4gICAgICBpbmNsdWRlQXNzZXRzOiBbJ29mZmxpbmUuaHRtbCcsICdmYXZpY29uLnN2ZycsICdpY29ucy8qLnBuZyddLFxyXG4gICAgICB3b3JrYm94OiB7XHJcbiAgICAgICAgLy8gU2luIGNsaWVudHNDbGFpbS9za2lwV2FpdGluZzogZWwgU1cgbnVldm8gZXNwZXJhIGEgcXVlIGVsIHVzdWFyaW8gcmVjYXJndWUuXHJcbiAgICAgICAgY2xpZW50c0NsYWltOiBmYWxzZSxcclxuICAgICAgICBza2lwV2FpdGluZzogZmFsc2UsXHJcbiAgICAgICAgY2xlYW51cE91dGRhdGVkQ2FjaGVzOiB0cnVlLFxyXG4gICAgICAgIGdsb2JQYXR0ZXJuczogWycqKi8qLntqcyxjc3MsaHRtbCxpY28scG5nLHN2Zyx3b2ZmMn0nXSxcclxuICAgICAgICBuYXZpZ2F0ZUZhbGxiYWNrOiBgJHtCQVNFfW9mZmxpbmUuaHRtbGAsXHJcbiAgICAgICAgbmF2aWdhdGVGYWxsYmFja0RlbnlsaXN0OiBbbmV3IFJlZ0V4cChgXiR7RVNDfWFwaVxcXFwvYCksIG5ldyBSZWdFeHAoYF4ke0VTQ31lbWJlZFxcXFwvYCldLFxyXG4gICAgICAgIHJ1bnRpbWVDYWNoaW5nOiBbXHJcbiAgICAgICAgICAvLyBHb29nbGUgRm9udHM6IGNhY2hlIGxhcmdvXHJcbiAgICAgICAgICB7XHJcbiAgICAgICAgICAgIHVybFBhdHRlcm46IC9eaHR0cHM6XFwvXFwvZm9udHNcXC5nb29nbGVhcGlzXFwuY29tXFwvLiovaSxcclxuICAgICAgICAgICAgaGFuZGxlcjogJ0NhY2hlRmlyc3QnLFxyXG4gICAgICAgICAgICBvcHRpb25zOiB7XHJcbiAgICAgICAgICAgICAgY2FjaGVOYW1lOiAnZ29vZ2xlLWZvbnRzJyxcclxuICAgICAgICAgICAgICBleHBpcmF0aW9uOiB7IG1heEVudHJpZXM6IDEwLCBtYXhBZ2VTZWNvbmRzOiA2MCAqIDYwICogMjQgKiAzNjUgfSxcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgICAvLyBBdXRoL2xvZ2luOiBOVU5DQSBjYWNoZWFyXHJcbiAgICAgICAgICB7XHJcbiAgICAgICAgICAgIHVybFBhdHRlcm46IG5ldyBSZWdFeHAoYCR7RVNDfWFwaVxcXFwvYXV0aChcXFxcL3wkKWApLFxyXG4gICAgICAgICAgICBoYW5kbGVyOiAnTmV0d29ya09ubHknLFxyXG4gICAgICAgICAgfSxcclxuICAgICAgICAgIC8vIEVuZHBvaW50cyBhdXRlbnRpY2Fkb3MgKGxlY3R1cmEpOiBOZXR3b3JrRmlyc3QgY29uIHRpbWVvdXQgY29ydG9cclxuICAgICAgICAgIHtcclxuICAgICAgICAgICAgdXJsUGF0dGVybjogbmV3IFJlZ0V4cChgJHtFU0N9YXBpXFxcXC8obGVhZHN8Y2xpZW50c3xwcm9kdWN0c3x1c2Vyc3xtYXRyaWN1bGFzfGNvbnZlcnNpb25zfHJlcG9ydHN8ZGFzaGJvYXJkfGVtYWlsLXNlcXVlbmNlc3xmb3Jtc3x3ZWJob29rc3xwcm9qZWN0c3xub3RpZmljYXRpb25zfHBheXJvbGx8Y29tbWlzc2lvbnN8YWNjb3VudGluZ3x3ZWJob29rLXRva2Vuc3xmaWVsZC1kZWZpbml0aW9uc3xzdGF0dXN8aWF8Y2xhdWRlfHNlb3xjYW1wYWlnbnN8d29vY29tbWVyY2V8ZG9jdW1lbnRzfHJlcG9ydHMtaWF8YXVkaWVuY2VzKShcXFxcL3wkfFxcXFw/KWAsICdpJyksXHJcbiAgICAgICAgICAgIGhhbmRsZXI6ICdOZXR3b3JrRmlyc3QnLFxyXG4gICAgICAgICAgICBtZXRob2Q6ICdHRVQnLFxyXG4gICAgICAgICAgICBvcHRpb25zOiB7XHJcbiAgICAgICAgICAgICAgY2FjaGVOYW1lOiAnYXBpLWRhdGEnLFxyXG4gICAgICAgICAgICAgIG5ldHdvcmtUaW1lb3V0U2Vjb25kczogNSxcclxuICAgICAgICAgICAgICBleHBpcmF0aW9uOiB7IG1heEVudHJpZXM6IDUwLCBtYXhBZ2VTZWNvbmRzOiA2MCAqIDUgfSxcclxuICAgICAgICAgICAgICBjYWNoZWFibGVSZXNwb25zZTogeyBzdGF0dXNlczogWzAsIDIwMF0gfSxcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgICAvLyBJbWFnZW5lcy9hdmF0YXJlcy9sb2dvcyAoYXNzZXRzIGJpbmFyaW9zIHNlcnZpZG9zIHBvciBBUEkpXHJcbiAgICAgICAgICB7XHJcbiAgICAgICAgICAgIHVybFBhdHRlcm46IG5ldyBSZWdFeHAoYCR7RVNDfWFwaVxcXFwvLipcXFxcLyhsb2dvfGF2YXRhcilgLCAnaScpLFxyXG4gICAgICAgICAgICBoYW5kbGVyOiAnU3RhbGVXaGlsZVJldmFsaWRhdGUnLFxyXG4gICAgICAgICAgICBtZXRob2Q6ICdHRVQnLFxyXG4gICAgICAgICAgICBvcHRpb25zOiB7XHJcbiAgICAgICAgICAgICAgY2FjaGVOYW1lOiAnYXBpLWltYWdlcycsXHJcbiAgICAgICAgICAgICAgZXhwaXJhdGlvbjogeyBtYXhFbnRyaWVzOiAzMCwgbWF4QWdlU2Vjb25kczogNjAgKiA2MCAqIDI0IH0sXHJcbiAgICAgICAgICAgICAgY2FjaGVhYmxlUmVzcG9uc2U6IHsgc3RhdHVzZXM6IFswLCAyMDBdIH0sXHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgICAgLy8gRnVlbnRlcyBHb29nbGUgKGJpbmFyaW9zIGZvbnRzLmdzdGF0aWMuY29tKVxyXG4gICAgICAgICAge1xyXG4gICAgICAgICAgICB1cmxQYXR0ZXJuOiAvXmh0dHBzOlxcL1xcL2ZvbnRzXFwuZ3N0YXRpY1xcLmNvbVxcLy4qL2ksXHJcbiAgICAgICAgICAgIGhhbmRsZXI6ICdDYWNoZUZpcnN0JyxcclxuICAgICAgICAgICAgb3B0aW9uczoge1xyXG4gICAgICAgICAgICAgIGNhY2hlTmFtZTogJ2dvb2dsZS1mb250cy1zdGF0aWMnLFxyXG4gICAgICAgICAgICAgIGV4cGlyYXRpb246IHsgbWF4RW50cmllczogMzAsIG1heEFnZVNlY29uZHM6IDYwICogNjAgKiAyNCAqIDM2NSB9LFxyXG4gICAgICAgICAgICAgIGNhY2hlYWJsZVJlc3BvbnNlOiB7IHN0YXR1c2VzOiBbMCwgMjAwXSB9LFxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgfSxcclxuICAgICAgICAgIC8vIEltYWdlbmVzL2ljb25vcyBzZXJ2aWRvcyBkZXNkZSBlbCBvcmlnZW5cclxuICAgICAgICAgIHtcclxuICAgICAgICAgICAgdXJsUGF0dGVybjogKHsgcmVxdWVzdCwgc2FtZU9yaWdpbiB9KSA9PlxyXG4gICAgICAgICAgICAgIHNhbWVPcmlnaW4gJiYgcmVxdWVzdC5kZXN0aW5hdGlvbiA9PT0gJ2ltYWdlJyxcclxuICAgICAgICAgICAgaGFuZGxlcjogJ1N0YWxlV2hpbGVSZXZhbGlkYXRlJyxcclxuICAgICAgICAgICAgb3B0aW9uczoge1xyXG4gICAgICAgICAgICAgIGNhY2hlTmFtZTogJ3N0YXRpYy1pbWFnZXMnLFxyXG4gICAgICAgICAgICAgIGV4cGlyYXRpb246IHsgbWF4RW50cmllczogNjAsIG1heEFnZVNlY29uZHM6IDYwICogNjAgKiAyNCAqIDMwIH0sXHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgICAgLy8gRXN0YXRpY29zIEpTL0NTUyAocmV2YWxpZGEgZW4gYmFja2dyb3VuZClcclxuICAgICAgICAgIHtcclxuICAgICAgICAgICAgdXJsUGF0dGVybjogKHsgcmVxdWVzdCwgc2FtZU9yaWdpbiB9KSA9PlxyXG4gICAgICAgICAgICAgIHNhbWVPcmlnaW4gJiYgKHJlcXVlc3QuZGVzdGluYXRpb24gPT09ICdzY3JpcHQnIHx8IHJlcXVlc3QuZGVzdGluYXRpb24gPT09ICdzdHlsZScpLFxyXG4gICAgICAgICAgICBoYW5kbGVyOiAnU3RhbGVXaGlsZVJldmFsaWRhdGUnLFxyXG4gICAgICAgICAgICBvcHRpb25zOiB7XHJcbiAgICAgICAgICAgICAgY2FjaGVOYW1lOiAnc3RhdGljLWFzc2V0cycsXHJcbiAgICAgICAgICAgICAgZXhwaXJhdGlvbjogeyBtYXhFbnRyaWVzOiA4MCwgbWF4QWdlU2Vjb25kczogNjAgKiA2MCAqIDI0ICogNyB9LFxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgfSxcclxuICAgICAgICBdLFxyXG4gICAgICB9LFxyXG4gICAgICBkZXZPcHRpb25zOiB7IGVuYWJsZWQ6IGZhbHNlIH0sXHJcbiAgICB9KSxcclxuICBdLFxyXG4gIGJhc2U6IEJBU0UsXHJcbiAgdGVzdDoge1xyXG4gICAgZ2xvYmFsczogdHJ1ZSxcclxuICAgIGVudmlyb25tZW50OiAnanNkb20nLFxyXG4gICAgc2V0dXBGaWxlczogJy4vc3JjL3Rlc3Qvc2V0dXAuanMnLFxyXG4gICAgZXhjbHVkZTogWycqKi9ub2RlX21vZHVsZXMvKionLCAnKiovZGlzdC8qKicsICcqKi9lMmUvKionLCAnKiovcGxheXdyaWdodC1yZXBvcnQvKionLCAnKiovdGVzdC1yZXN1bHRzLyoqJ10sXHJcbiAgfSxcclxuICByZXNvbHZlOiB7XHJcbiAgICBhbGlhczoge1xyXG4gICAgICAnQCc6IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsICcuL3NyYycpLFxyXG4gICAgfSxcclxuICB9LFxyXG4gIGJ1aWxkOiB7XHJcbiAgICByb2xsdXBPcHRpb25zOiB7XHJcbiAgICAgIG91dHB1dDoge1xyXG4gICAgICAgIG1hbnVhbENodW5rczoge1xyXG4gICAgICAgICAgJ3ZlbmRvci1yZWFjdCc6IFsncmVhY3QnLCAncmVhY3QtZG9tJywgJ3JlYWN0LXJvdXRlci1kb20nXSxcclxuICAgICAgICAgICd2ZW5kb3ItcmVjaGFydHMnOiBbJ3JlY2hhcnRzJ10sXHJcbiAgICAgICAgICAndmVuZG9yLXVpJzogWydAcGhvc3Bob3ItaWNvbnMvcmVhY3QnLCAnY2xhc3MtdmFyaWFuY2UtYXV0aG9yaXR5JywgJ2Nsc3gnLCAndGFpbHdpbmQtbWVyZ2UnXSxcclxuICAgICAgICAgICd2ZW5kb3ItZm9ybXMnOiBbJ3JlYWN0LWhvb2stZm9ybScsICdAaG9va2Zvcm0vcmVzb2x2ZXJzJywgJ3pvZCddLFxyXG4gICAgICAgICAgJ3ZlbmRvci11cGxvYWRzJzogWydyZWFjdC1kcm9wem9uZSddLFxyXG4gICAgICAgIH0sXHJcbiAgICAgIH0sXHJcbiAgICB9LFxyXG4gIH0sXHJcbiAgc2VydmVyOiB7XHJcbiAgICBwb3J0OiA1MTczLFxyXG4gICAgcHJveHk6IHtcclxuICAgICAgJy9jcm0vYXBpJzogbWFrZUFwaVByb3h5KCksXHJcbiAgICAgICcvdGVzdGVvL2FwaSc6IG1ha2VBcGlQcm94eSgpLFxyXG4gICAgICAnL3Rlc3RlbzIvYXBpJzogbWFrZUFwaVByb3h5KCksXHJcbiAgICB9LFxyXG4gIH0sXHJcbn0pO1xyXG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQTBZLFNBQVMsY0FBYyxlQUFlO0FBQ2hiLE9BQU8sV0FBVztBQUNsQixPQUFPLFVBQVU7QUFDakIsU0FBUyxlQUFlO0FBSHhCLElBQU0sbUNBQW1DO0FBS3pDLElBQU0sWUFBWSxRQUFRLEtBQUssVUFBVSxDQUFDLFFBQVEsUUFBUSxZQUFZLFFBQVEsSUFBSTtBQUNsRixJQUFNLE9BQU8sYUFBYSxJQUFJLFFBQVEsS0FBSyxZQUFZLENBQUMsSUFBSSxRQUFRLElBQUksWUFBWTtBQUNwRixJQUFNLE1BQU0sUUFBUSxNQUFNLFFBQVEsSUFBSSxHQUFHLEVBQUU7QUFHM0MsSUFBTSxPQUFPLFFBQVEsSUFBSSxrQkFBa0IsSUFBSSxrQkFBa0I7QUFDakUsSUFBTSxNQUFNLEtBQUssUUFBUSxPQUFPLEtBQUs7QUFVckMsSUFBTSxhQUFhLFFBQVEsSUFBSSxtQkFBbUIsSUFBSSxtQkFBbUI7QUFDekUsSUFBTSxZQUFZLGtDQUFrQyxLQUFLLFVBQVU7QUFFbkUsSUFB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
