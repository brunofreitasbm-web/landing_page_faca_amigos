# Auditoria de SEO local e visibilidade em IA

> Feita em 2026-10-06, a partir do código do repositório (branch `main`). **Não** foi conferido o site no ar,
> o Google Business Profile, o Search Console nem avaliações. O que depende disso está marcado como _verificar_.
> Documento interno (`docs/` não vai ao ar).
> **Atualização de 2026-11-25:** a Clínica abriu em novembro de 2026 e o Google Business Profile dela está verificado. Onde este documento diz que a Clínica "ainda não abriu", vale o que está em `.claude/product-marketing.md` e em `docs/gbp-clinica.md`.

## Resumo em uma frase

O código já está acima da média para negócio local (schema com `@graph`, `geo`, horário, ofertas, FAQ,
`llms.txt`, `geo-facts.json`, robots liberando bots de IA, canonical por host). **O gargalo agora não é o site:
é o que existe fora dele** (Google Business Profile, avaliações, citações) e alguns fatos que se contradizem,
o que derruba a confiança de buscador e de IA.

---

## 1. Problemas encontrados no código (corrigir primeiro)

> **Status (2026-10-06, mesmo PR):** corrigidos os itens **1** (meia-entrada só em R$, no HTML, JSON-LD, `llms*.txt`
> via `geo-build.mjs`, e um erro novo no `check.mjs` para não voltar), **2** (nó do Bosque fora do JSON-LD), **3**
> (`url` da Clínica = `clinica.institutofacaamigos.com.br`, que está no ar e indexável), **4** (eventos montados no
> servidor pelo `middleware.js`, com canonical próprio, JSON-LD `Event`, 404 real e `/sitemap-eventos.xml`) e **11**.
> De quebra: o glossário e o artigo de laudo diziam que a meia-entrada valia no Circuito, mas o caixa não tem preço
> inclusivo para o Circuito (`geo-facts.json`); o texto agora diz só Playground. Os demais itens continuam abertos.

| # | Gravidade | Problema | Onde | Por que importa |
|---|---|---|---|---|
| 1 | Alta | **"50% de desconto" vs. R$ 60 → R$ 50.** A tabela-base é R$ 100 (geral tem 40% off, inclusivo 50% off, ver `geo-facts.json`), mas o visitante e a IA só veem R$ 60 e R$ 50 ao lado de "50% Off". Um assistente vai calcular "50% de 60 = 30" e responder errado, ou apontar contradição. | `playground.html` (amenity "Meia-Entrada Inclusiva (50% Off)", textos "meia-entrada inclusiva (50%)"), `index.html` (amenity), `llms.txt` ("50% de desconto sobre a tabela padrão") | Fato contraditório é o que mais faz IA descartar ou distorcer uma fonte. |
| 2 | Alta | **Unidade Bosque Grão-Pará marcada como `LocalBusiness`** sem horário e sem estar aberta. | `playground.html` (`#bosquegraopara`) | Schema de local que ainda não atende pode gerar resultado/painel errado ("aberto?") e é contra as diretrizes de dados estruturados do Google. Retirar do JSON-LD até abrir; manter só o texto "abre em breve". |
| 3 | Média | **Mesmo `@id` da Clínica com `url` diferente**: `index.html` diz `clinica.institutofacaamigos.com.br`, `servicos.html` diz `/servicos`. | `index.html`, `servicos.html` (`#clinica`) | Entidade com duas URLs canônicas confunde o grafo. Escolher uma (sugestão: `/servicos` enquanto a clínica não abre). _Verificar_ também que `clinica.` é servido pelo projeto Next.js da Clínica e não cai no `middleware.js` deste repo (que manda esse host para o Hub de Gestão, noindex). |
| 4 | Média | **Eventos individuais não indexam.** `/eventos/<slug>` tem canonical fixo para `/eventos` e o JSON-LD `Event` é injetado por JavaScript. | `evento.html`, `vercel.json` | Com canonical apontando para a agenda, o Google descarta a página do evento e o schema `Event` (que dá rich result local de evento) nunca é usado. Canonical deve ser a própria URL do evento, e os eventos devem entrar no sitemap. |
| 5 | Média | **`hasMap` genérico** (`maps.google.com/?q=Parque+Shopping+Belém`). | `index.html`, `playground.html`, `circuito.html` | Aponta para o shopping, não para o FaçaAmigos. Trocar pelo link do perfil no Google Maps (com o CID) assim que o perfil existir/for verificado. |
| 6 | Média | **`sameAs` só tem o Instagram.** | Organization e LocalBusiness | `sameAs` é como Google e IA conectam o site às outras fontes da marca. Incluir perfil do Google Maps, Facebook, YouTube/TikTok (se existirem), e o perfil do CRP/Doctoralia da Isabella no `Person`. |
| 7 | Baixa | **Imagem de todos os artigos `/aprender` é a capa do e-book** (`img/codigo/og-codigo.jpg`). | 9 arquivos em `aprender/` | Artigo com imagem genérica perde em Discover/Imagens e não diferencia o resultado. Uma imagem própria por artigo. |
| 8 | Baixa | **Autor dos artigos sem página própria.** `author` é `Person` sem `url`/`sameAs`. | `aprender/*.html` | Para tema de saúde infantil (YMYL), E-E-A-T pesa: criar `/isabella` (ou âncora fixa) com formação, CRP, foto, e apontar `author.url` para ela. |
| 9 | Baixa | **Coordenadas com 4 casas** (`-1.3653, -48.4552`) e mesmo ponto para Playground e Circuito. | `geo` / `meta geo.position` | _Verificar_ no Google Maps se o pino cai no quiosque/loja, não no meio do shopping. 4 casas ≈ 11 m, suficiente se estiver certo. |
| 10 | Baixa | **Imagens `.jpg` pesadas na rota principal**: `circuito-brincadeira-1.jpg` (616 KB) no `circuito.html`, `circuito-carrinhos.jpg` (230 KB) no playground, mesmo havendo `.webp`. | `circuito.html`, `playground.html` | Velocidade no celular conta para ranking local e conversão. Confirmar se o `<picture>` serve o `.webp` primeiro; se o `.jpg` é só fallback, ok. |
| 11 | Baixa | **Link da Política de Privacidade no `llms.txt` aponta para `playground.`**, que redireciona (308) para o hub. | `llms.txt` (gerado por `scripts/geo-build.mjs`) | IA segue redirecionamento, mas link direto é mais limpo. Corrigir no gerador, não no arquivo. |
| 12 | Baixa | **Telefone em dois formatos** (`+55-91-…` e `+55 91 …`). | JSON-LD | Inofensivo para o Google; padronizar em E.164 (`+5591992347673`) facilita qualquer cruzamento de NAP. |

