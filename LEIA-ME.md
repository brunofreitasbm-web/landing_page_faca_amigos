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
