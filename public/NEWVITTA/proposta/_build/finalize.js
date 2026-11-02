const fs = require("fs");
const { PDFDocument, PDFName, PDFDict, rgb } = require("pdf-lib");

const [basePdf, rectsJson, outPdf, expectedPages, anexo, title] = process.argv.slice(2);

(async () => {
  const pdf = await PDFDocument.load(fs.readFileSync(basePdf));
  const pages = pdf.getPages();
  if (expectedPages && pages.length !== Number(expectedPages)) {
    throw new Error(`esperava ${expectedPages} paginas, o Chrome gerou ${pages.length}`);
  }

  const rects = JSON.parse(fs.readFileSync(rectsJson, "utf8"));
  const form = pdf.getForm();
  const PX = 0.75;
  for (const r of rects) {
    const page = pages[r.page];
    const { height } = page.getSize();
    form.createCheckBox(r.f).addToPage(page, {
      x: r.x * PX,
      y: height - (r.y + r.h) * PX,
      width: r.w * PX,
      height: r.h * PX,
      borderWidth: 0,
      textColor: rgb(0.93, 0.11, 0.18),
    });
  }
  if (anexo && anexo !== "-") {
    await pdf.attach(fs.readFileSync(anexo), "amostra-tv-newvita.html", {
      mimeType: "text/html",
      description: "Amostra ao vivo da TV da recepção (abra no navegador)",
      creationDate: new Date(),
      modificationDate: new Date(),
    });
  }
  pdf.setTitle(title || "Proposta New Vita | Mais pacientes agendados");
  pdf.setLanguage("pt-BR");
  fs.writeFileSync(outPdf, await pdf.save());

  const check = await PDFDocument.load(fs.readFileSync(outPdf));
  const uris = new Set();
  let links = 0;
  check.getPages().forEach((page) => {
    const annots = page.node.Annots();
    if (!annots) return;
    for (let i = 0; i < annots.size(); i++) {
      const a = check.context.lookup(annots.get(i), PDFDict);
      if (a.get(PDFName.of("Subtype"))?.toString() !== "/Link") continue;
      links++;
      const act = a.get(PDFName.of("A"));
      const uri = act && check.context.lookup(act, PDFDict).get(PDFName.of("URI"));
      if (uri) uris.add(uri.toString());
    }
  });
  const embedded = Buffer.from(fs.readFileSync(outPdf)).includes("/EmbeddedFile");
  console.log(`paginas: ${check.getPageCount()}  campos: ${check.getForm().getFields().length}  links: ${links}  anexo embutido: ${embedded}`);
  console.log([...uris].join("\n"));
})();
