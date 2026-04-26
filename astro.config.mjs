// @ts-check
import { defineConfig, fontProviders } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  vite: {
    ssr: {
      // firebase-admin is server-only — tell Vite not to bundle it for the browser
      external: ["firebase-admin", "firebase-admin/app", "firebase-admin/firestore"],
    },
  },
  fonts: [
    {
      name: "Space Mono",
      cssVariable: "--font-space-mono",
      provider: fontProviders.fontsource(),
      weights: [400, 700],
      styles: ["normal", "italic"],
    },
  ],
});
