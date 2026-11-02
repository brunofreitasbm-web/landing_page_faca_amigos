import fs from 'node:fs';
import path from 'node:path';

// Lê um ícone do pacote lucide-static e devolve o SVG pronto para inline.
export function icone(nome, { tamanho = 24, traco = 1.5 } = {}) {
  const arquivo = path.resolve('node_modules/lucide-static/icons', `${nome}.svg`);
  return fs
    .readFileSync(arquivo, 'utf8')
    .replace(/<!--.*?-->\s*/s, '')
    .replace(/width="24"/, `width="${tamanho}"`)
    .replace(/height="24"/, `height="${tamanho}"`)
    .replace(/stroke-width="2"/, `stroke-width="${traco}"`);
}
