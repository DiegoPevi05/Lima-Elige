import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// Sitio estático. Si lo publicas en una subcarpeta (GitHub Pages), define `base`.
export default defineConfig({
  integrations: [react()],
  vite: { plugins: [tailwindcss()] },
});
