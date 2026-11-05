# Landing do plano "Ritmo" (campanha dormente)

Estado: **dormente**. O arquivo `src/content/campanhas/_ritmo.json` começa com `_`, então o build o ignora. Nenhuma rota `/lp/ritmo` existe até alguém ativar. Fonte da copy: `clinica_facaamigos/docs/marketing/pacote-6-sessoes/estrategia.md` (seção 0, banco de copy, apêndice).

## 1. Como ativar

1. Revise os pontos da seção 6 (pendências) e decida o que ainda bloqueia.
2. Renomeie `src/content/campanhas/_ritmo.json` para `ritmo.json`.
3. Ajuste `encerraEm` (hoje `2027-02-28`, valor do rascunho da estratégia).
4. `npm run build && npm run check`. O build falha se algum texto violar as travas (seção 5).
5. Publique e teste `https://institutofacaamigos.com.br/lp/ritmo?utm_source=instagram&utm_medium=bio&utm_campaign=ritmo-6`: clique no botão do topo e na barra fixa (celular) e confira a mensagem aberta no WhatsApp.
6. Link na bio e nos stories: `/lp/ritmo?utm_source=instagram&utm_medium=<bio|story|reel|post>&utm_campaign=ritmo-6`.

Para desativar: renomeie de volta para `_ritmo.json` (ou deixe `encerraEm` passar).

## 2. Como trocar o nome

O nome mora em **um ponto**: o campo `"nome": "Ritmo"` no topo do JSON. Todo `{nome}` nos textos (rótulo, subtítulo, descrição, comparação, passos, mensagem do WhatsApp) é trocado por ele antes da validação, então as travas valem para o nome novo também (um nome como "Oferta" reprova o build).

O que o nome NÃO muda sozinho:
- a URL: vem do nome do arquivo (`ritmo.json` vira `/lp/ritmo`). Se renomear o plano, renomeie o arquivo e atualize o link da bio;
- `utm_campaign=ritmo-6` e o evento GA4 `lp_ritmo` (derivado do nome do arquivo);
- o arquivo `public/img/ritmo-mes.svg` (só o nome do arquivo; a ilustração não tem texto);
- textos da estratégia e do bot da clínica, que são de outro repositório.

## 3. Como pré-visualizar sem ativar

```
node scripts/preview-campanha.mjs ritmo            # build de preview + screenshots
node scripts/preview-campanha.mjs ritmo --check    # idem, rodando scripts/check.mjs no build de preview
node scripts/preview-campanha.mjs ritmo --sem-shots --check
node scripts/preview-campanha.mjs ritmo --sem-build   # só refaz os screenshots
```

Como funciona: o script roda `astro build --outDir node_modules/.cache/preview-ritmo` com `INCLUDE_DORMANT_CAMPAIGNS=ritmo`. A variável faz `src/content.config.ts` incluir `_ritmo.json` e usar o id `ritmo`. O arquivo real não é tocado, `dist/` não é tocado, e a pasta de preview está em `node_modules` (ignorada pelo git e nunca publicada). Depois sobe um servidor local e gera, com Playwright, em `docs/ritmo-preview/`: `mobile-dobra`, `mobile-pagina`, `mobile-barra-fixa`, `mobile-primeira-visita` (390x844) e `desktop-dobra`, `desktop-pagina` (1280x800), todos com deviceScaleFactor 2. Imprime também o tamanho do botão, a presença da barra fixa e a mensagem do WhatsApp com a etiqueta de origem.

Atenção: o `package.json` instala `@playwright/test` 1.64, cujo navegador não está neste ambiente. O script usa primeiro o `playwright` global (`npm root -g`), que corresponde ao navegador instalado, e só então o do projeto. `docs/` está no `.vercelignore`, então os screenshots não vão ao ar.

## 4. Mudanças no template (todas retrocompatíveis, nenhuma campanha ativa existe hoje)

