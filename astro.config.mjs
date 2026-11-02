import { defineConfig } from 'astro/config';

// Site estático publicado em institutofacaamigos.com.br/fatech.
// O site principal repassa tudo que começa com /fatech para este projeto,
// por isso todas as páginas e arquivos vivem dentro de /fatech.
export default defineConfig({
  output: 'static',
  base: '/fatech',
  trailingSlash: 'ignore',
});
