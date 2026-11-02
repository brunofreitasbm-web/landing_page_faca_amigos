import { defineConfig } from 'astro/config';

// Site estático. O endereço final entra em src/data/marca.json (campo siteUrl).
export default defineConfig({
  output: 'static',
  trailingSlash: 'ignore',
});
