// Gera os PDFs das artes para a gráfica, no tamanho exato (com sangria), em impressos-pdf/.
// Uso: npm run impressos   (faz o build antes)
import { execSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const raiz = path.resolve('dist');
const saida = path.resolve('impressos-pdf');
const pecas = ['rollup', 'mesa', 'cartao'];
const tipos = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };

execSync('npx astro build', { stdio: 'inherit' });
fs.mkdirSync(saida, { recursive: true });

const servidor = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let arq = path.join(raiz, p);
  if (!arq.startsWith(raiz)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(arq) && fs.statSync(arq).isDirectory()) arq = path.join(arq, 'index.html');
  if (!fs.existsSync(arq)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': tipos[path.extname(arq)] || 'application/octet-stream' });
  fs.createReadStream(arq).pipe(res);
});
await new Promise((r) => servidor.listen(0, r));
const base = `http://localhost:${servidor.address().port}`;

const navegador = await chromium.launch();
const pagina = await navegador.newPage();
for (const peca of pecas) {
  await pagina.goto(`${base}/impressos/${peca}`, { waitUntil: 'networkidle' });
  await pagina.evaluate(() => document.fonts.ready);
  await pagina.emulateMedia({ media: 'print' });
  // Trava de segurança: nenhuma peça pode ter conteúdo cortado ou passando do tamanho.
  // (o carimbo PROVISÓRIO é inclinado e passa da borda de propósito, então sai da medição)
  const estouros = await pagina.evaluate(() => {
    const prov = document.body.classList.contains('provisorio');
    document.body.classList.remove('provisorio');
    const n = [...document.querySelectorAll('.folha')].filter((f) => f.scrollHeight > f.clientHeight + 1 || f.scrollWidth > f.clientWidth + 1).length;
    if (prov) document.body.classList.add('provisorio');
    return n;
  });
  if (estouros) { console.error(`✗ ${peca}: o conteúdo não cabe na peça (${estouros} página(s)). Ajuste o texto ou os tamanhos.`); process.exitCode = 1; }
  const destino = path.join(saida, `${peca}.pdf`);
  await pagina.pdf({ path: destino, preferCSSPageSize: true, printBackground: true });
  if (process.argv.includes('--previa')) {
    await pagina.emulateMedia({ media: 'screen' });
    await pagina.screenshot({ path: path.join(saida, `${peca}-previa.png`), fullPage: true });
  }
  console.log('✓', path.relative(process.cwd(), destino));
}
await navegador.close();
servidor.close();

const provisorio = JSON.parse(fs.readFileSync('src/data/marca.json', 'utf8'));
if (!provisorio.urlDefinitiva || !provisorio.contato.whatsappDefinitivo) {
  console.log('\n⚠ Os PDFs saíram com a marca PROVISÓRIO: endereço do QR e/ou WhatsApp ainda não são definitivos (src/data/marca.json).');
}
