const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..", "..");
const source = path.join(root, "new.html");
const out = process.argv[2] || path.join(root, "proposta", "anexo", "amostra-tv-newvita.html");

(async () => {
  let html = fs.readFileSync(source, "utf8");

  html = html.replace(/src="img\/([^"]+)"/g, (_, file) => {
    const b64 = fs.readFileSync(path.join(root, "img", file)).toString("base64");
    return `src="data:image/jpeg;base64,${b64}"`;
  });

  html = await replaceQr(html);

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  const external = (html.match(/src="(?!data:)[^"]+"/g) || []).length;
  console.log(`anexo: ${out} (${Math.round(html.length / 1024)} KB, ${external} src externos)`);
})();

async function replaceQr(html) {
  const m = html.match(/src="(https:\/\/api\.qrserver\.com[^"]+)"/);
  if (!m) return html;
  try {
    const res = await fetch(m[1].replace(/&amp;/g, "&"));
    if (!res.ok) throw new Error(res.status);
    const b64 = Buffer.from(await res.arrayBuffer()).toString("base64");
    return html.replace(m[0], `src="data:image/png;base64,${b64}"`);
  } catch (e) {
    console.warn("QR não embutido, mantendo o endereço remoto:", e.message);
    return html;
  }
}
