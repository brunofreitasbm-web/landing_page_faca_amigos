# FA Tech · Evento Academia do Autismo (Belém, 20 e 21/11/2026)

Tudo o que vai para o quiosque fica neste projeto: a mídia da TV, as demonstrações dos sistemas, o cadastro de interessados pelo QR Code, os slides e as artes para a gráfica.

## O que tem em cada pasta

| Pasta / arquivo | O que é |
|---|---|
| `src/data/marca.json` | **Dados da marca**: endereço do site (usado no QR Code), WhatsApp e e-mail. Quando estiverem definitivos, troque `urlDefinitiva` e `whatsappDefinitivo` para `true`. |
| `src/data/produtos.json` | Os 7 produtos: nome, a dor que resolvem e o alívio que entregam. Mudou aqui, muda em todas as peças. |
| `src/styles/tokens.css` | As cores e a fonte da FA Tech (caminho "Petróleo Clínico", fonte Inter). |
| `src/pages/impressos/` | As artes para a gráfica: roll-up, display de mesa e cartão. |
| `docs/` | Documentos de apoio: briefing do parceiro do faturamento e opções de identidade. |

## Como gerar os arquivos para a gráfica

Na pasta do projeto, rode:

```
npm install        (só na primeira vez)
npm run impressos

(se aparecer erro dizendo que o Playwright não achou o navegador, rode com o caminho do Chrome/Chromium: CHROMIUM_PATH=/caminho/do/chrome npm run impressos)
```

Os PDFs saem na pasta `impressos-pdf/`:

| Arquivo | Peça | Tamanho final | Tamanho do arquivo (com sangria) |
|---|---|---|---|
| `rollup.pdf` | Roll-up | 85 × 200 cm | 85,6 × 200,6 cm |
| `mesa.pdf` | Display de mesa | A5 (14,8 × 21 cm) | 15,4 × 21,6 cm |
| `cartao.pdf` | Cartão de visita (frente e verso) | 9 × 5 cm | 9,6 × 5,6 cm |

**Enquanto o endereço do QR e o WhatsApp não forem definitivos, as artes saem com um carimbo vermelho "PROVISÓRIO".** Isso evita mandar para a gráfica um QR Code que leva a lugar nenhum.

### O que dizer para a gráfica
- "Os arquivos já têm **3 mm de sangria** em cada lado."
- "Estão em **RGB**. Por favor, convertam para CMYK e me mandem uma **prova de cor** antes de imprimir tudo." O petróleo escuro pode sair mais apagado se ninguém conferir.
- No roll-up, os **15 cm de baixo** ficam escondidos dentro da base. A arte já deixa esse espaço livre.
- Antes de aprovar, **teste o QR Code impresso** com a câmera de dois celulares diferentes (um iPhone e um Android).

## Checagem antes de publicar

```
npm run check
```

Procura no material palavras que decidimos não usar e aponta onde estão.

## As páginas do estande

Todas em **institutofacaamigos.com.br/fatech**. Detalhes de uso no dia estão em `docs/CHECKLIST-DO-EVENTO.md` e o que falar em `docs/ROTEIRO-DE-VENDA.md`.

| Endereço | O que é | Onde editar o texto |
|---|---|---|
| `/fatech` | Entrada: leva às demonstrações e à calculadora | `src/pages/index.astro` |
| `/fatech/demo` | Todos os sistemas, organizados pela dor | `src/data/produtos.json` |
| `/fatech/demo/clinica` · `faturamento` · `atende` · `pessoas` · `play` · `tv` · `wifi` | Demonstrações clicáveis, com dados inventados e o botão "Mostrar o caminho" | `src/data/demo/<nome>.json` |
| `/fatech/demo/calculadora` | Calculadora da dor (quanto a clínica deixa de receber) | `src/pages/demo/calculadora.astro` |
| `/fatech/tv` | Loop da TV do estande (roda sozinho, com QR fixo). `?rapido=1` acelera para testar | `src/data/tv-slides.json` |
| `/fatech/apresentacao` | Slides (setas do teclado, F = tela cheia, Imprimir → PDF) | `src/pages/apresentacao.astro` |
| `/fatech/cadastro` | Página que os QR Codes abrem (hoje leva ao WhatsApp) | `src/pages/cadastro.astro` |

**Antes de mostrar os slides:** troque os trechos destacados com borda tracejada (slide 3 e o nome do parceiro do faturamento) por fatos reais.

## Onde está no ar

- Endereço público: **https://institutofacaamigos.com.br/fatech**. É esse endereço que os QR Codes abrem, por exemplo `/fatech/cadastro?origem=rollup`.
- O código mora na pasta `fatech/` do repositório do site (`langing_page_faca_amigos`), mas é publicado por um projeto **separado** na Vercel, ligado só a essa pasta. O site principal apenas repassa o que começa com `/fatech` (regra no `vercel.json` da raiz). Assim, mexer na FA Tech nunca derruba o site.
- Toda alteração dentro de `fatech/` que chega na `main` vai para o ar sozinha. Alterações só do site não reconstroem a FA Tech.
- **Hoje o `/fatech/cadastro` é provisório:** mostra um botão que abre o WhatsApp do Bruno com a mensagem "Vi a FA Tech no evento (rollup/mesa/cartao)". O cadastro completo, com a lista de interessados, entra no lugar dele sem trocar o endereço, então as artes impressas continuam valendo.
