import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { VitePWA } from 'vite-plugin-pwa';
import { comprobarEntornoDeProduccion } from './scripts/entornoDeProduccion.js';

const modeIndex = process.argv.findIndex((arg) => arg === '--mode' || arg === '-m');
const mode = modeIndex >= 0 ? process.argv[modeIndex + 1] : process.env.NODE_ENV || 'development';
const env = loadEnv(mode, process.cwd(), '');

// Base path por entorno: VITE_BASE_PATH=/crm/ (prod) o /testeo/ (staging)
const BASE = process.env.VITE_BASE_PATH || env.VITE_BASE_PATH || '/crm/';
const ESC = BASE.replace(/\//g, '\\/');

// A que backend habla el `npm run dev`.
//
// Por defecto, el de tu maquina. Con VITE_API_TARGET se apunta a staging y
// entonces NO hace falta levantar backend ni base de datos — util para quien
// trabaja solo el diseño.
//
// Va por el proxy de Vite a proposito: el navegador solo habla con localhost,
// asi que no hay CORS de por medio ni hay que abrir nada en el servidor.
const API_TARGET = process.env.VITE_API_TARGET || env.VITE_API_TARGET || 'http://localhost:3001';
const ES_REMOTO = /^https?:\/\/(?!localhost|127\.)/.test(API_TARGET);

const makeApiProxy = () => ({
  target: API_TARGET,
  changeOrigin: true,
  // Contra staging la direccion ya viene bien (/testeo/api/...); contra el
  // backend local hay que quitarle el prefijo, que ahi no existe.
  ...(ES_REMOTO ? {} : { rewrite: (p) => p.replace(/^\/(?:testeo2|testeo|crm)/, '') }),
  // La sesion viaja en una cookie de 360crm.tech: sin quitarle el dominio, el
  // navegador la tira y no se puede ni entrar.
  cookieDomainRewrite: { '*': '' },
});

// Diego, 22/10/2026: un build de producción sin `.env.production` (los worktrees
// no lo traen) salió con VITE_BETA_MODE apagado y, en ISEIE, sin el ranking de
// gestoras, sin avisar. Ahora se para. Ver scripts/entornoDeProduccion.js.
export default defineConfig(({ command, mode: modoVite }) => {
  comprobarEntornoDeProduccion({ command, mode: modoVite, cwd: __dirname });
  return CONFIG;
});

const CONFIG = {
  plugins: [
    react(),
    VitePWA({
      // selfDestroying=true publica un SW que se autoinstala, toma el control y
      // se desinstala limpiando caches. Resuelve definitivamente el problema de
      // "Sin conexión" causado por SWs antiguos que cachearon URLs HTTP del
      // dominio anterior. Cuando todos los navegadores se hayan limpiado
      // podremos reintroducir el PWA con cuidado.
      selfDestroying: true,
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      base: BASE,
      scope: BASE,
      manifest: false,
      includeAssets: ['offline.html', 'favicon.svg', 'icons/*.png'],
      workbox: {
        // Sin clientsClaim/skipWaiting: el SW nuevo espera a que el usuario recargue.
        clientsClaim: false,
        skipWaiting: false,
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: `${BASE}offline.html`,
        navigateFallbackDenylist: [new RegExp(`^${ESC}api\\/`), new RegExp(`^${ESC}embed\\/`)],
        runtimeCaching: [
          // Google Fonts: cache largo
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          // Auth/login: NUNCA cachear
          {
            urlPattern: new RegExp(`${ESC}api\\/auth(\\/|$)`),
            handler: 'NetworkOnly',
          },
          // Endpoints autenticados (lectura): NetworkFirst con timeout corto
          {
            urlPattern: new RegExp(`${ESC}api\\/(leads|clients|products|users|matriculas|conversions|reports|dashboard|email-sequences|forms|webhooks|projects|notifications|payroll|commissions|accounting|webhook-tokens|field-definitions|status|ia|claude|seo|campaigns|woocommerce|documents|reports-ia|audiences)(\\/|$|\\?)`, 'i'),
            handler: 'NetworkFirst',
            method: 'GET',
            options: {
              cacheName: 'api-data',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 5 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Imagenes/avatares/logos (assets binarios servidos por API)
          {
            urlPattern: new RegExp(`${ESC}api\\/.*\\/(logo|avatar)`, 'i'),
            handler: 'StaleWhileRevalidate',
            method: 'GET',
            options: {
              cacheName: 'api-images',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Fuentes Google (binarios fonts.gstatic.com)
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-static',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Imagenes/iconos servidos desde el origen
          {
            urlPattern: ({ request, sameOrigin }) =>
              sameOrigin && request.destination === 'image',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'static-images',
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          // Estaticos JS/CSS (revalida en background)
          {
            urlPattern: ({ request, sameOrigin }) =>
              sameOrigin && (request.destination === 'script' || request.destination === 'style'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'static-assets',
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  base: BASE,
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**', '**/playwright-report/**', '**/test-results/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-recharts': ['recharts'],
          'vendor-ui': ['@phosphor-icons/react', 'class-variance-authority', 'clsx', 'tailwind-merge'],
          'vendor-forms': ['react-hook-form', '@hookform/resolvers', 'zod'],
          'vendor-uploads': ['react-dropzone'],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/crm/api': makeApiProxy(),
      '/testeo/api': makeApiProxy(),
      '/testeo2/api': makeApiProxy(),
    },
  },
};
