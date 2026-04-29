// @ts-check
import { defineConfig, fontProviders } from 'astro/config';

// https://astro.build/config
export default defineConfig({
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
