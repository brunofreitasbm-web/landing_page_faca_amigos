// Checagem antes de publicar: barra palavras que não usamos no material de venda.
// Uso: npm run check
import fs from 'node:fs';
import path from 'node:path';

const PROIBIDAS = ['promessa', 'prometemos', 'confiança', 'confiavel', 'confiável', 'garantia', 'garantido', 'garantimos', 'oferta'];
const PASTAS = ['src', 'docs', 'public'];
const EXTENSOES = new Set(['.astro', '.json', '.md', '.html', '.js', '.ts', '.tsx', '.jsx', '.css', '.svg']);

const achados = [];
function varrer(dir) {
  if (!fs.existsSync(dir)) return;
  for (const nome of fs.readdirSync(dir)) {
    const arq = path.join(dir, nome);
    if (fs.statSync(arq).isDirectory()) { varrer(arq); continue; }
    if (!EXTENSOES.has(path.extname(nome))) continue;
    fs.readFileSync(arq, 'utf8').split('\n').forEach((linha, i) => {
      const minus = linha.toLowerCase();
      for (const p of PROIBIDAS) if (new RegExp(`\\b${p}`, 'u').test(minus)) achados.push(`${arq}:${i + 1}  "${p}"`);
    });
  }
}
PASTAS.forEach(varrer);

if (achados.length) {
  console.error('✗ Palavras que não usamos no material:\n  ' + achados.join('\n  '));
  process.exit(1);
}
console.log('✓ Nenhuma palavra proibida encontrada.');
