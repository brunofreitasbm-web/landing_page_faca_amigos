# Handoff: continuação da migração do site FaçaAmigos para Astro

Documento autocontido para outra conta/sessão do Claude continuar o trabalho. Não contém credenciais. Estado em 02/11/2026, `origin/main` = `f7c4abf` (PR #91 mergeado).

---

## 1. Quem é o Bruno e como trabalha

- Dono da FaçaAmigos (Belém/PA): Playground Parque Shopping, Playground Bosque Grão-Pará, Circuito de carrinhos, Clínica/Instituto, Hub (site institucional).
- É o **único editor** do site, "com o Claude". Sem CMS.
- Princípio dele: **"Não construo nada direto, construo o plano primeiro."** Plano → revisão passo a passo → execução.
- Preferências de comunicação (obrigatórias): português; direto e conciso; **sem bajulação**; não concordar por padrão; apontar o ponto mais fraco primeiro; se a resposta é "não", dizer na primeira frase; pode fazer perguntas estilo quiz para melhorar a resposta.
- **Nunca** fazer merge, deploy ou qualquer ação externa sem autorização explícita. Autorizado até agora: deploy de `geo-facts` e `wifi-lead-webhook` no Supabase; merge do PR #90 (feito por mim). O #91 foi mergeado por ele.

## 2. Fatos protegidos da marca (nunca violar)

- **Não existe serviço de festa/aniversário.** Só cortesia de aniversário no CRM.
- Telefones: Parque Playground (91) 99234-7673 · Grão-Pará (91) 99110-1215 · Clínica (91) 99178-2027 · Circuito **sem telefone público**. Nunca misturar telefone/banco de Playground/Circuito com Clínica.
- Instagram: @facaamigos.belem.
- Produto gratuito chama-se **"mapeamento"** (não "avaliação" nem "teste") em texto público.
- Horário (decisão do Bruno): seg–sáb 10h–22h, domingo 12h–21h, nos dois Playgrounds **e** no Circuito. Clínica: seg–sex 8h–18h, sábado 8h–12h.
- Localização: Playground Parque no **1º piso**; Circuito **térreo, em frente à C&A**; Grão-Pará **1º piso, em frente à Renner**.
- Circuito: passeio R$ 48 (20 min pelúcias/jipe, 30 min carros/motos), sem meia-entrada.
- Convênios da Clínica ativos: **IASEP e PROASA**.
- E-books: Guia R$ 29,90 (9x R$ 3,33); Código R$ 9,90 pagamento único. Links Hotmart:
  - Guia: https://pay.hotmart.com/M107692257Y?off=ko8af9ku
  - Código: https://pay.hotmart.com/V107698297N?off=fndry1ka
- NPS (fonte MCP FaçaAmigos): 94,9 · 137 respostas · agosto a outubro de 2026 · equipe 4,9 · espaço 4,9. Guardado em `src/data/marca.json`.
- Copy de marketing: nunca escrever "promessa", "confiança", "oferta". Linguagem inclusiva (criança típica/atípica). Nunca expor a criança. Sem promessa de resultado clínico (CFP/COFFITO/CFFa). Sem depoimento de paciente.
- CNPJ: Playground 66.318.630/0001-17 · Instituto 22.161.197/0001-83. Isabella: CRP 10/4727.

## 3. Identificadores

- GitHub: `brunofreitasbm-web/langing_page_faca_amigos` (o outro agente precisa de acesso ao repo).
- Vercel: projeto `facaamigos-site` `prj_JhalalzDbFUY9FkmLQx4musEpUJo`, time `team_p4tNVdG9mLX5HRtqcoztYxHL`, Node 24.x.
- Supabase **PLAY** `ivjvpdzsfjdpyabbzzuj` (site, Playground, Circuito; functions `geo-facts`, `wifi-lead-webhook`, `guia-sequence`, `behavior-test-webhook`, `eventos-public`, `job-application-webhook`…). Projeto da clínica `vththexblpxwocbowhsv`: **NÃO TOCAR**.
- Domínio: institutofacaamigos.com.br. GTM: GTM-NPDJ58XR.
- Artefato de acompanhamento: https://claude.ai/artifact/8NE1BqurmdsEcY62buwNSA (painel de status desatualizado: ainda descreve o #91 como rascunho).
- Conectores úteis: GitHub MCP, Vercel MCP, Supabase MCP, MCP "FaçaAmigos" (faturamento, nps, sessões, caixa), skill `facaamigos-consultor`.

## 4. Arquitetura atual

- **Astro 7.4.4 estático**: `output:'static'`, `build.format:'file'` (gera `/x.html`; Vercel `cleanUrls` serve `/x`), `trailingSlash:'never'`, `compressHTML:false`.
- `vercel.json`: `framework:null`, `buildCommand:"npm run build"`, `outputDirectory:"dist"`. Header de `/assets/*` usa a chave **minúscula** `cache-control` (1 dia + SWR) para sobrepor a regra immutable do preset do Astro. **Não colocar `engines` no package.json** (forçaria Node 26).
- `public/` copiado verbatim para `dist/` (366 arquivos movidos com `git mv`). Contém as páginas legadas ainda não migradas: `index, playground, circuito, clinica, planos, guia, codigo, teste, evento, ingresso, descadastrar, familia, tv*, gestao, admin, wifi, musica, tv-controle`, mais `sitemap.xml` (manual), `sitemap-playground.xml`, `geo-facts.json`, `llms*.txt`, `assets/fa-footer.js`, `fa-track.js`, `fa-cta.js`, `fa-logo.css`.
- `middleware.js` na raiz (Vercel Routing Middleware): host `playground.` → 308; host `gestao.` → rewrite `/`→`/gestao` + robots; `/eventos/<slug>` renderizado no servidor por **substituição de strings exatas** em `evento.html`; `/sitemap-eventos.xml`. **Não migrar `evento` sem alterar o middleware junto.**
- `omniroute` é um gitlink quebrado na raiz; deixar.

### Fonte única de fatos
- `src/data/marca.json` + `src/data/marca.ts`: site, CNPJs, unidades (parque, graopara, circuito, clinica: nome, rota, endereço, WhatsApp, mapa, foto, lat/lng, comoChegar), horário da Clínica, Isabella, NPS. Exports: `SITE, CNPJ, ISABELLA, NPS, unidades, ORDEM, abs(), geoDe(), horarioLinhas/horarioTexto/openingHoursSpec, localTexto, enderecoTexto, fmtFone, waUrl(id,texto?), localBusiness(), faqNo(), trilhaNo()`.
- Horário/preço dos Playgrounds vêm de `public/geo-facts.json`, que vem da função Supabase `geo-facts` (lê o caixa). Corrigir na origem: `supabase/functions/geo-facts/index.ts` (`UNIT_META` com `sundayOpen/sundayClose` e complementos).
- `public/assets/fa-footer.js` ainda guarda telefones/CNPJ para as páginas legadas; `check.mjs` falha se divergir de `marca.json`.

### Padrão de migração (fragmentos de conteúdo)
Texto, JSON-LD e scripts ficam **verbatim** em `src/data/paginas/<slug>.{html,json,N.js}` e `src/data/aprender/<slug>.{html,json}`; a página Astro só "veste" (`PaginaDados.astro`, `aprender/[slug].astro`). Fidelidade provada comparando com o HTML antigo (`git show origin/main~N:public/x.html`).

### Layout e componentes
- `src/layouts/Base.astro`: props `title, ogTitle, ogDescription, siteName, articleAuthor, description, path, ogImage, ogImageAlt, ogType, noindex, jsonLd[] (um @graph), secao, wa, waTexto, semWa, cta`. Emite `fa-track.js` primeiro no head, canonical, robots, OG/Twitter com dimensões, fontes Fredoka/Nunito, `fa-logo.css`, GTM noscript, skip link, Nav, `<main id="conteudo">`, Footer, WhatsAppFloat, `fa-footer.js?v=20261101`.
- Componentes: `Nav` (menu por checkbox, sem JS), `Footer`, `Foto`, `FAQ` (`<details>`), `WhatsAppFloat`, `UnidadePagina`, `PaginaDados`.
- Estilos: `src/styles/global.css` (kit da Clínica: `--yellow #FDC51D, --teal #07C5C8, --pink #D61F4A, --petrol #065264`…), `artigo.css`, `paginas.css` (classes escopadas por página).
- Páginas em `src/pages/`: `quem-somos`, `playground/{grao-para,parque-shopping,como-cuidamos}`, `equipe/isabella-freitas`, `clinica/equipe` (noindex e fora do sitemap até `src/data/equipe.json` ter ≥2 `publicar:true`), `aprender` + `aprender/[slug]` (9 artigos), `glossario`, `termos`, `politica-privacidade`, `404`, `trabalhe-conosco`, `eventos`.

### Verificações (rodar antes de todo PR)
`npm run build` → `npm run check` (valida `dist/`: um h1, canonical, og:url, @id JSON-LD, FAQ visível == JSON-LD, membership no sitemap, links internos, GTM noscript, drift do footer) → `node scripts/geo-build.mjs --check` → `node scripts/sitemap-lastmod.mjs --check` → (`tv3-pool.py --check`, `tv3-qr.py --check` exigem `pip install segno`). Workflows já rodam `npm ci && npm run build` antes do `check`. Workflow `geo-sync` (09:00 UTC) baixa `geo-facts` ao vivo e abre PR.

## 5. O que foi feito

| PR | Conteúdo | Estado |
|---|---|---|
| #90 | Fase 0: horário/endereço na fonte (geo-facts), site, JSON-LD, "Aberto agora", e-mails | mergeado |
| #91 | Astro, componentes, unificação visual, 9 artigos de aprender, glossário, páginas legais, quem-somos, Isabella, como-cuidamos, unidades Parque e Grão-Pará, clinica/equipe, 404, vagas, eventos | mergeado pelo Bruno |

Supabase deployado: `geo-facts` v20 e `wifi-lead-webhook` v33 (versão ao vivo + só texto de horário/endereço; **sem** a regra do #71).

Produção verificada após o merge: `playground.*` → 308; `gestao.*` ok; `/assets` com cache de 1 dia; `/sitemap-eventos.xml` 200 (vazio); `/eventos/inexistente` 404; 24 páginas 200; `/clinica/equipe` noindex e fora do sitemap; deploy `f7c4abf` READY.

## 6. Armadilhas (leia antes de mexer)

1. **Não existe preview da Vercel.** O projeto tem *Ignored Build Step*: branches nunca geram deploy. Merge em `main` vai **direto para produção**. Rollback = Instant Rollback da Vercel. Por isso testamos localmente: `vercel build --yes` (com `.vercel/project.json`) e comparamos o `dist` antigo × novo; rode isso antes de pedir merge de qualquer mudança em `vercel.json`/`middleware.js`.
2. Leitor de `<meta>` ingênuo falha com tags em várias linhas (perdi `description`, `article:author`, `og:site_name` em 9 artigos). Use parser robusto (ver §7).
3. `git stash` desfaz rename staged; use `git add -A` para recuperar.
4. `sitemap-lastmod.mjs` precisa de `--follow --diff-filter=AM` senão arquivos movidos mostram a data de hoje.
5. `Heredoc` em diretório inexistente falha: `mkdir -p` antes.
6. Textos de TV (tv3) vêm de `conteudo/tv3-slides.json`; editar a fonte e regenerar, não o HTML.
7. Status "Clínica atendendo/abre" tem contradição histórica no site; conferir antes de copiar.
8. Horário Inclusivo: menções curtas "das 10h às 16h" sem nota de domingo ainda existem em artigos de aprender e na base do chatbot.

## 7. Método de verificação de fidelidade (por página migrada)

1. Obter HTML antigo: `git show origin/main~N:public/<pagina>.html` (ou `HEAD` antes da mudança).
2. Comparar com `dist/<pagina>.html`: conjunto de palavras do texto visível, links (`href`), `id`s, blocos JSON-LD (parse e comparação), scripts inline, campos de formulário.
3. Comparar **metas** com parser robusto (regex com `re.S`, atributos em qualquer ordem, tags multi-linha): title, description, canonical, robots, og:*, twitter:*, article:*.
4. Screenshots Playwright em 390px e 1280px (Chromium e Playwright estão pré-instalados em `/opt/pw-browsers`; não rodar `playwright install`).
5. Só então `npm run check`. A diferença esperada é só a visual (unificação no kit da Clínica) e a nav/footer.

Regra dos dois commits (combinada no plano): (a) estrutura em Astro com visual idêntico; (b) troca para tokens unificados. Na prática, para as páginas já migradas unificamos junto por decisão do Bruno ("Unificar já na migração").

## 8. Fluxo Git/GitHub neste ambiente

- Branch designada: `ccr-4a853d84-t9gle4`. Após merge, recomeçar de `origin/main`: `git fetch origin main && git checkout -B ccr-4a853d84-t9gle4 origin/main`. A branch remota é apagada no merge, então `git push -u origin ccr-4a853d84-t9gle4` simples funciona.
- PR sempre **rascunho**; seguir template se existir; depois `subscribe_pr_activity`.
- Rodapé de commit: `Co-Authored-By: Claude <noreply@anthropic.com>` + link da sessão da conta nova (ajustar à sessão atual).
- Não usar `gh` para PRs (usar MCP GitHub); `gh api search/...` só para buscas.

## 9. Pendências por dono

### Do Bruno (decisões/ações fora do repo)
- Fazer deploy de `guia-sequence` e `behavior-test-webhook` (já editados no repo com Guia R$ 29,90/9x R$ 3,33 e Código R$ 9,90). **Antes**, conferir os secrets `EBOOK_PRICE_TO` / `EBOOK_INSTALLMENTS`.
- Brevo: template do e-mail do 6º dia e parâmetros `{{ params.PRODUTO_PRECO }}` / `{{ params.PRODUTO_PARCELAS }}`.
- Atualizar horário no Google Meu Negócio, Instagram e anúncios.
- **Decidir preço do Parque**: o caixa ao vivo mostra 50% de desconto (R$ 50/90/160; plano extra 1h30 R$ 130) enquanto Grão-Pará está em 40% (R$ 60/108/192); o site e `geo-facts.json` ainda dizem 40% / "mesmos preços".
- Decidir se faz deploy do `wifi-lead-webhook` com a regra do #71 (cupom de 30 dias; está no repo/site mas não na função ao vivo).
- Decidir copy velha: "em breve no Umarizal", "lista de espera".
- Decidir se para de servir publicamente `NEWVITTA/`, `contexto.md`, `EXPERIMENTOS-TV2.md`, `chatbot-clinica/`.
- Aprovar perfis da equipe (`src/data/equipe.json`, `publicar:true`) com consentimento de imagem.

### Do Claude (próximos passos, **um por vez, só com o "vai" do Bruno**)
Ordem sugerida, da mais simples para a mais acoplada:
1. `guia` e `codigo` (checkout Hotmart; conferir `fa-track.js` CHECKOUTS e preços).
2. `planos`.
3. `circuito`.
4. `clinica`.
5. `playground` (página de marca; ranqueia, cuidado com SEO).
6. `index` (home/hub; revisar título que começa por "Terapia").
7. `teste` (mapeamento; lógica embutida, `behavior-test-webhook`, `teste-perguntas.json`).
8. `evento` + middleware juntos.
9. Fase 4: gerar o sitemap a partir das páginas, remover `fa-footer.js` quando nenhuma página legada o usar, aposentar `sitemap-playground.xml`.
10. Vagas com schema `JobPosting` (`src/content/vagas/` com `validThrough`).
11. `/parcerias`: só depois que houver oferta de dia útil (nunca festa/aniversário).
12. Fase 5 opcional: landings de campanha `/lp/<campanha>` (noindex, sem menu).

Ficam fora da migração (em `public/` como estão): `tv*`, `gestao`, `admin`, `wifi`, `musica`, `familia`, `ingresso`, `descadastrar`.

## 10. Como começar na outra conta

1. Dar acesso ao repo, ao Vercel e ao Supabase (MCPs) e instalar a skill `facaamigos-consultor`.
2. `git fetch origin main && git checkout -B <sua-branch> origin/main && npm ci && npm run build && npm run check`.
3. Ler `MAPA-DO-SITE.md` (seção 0 documenta a arquitetura e onde editar cada fato) e `docs/CODEBASE_MAP.md`.
4. Perguntar ao Bruno qual página migrar primeiro, propor o plano dela, esperar o "vai", migrar com o método do §7, abrir PR rascunho e **parar**; o merge é dele.
