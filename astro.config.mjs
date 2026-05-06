// @ts-check
import { defineConfig, fontProviders } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://vscn.ch',
  integrations: [
    sitemap({
      filter: (page) =>
        !page.includes('/profile') &&
        !page.includes('/verify-email') &&
        !page.includes('/auth/') &&
        !page.includes('/signup'),
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
});