| # | Arquivo | Mudança |
|---|---|---|
| 1 | `src/content.config.ts` | Loader: com `INCLUDE_DORMANT_CAMPAIGNS=<nome>`, inclui `_<nome>.json` e gera id sem o `_`. Sem a variável o loader é o mesmo de antes. |
| 2 | `src/content.config.ts` | Campos opcionais: `nome`, `rotulo`, `destaques`, `comparacao`, `passos`, `faqTitulo`, `fim`, `cta.origemNaMensagem`, `cta.microtexto`, `regrasSaude`. O schema agora é `z.preprocess(substitui {nome}, objeto.superRefine(...))`. Campanhas sem esses campos validam como antes. |
| 3 | `src/content.config.ts` | `regrasSaude: true` liga uma trava extra no build (preço, desconto, "pacote", "garantia", pagamento específico, "cura", superlativos, depoimento, escassez, travessão). Padrão `false`. |
| 4 | `src/pages/lp/[slug].astro` | Blocos novos, só renderizados se o campo existir: rótulo, chips, microtexto, "comparação", "como funciona" (`id="como-funciona"`), título do FAQ, bloco final com foto opcional. Script inline de etiqueta de origem (só com `origemNaMensagem`). |
| 5 | `src/pages/lp/[slug].astro` | **Correção de bug**: a barra fixa do celular recebia `href: 'whatsapp'`, mas o `fa-cta.js` lê o link do `.wa-float`, que não existe nessas páginas (`semWa`). Pelo código, a barra nunca aparecia em campanhas de WhatsApp (não rodei a versão antiga para ver). Agora recebe o link `wa.me` direto. Efeito: toda campanha de WhatsApp passa a ter a barra. |
| 6 | `src/pages/lp/[slug].astro` | **Correção de CSS**: `.lp-img img` não alcançava o `<img>` (renderizado pelo componente `Foto`); virou `:global`. Os cantos arredondados da imagem do hero passam a valer. |
| 7 | `src/components/LpTopo.astro` | **Correção de CSS**: `.lp-topo img { height: 40px }` também não alcançava o logo; ele saía no tamanho natural (enorme no desktop). Virou `:global`. Vale para todas as landings de campanha. |
| 8 | `src/content/campanhas/_LEIA-ME.md` | Documenta os campos novos e **corrige** a frase de que o `fa-track.js` repassa a origem ao WhatsApp (não repassa, ver seção 7). |

Arquivos novos: `src/content/campanhas/_ritmo.json`, `public/img/ritmo-mes.svg` (ilustração vetorial abstrata, sem pessoas; é o único arquivo novo em `public/` e fica servido mesmo com a campanha dormente, sem link para ele), `scripts/preview-campanha.mjs`, esta documentação e `docs/ritmo-preview/`.

Prova de que o site não muda sem campanha ativa: `npm run build` sem a variável, comparado com um build do estado anterior (via `git stash`): o HTML das 67 páginas é idêntico depois de normalizar os nomes dos CSS com hash. Diferenças restantes, todas inertes: o CSS compartilhado `Base.*.css` muda uma regra (`.lp-topo ... img`, item 7, só afeta landings de campanha), aparece um `_slug_.*.css` que nenhuma página referencia, e `img/ritmo-mes.svg` é copiado para `dist`.

## 5. Checklist de conformidade da página

Verificado no JSON e no HTML gerado (ver relatório de build). `[build]` = o build reprova se violar.

- [x] Sem preço, valor em reais, percentual, desconto, promoção, cupom, gratuidade, parcelamento. `[build, regrasSaude]`
- [x] Sem as palavras da marca: festa, aniversário, promessa, confiança, oferta. `[build, schema original]`
- [x] Sem "pacote" (usa "plano") e sem "garantia/garantimos". `[build, regrasSaude]`
- [x] Sem forma de pagamento específica (nada de Pix, boleto, cartão); só "conversamos sobre a forma de pagamento no WhatsApp". `[build, regrasSaude]`
- [x] Sem "melhor clínica", "referência em", "cura", promessa de resultado ou de prazo. `[build, regrasSaude]`
- [x] Sem depoimento. `[build, regrasSaude]`
- [x] Sem urgência ou vagas limitadas: a estratégia só permite com número real conferido no dia, e a página não traz número. `[build, regrasSaude]`
- [x] Sem diagnóstico e sem orientação clínica: o plano sai da avaliação; a página diz que a frequência é indicada pela equipe e que "6" não é para todos.
- [x] Sem criança: hero é ilustração vetorial abstrata; a única foto é a fachada da clínica (`img/clinica-fachada.webp`, já existente no repositório, sem pessoas).
- [x] Sem crítica a outro serviço, convênio ou profissional; sem citar IASEP ou PROASA.
- [x] Sem exclamação e sem travessão na copy (a mensagem do WhatsApp tem "Oi!", como no exemplo pedido).
- [x] `noindex`, sem menu, rodapé com CNPJ, endereço e privacidade (template existente).
- [x] JSON-LD só `FAQPage` com as mesmas perguntas visíveis (o `check.mjs` compara texto visível e JSON-LD); sem preço no schema.
- [x] Nome do plano vem de um único campo (`nome`).
- [x] Botão do topo 56 px de altura, largura total no celular; barra fixa do celular com botão de 46 px (padrão do `fa-cta.js`).
- [ ] Ainda não verificado por pessoa: revisão por profissional com inscrição (CFFa, CFP, COFFITO), conferência do texto do rodapé e das regras de operação (seção 6).

