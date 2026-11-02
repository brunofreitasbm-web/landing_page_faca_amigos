import { defineConfig } from 'astro/config';

// Site estático. As páginas ainda não migradas ficam em public/ e são copiadas como estão.
// build.format 'file' gera /x.html (a Vercel serve como /x com cleanUrls), igual ao site de antes.
export default defineConfig({
  site: 'https://institutofacaamigos.com.br',
  output: 'static',
  trailingSlash: 'never',
  build: { format: 'file' },
  compressHTML: false,
  devToolbar: { enabled: false },
});