**O que está certo e não precisa mexer:** títulos e descrições com tamanho bom e cidade no texto; um `h1` por página;
canonical em todas as públicas; `noindex` nas privadas (`/admin`, `/gestao`, `/wifi`, `/ingresso`, host `gestao.`);
robots liberando GPTBot, ClaudeBot, PerplexityBot etc. com os mesmos `Disallow`; `FAQPage` em hub, playground,
circuito e serviços; `Offer` com preço; `llms.txt` sincronizado com o caixa pelo `geo-sync.yml`.

---

## 2. Passo a passo fora do código (onde está o maior ganho)

Para "playground perto de mim", "carrinho elétrico shopping Belém" etc., o Google mostra primeiro o **pacote do mapa**.
Quem decide o pacote é o **Google Business Profile (GBP)**, não o site. E ChatGPT, Gemini e Perplexity, para pergunta local,
leem principalmente Google Maps, avaliações e diretórios.

### Passo 1 — Google Business Profile (semana 1)
1. _Verificar_ se já existe perfil para o Playground no Parque Shopping. Se não, criar.
2. **Um perfil por ponto de atendimento real**: Playground e Circuito podem ser um perfil só (mesmo endereço, mesmo telefone) ou dois, se tiverem balcões separados e equipe própria. Não criar perfil para Bosque Grão-Pará nem Clínica antes de abrirem (o Google exige atendimento presencial no horário informado).
3. Nome **exatamente** como na placa (sem "melhor playground de Belém" no nome: isso dá suspensão).
4. Categoria principal: _Playground infantil_ ou _Centro de recreação infantil_ (testar a que existir no GBP em pt-BR). Secundárias: _Parque de diversões infantil_, _Centro de entretenimento familiar_.
5. Endereço com "Parque Shopping Belém, Térreo, próximo às Lojas Americanas", igual ao do site.
6. Horário 10h–22h + **horários especiais** em feriados (é o que mais gera "estava fechado" em avaliação).
7. Atributos: acessível para cadeira de rodas, banheiro acessível, adequado para crianças, e os de identidade se fizer sentido.
8. Serviços/produtos com os preços do site (os mesmos números, mesmo texto da meia-entrada).
9. Link do site: `https://institutofacaamigos.com.br/playground?utm_source=google&utm_medium=organic&utm_campaign=gbp` para medir no GA.
10. 15–30 fotos reais: fachada/entrada, equipe, piscina de bolinhas, canto sensorial, carrinhos. Repor 2–4 por mês.
11. Depois de verificado, copiar o link do perfil e atualizar `hasMap` e `sameAs` (itens 5 e 6 acima).