Afirmações da página e a base de cada uma: 6 sessões por mês, especialidades combináveis, avaliação conta como 1 sessão, Treino ABA conta 3 (todas `[FATO]` na estratégia, seção 4 e `chatbot-base-conhecimento.md`); distribuição pelo plano terapêutico (`planos.html`); Portal da Família (existe, `/familia`).

Deixado de fora de propósito (`[CONFIRMAR]` ou `[W]` na estratégia): horário fixo semanal, agenda única entre especialidades, reunião de equipe e devolutiva, regra de falta e reposição, "sem fidelidade" e cancelamento, valores, degrau para o plano de 8 sessões, vagas do ciclo, Pix/boleto.

## 6. Pendências

- **Consulta de marca no INPI** para "Ritmo" e checagem de plano ou clínica homônimos em Belém (estratégia, D1). Não feita.
- **Revisão dos conselhos** (CFFa, CFP/CRP-PA, COFFITO/CREFITO): enviar por escrito as perguntas da seção 10 da estratégia e guardar a resposta. A página assume a regra mais dura (sem preço, sem "pacote", sem foco em vantagem financeira). Revisão final por profissional com inscrição e pelo advogado.
- **A frase "esta página não mostra valores"** (FAQ) e a linha "forma de pagamento" no topo são decisão de copy: se o CRP/CFFa entenderem que mencionar pagamento já é foco financeiro, remova o `microtexto` e a pergunta "Quanto custa e como pago?".
- **Regras de operação** a confirmar antes de ampliar a copy: horário fixo, agenda única, falta e reposição, cancelamento, ciclo. Com as regras aprovadas, acrescentar ao `faq` (ex.: "E se eu faltar?").
- **Vagas reais**: só publicar número de vagas conferido no dia (gancho 12). Não há campo para isso hoje; se for usar, adicionar em `destaques` e remover quando acabar.
- **Gateway** (D9 e seguintes): nada sobre Pix/boleto até a integração existir; depois, revisar a trava `regrasSaude` (ela reprova esses termos).
- **SEO não se aplica**: a página é `noindex` e fora do sitemap; `descricao` serve só a pré-visualização de compartilhamento (e não passa de 160 caracteres).
- **Bot e cadastro**: ensinar o atendimento a ler a etiqueta `(ref: ...)` (seção 7). Repositório da clínica, não alterado.
- **`fa-cta.js` (compartilhado)**: a barra fixa usa `#F0196B` com texto branco (cerca de 4,2:1, abaixo de AA para texto normal) e altura de 46 px. O botão do topo usa o rosa do site (`#D61F4A`, acima de 5:1). Não alterei o script compartilhado.
- **`encerraEm`** do JSON é o do rascunho da estratégia; ajustar ao calendário real (D10).
- `MAPA-DO-SITE.md` (seção 0) ainda diz "falta a primeira campanha real" e não cita os campos novos; atualizar na ativação.

## 7. UTMs e a mensagem do WhatsApp

Entrada: `/lp/ritmo?utm_source=instagram&utm_medium=<bio|story|reel|post>&utm_campaign=ritmo-6`.

O que o `public/assets/fa-track.js` faz de fato (lido no arquivo):
- grava a primeira e a última origem (utm_*, gclid, fbclid...) em cookie do domínio raiz e no localStorage;
- `window.faOrigin()` devolve essa origem, mas só formulários e o checkout da Hotmart a usam;
- ao clicar num link `wa.me`, dispara `whatsapp_click` (GA4/GTM) com unidade, página e seção. A sessão do GA4 leva a UTM, então no GA4 o clique é atribuível;
- **não altera o link nem a mensagem do WhatsApp**.

**Lacuna:** a UTM não chega à conversa, ao rascunho de cadastro nem ao paciente no sistema da clínica. A frase em `_LEIA-ME.md` que dizia o contrário estava errada e foi corrigida.

Mitigação implementada: a mensagem pré-preenchida identifica a origem ("Oi! Vim pelo Instagram e quero entender o plano Ritmo.") e, com `cta.origemNaMensagem: true`, um script inline acrescenta `(ref: instagram-reel-ritmo-6)` quando a URL traz `utm_source`. Roda no carregamento e no clique (a barra fixa é criada depois). Só aceita `[a-z0-9_-]`, 24 caracteres por parte, sem dado pessoal. Testado no preview: o botão do topo e a barra fixa abrem `https://wa.me/5591991782027?text=Oi! Vim pelo Instagram e quero entender o plano Ritmo. (ref: instagram-reel-ritmo-6)`.

Limites: sem UTM na URL (link sem parâmetros) a mensagem sai sem `ref`; o `ref` pode ser apagado ou editado pelo usuário antes de enviar; o atendimento (bot ou recepção) precisa ler o `ref` e gravar no cadastro, o que depende do repositório da clínica. Fallback da estratégia: perguntar "como nos conheceu?" na primeira resposta do bot.
