# Templates da sequência do mapa (Brevo, transacional)

A função `guia-sequence` envia estes templates pelo `templateId`. O HTML daqui é a fonte; o Brevo guarda a cópia
publicada. O **assunto** só existe no Brevo (listado abaixo). Ao mudar um arquivo, atualize o template no Brevo.

| Id | Passo | Arquivo | Assunto (no Brevo) |
|----|-------|---------|--------------------|
| 1 | D+1  | `ebook-d1-capitulo-gratis.html` | Uma cena para ler hoje, {{ params.NOME }} |
| 2 | D+3  | `ebook-d3-diagnostico.html` | Preciso de diagnóstico para usar {% if params.PRODUTO == "codigo" %}o e-book{% else %}o guia{% endif %}? |
| 3 | D+6  | `ebook-d6-garantia.html` | O que está incluso no {% if params.PRODUTO == "codigo" %}e-book{% else %}guia{% endif %} e a garantia de 7 dias |
| 4 | D+9  | `ebook-d9-aprender.html` | {{ params.NOME }}, leituras gratuitas para o dia a dia com o(a) {{ params.NOME_CRIANCA }} |
| 5 | D+12 | `ebook-d12-proximo-passo.html` | {{ params.NOME }}, quando quiser conversar sobre o(a) {{ params.NOME_CRIANCA }} |

## Variáveis (enviadas por `guia-sequence`)
`NOME`, `NOME_CRIANCA`, `FAIXA_RESULTADO`, `PRODUTO` (`guia` ou `codigo`), `PRODUTO_TITULO`, `PRODUTO_URL`,
`PRODUTO_CTA`, `PRODUTO_PRECO`, `PRODUTO_PARCELAS`, `APRENDER_URL`, `UNSUB_URL`.

Os templates 1 a 3 têm uma versão para cada produto (`{% if params.PRODUTO == "codigo" %}`), com o guia como padrão
quando `PRODUTO` não vem. Preço e parcelas vêm de `OFFERS` em `functions/guia-sequence/index.ts`: mude lá, não no HTML.
O Código não tem capítulo grátis, então o D+1 dele não oferece PDF de amostra.

## Visual
Fredoka (títulos) e Nunito (corpo), rosa `#D61F4A`, texto `#0B1416`, apoio `#4F646B`, verde do WhatsApp `#1A7F45`
(tokens de `src/styles/global.css`). Sem preço, desconto ou urgência nos e-mails da clínica.

## Testar sem enviar
Pela prévia do Brevo (renderiza com `params`, não envia). A prévia exige o e-mail de um contato existente na conta.