### Passo 2 — Avaliações (contínuo, começa na semana 1)
1. Gerar o link curto de avaliação no GBP.
2. Pedir **na saída**, no momento em que a criança está feliz: QR no balcão + mensagem no WhatsApp junto com o "Olhar FaçaAmigos" (planos de 1 h+). Esse é o momento mais natural, e já existe.
3. Meta realista: 4–8 avaliações por semana. Ritmo constante pesa mais que pico.
4. Responder **todas**, inclusive as boas, citando o serviço ("o Horário Inclusivo", "o circuito") — isso alimenta as palavras que a IA associa ao lugar.
5. **Não** oferecer desconto em troca de avaliação (viola a política do Google e o CDC) e **não** colocar `AggregateRating` no site com nota própria (Google ignora/penaliza review autosservido em LocalBusiness). O `docs/SEO-CLUSTERS-SEARCH-CONSOLE.md` já traz essa regra.

### Passo 3 — Citações e NAP (semanas 2–3)
Mesmo nome, endereço e telefone em todos. Prioridade:
1. Página de lojas do **site do Parque Shopping Belém** (pedir ao marketing do shopping; é o backlink local mais forte que vocês podem ter).
2. Apple Maps (Apple Business Connect) e Bing Places (alimenta o ChatGPT e o Copilot).
3. Facebook (página com endereço), Instagram com endereço e link na bio para o site.
4. TripAdvisor (_Atividades para crianças em Belém_) e Waze.
5. Para a Isabella: perfil no Doctoralia e no site do CRP-10 com o mesmo nome usado no schema.

### Passo 4 — Menções em Belém (mês 1–2)
IA cita quem é citado. Alvos concretos:
1. Blogs/perfis de mães de Belém e de famílias atípicas (convite para Horário Inclusivo).
2. Associações de autismo e TDAH do Pará (parceria, palestra em `/eventos`).
3. Pauta para imprensa local (O Liberal, G1 Pará, TV Liberal): "playground inclusivo com meia-entrada para TEA no shopping" é pauta pronta. Uma matéria vale mais que dez páginas novas.
4. Escolas parceiras divulgando `/aprender` e o Mapeamento.

### Passo 5 — Conteúdo local que falta (mês 2)
Seguir as lacunas da seção 5 do `docs/SEO-CLUSTERS-SEARCH-CONSOLE.md`; acrescento:
1. **"Como chegar"** no playground: estacionamento do shopping, entrada mais próxima, ônibus que passam na Augusto Montenegro, distância de Ananindeua/Marituba. Responde "perto de mim" para quem vem de fora.
2. **Página/âncora da autora** (item 8).
3. **Página de cada evento indexável** (item 4).
4. Não criar páginas por bairro com texto trocado ("playground no Marco", "playground em Nazaré"): é doorway page e o Google penaliza.

### Passo 6 — Medir (contínuo)
1. Search Console como propriedade de **Domínio** e o regex de clusters já documentado.
2. GBP Insights: buscas diretas x descoberta, pedidos de rota, cliques no WhatsApp.
3. Uma vez por mês, perguntar a ChatGPT, Gemini e Perplexity: "playground inclusivo em Belém", "onde levar criança autista para brincar em Belém", "carrinho elétrico shopping Belém". Anotar se aparece, qual fonte foi citada e se os preços vieram certos. É o único teste direto de visibilidade em IA.

---

## 3. Ordem sugerida

| Quando | O quê | Quem |
|---|---|---|
| Esta semana | GBP criado/verificado; corrigir itens 1, 2 e 3 do código | Bruno + dev |
| Semana 2 | Fluxo de avaliação no balcão e no WhatsApp; Apple/Bing; pedido ao Parque Shopping | equipe da loja + Bruno |
| Semana 3–4 | Itens 4, 5, 6 do código (eventos, `hasMap`, `sameAs`) com o link do GBP | dev |
| Mês 2 | Página da autora, "como chegar", imagens dos artigos, pauta de imprensa | Isabella + dev |
| Mensal | Teste nas IAs + GSC + GBP Insights | Bruno |

## 4. Perguntas que mudam a prioridade

1. Já existe perfil no Google Maps para o Playground? Quantas avaliações e qual nota?
2. Playground e Circuito têm balcão e caixa separados (justifica dois perfis) ou é tudo um só?
3. Quando a Clínica e o Bosque Grão-Pará abrem? (Define quando entram no schema e no GBP.)
4. A tabela-base de R$ 100 é algo que o cliente vê em algum lugar? Se não, a comunicação deveria ser "R$ 50 para crianças com laudo ou CIPTEA", sem o "50%".
