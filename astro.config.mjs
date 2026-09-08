// @ts-check
import { defineConfig, fontProviders } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://vscn.ch',
  server: {
    host: '127.0.0.1',
  },
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'de'],
    routing: {
      prefixDefaultLocale: false,
    },
  },
  image: {
    remotePatterns: [
      { protocol: 'https', hostname: 'firebasestorage.googleapis.com' },
      { protocol: 'https', hostname: 'storage.googleapis.com' },
    ],
  },
  integrations: [
    sitemap({
      filter: (page) =>
        !page.includes('/proto') &&
        !page.includes('/profile') &&
        !page.includes('/verify-email') &&
        !page.includes('/auth/') &&
        !page.includes('/signup') &&
        !page.includes('/admin'),
    }),
  ],
  fonts: [
    {
      name: "Space Mono",
      cssVariable: "--font-space-mono",
      provider: fontProviders.fontsource(),
      weights: [400, 700],
      styles: ["normal", "italic"],
    },
  ],
  vite: {
    optimizeDeps: {
      // Every one of these is reached from an Astro inline <script> — a few by
      // `await import()`, the rest by a plain `from "…"` inside the script tag.
      // Vite's cold-start scanner walks neither, so it used to meet them one
      // page request at a time: each discovery triggers a re-optimize, each
      // re-optimize bumps the browserHash, and the URLs handed out by the
      // round before go stale. That churn is what produces a page full of
      // `504 Outdated Optimize Dep` on gsap and photoswipe — and if the deps
      // cache is ever rebuilt underneath a running server, the stale hashes
      // are all that server has left and no reload can recover it.
      // Naming them here pre-bundles the lot at boot, so there is no discovery
      // round to go wrong. Add to this list whenever a script imports a new
      // bare package.
      include: [
        'gsap',
        'gsap/ScrollTrigger',
        'photoswipe',
        'photoswipe/lightbox',
        'embla-carousel',
        'firebase/app',
        'firebase/auth',
        'firebase/firestore',
        'firebase/storage',
        'firebase/functions',
        'firebase/app-check',
      ],
    },
  },
});
