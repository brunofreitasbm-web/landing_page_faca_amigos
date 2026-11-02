# Design Map

> Fonte: https://institutofacaamigos.com.br/, capturado em 2026-10-28 em produção, **antes** do redesenho da home deste PR. Viewports de 1440x900 e 390x844, nas páginas `/`, `/playground` e `/aprender`. Os valores marcados como **sistema** se repetem em mais de uma página.

## Spacing Scale
- Mais frequentes: 10px (86x), 8px (73x), 12px (42x), 18px (41x), 22px (38x)
- Também aparecem: 4, 6, 9, 14, 15, 16, 20, 24, 40px
- Seções: `.sec` 76px vertical; hero 56-64px no topo; blocos de 36-60px
- Sem unidade base estrita (há valores ímpares como 9, 15 e 22)

## Font Hierarchy
| Papel | Tamanho | Peso | Família |
|---|---|---|---|
| h1 | 51.2px, `clamp(2.1rem, 4.4vw, 3.2rem)` | 400 | Fredoka One |
| h2 | 35.2px, `clamp(1.9rem, 4vw, 2.7rem)` | 400 | Fredoka One |
| título de card | 24px | 400 | Fredoka One |
| lead | 18.4px | 700 | Nunito |
| corpo | 16px | 600 | Nunito |
| botão | 16.8px | 800 | Nunito |
| eyebrow | 12.8px, caixa alta, 0.12em | 900 | Nunito |
- Antes deste PR: 12 tamanhos entre 12.8px e 18.4px. Depois: 5 tokens (`--fs-xs` 0.8 / `sm` 0.9 / `md` 1 / `lg` 1.15 / `xl` 1.3rem)

## Color Palette
| Papel | Valor |
|---|---|
| fundo | `#FFF9F1` (creme) — **sistema** |
| superfície | `#FFFFFF` (56.9% da área) |
| texto primário | `#1A3F35` — **sistema** |
| texto secundário | `#4C6B62` (5.6:1 sobre creme) |
| CTA principal | `#F0196B` → `#E01560` neste PR (4.72:1 com branco) |
| secundária | `#1FA893` → `#137A6A` neste PR (5.22:1 com branco) |
| grifo | `#FFE234` |
| WhatsApp | `#25D366` com texto `#053B1C` (6.42:1) |
| rodapé / e-book | `#065264` (26.4% da área) |

## Image Ratios
- Foto de produto no card: 16:10, recortada de originais 3:4
- Foto da clínica: 4:3.4 (até 860px), depois altura livre
- Hero do `/playground`: 3:4 inclinada; hero da home neste PR: 4:5 com rotação de 1.5deg
- Avatar da idealizadora: 1:1, círculo de 148px com anel `conic-gradient`

## Component Tokens
- Raios: 9999px (botões e chips, 38x), 32px (`lazer-card`, `clinica-photo`), 24px (`--r-card`), 20px, 18px, 14px
- Sombras: `0 4px 10px rgba(26,63,53,.08)` (43x), `0 18px 40px rgba(26,63,53,.14)` (7x), sombra colorida do CTA `0 10px 26px rgba(<cor do botão>,.32)`
- Botão: altura mínima de 48px (44px no `btn-sm`), padding de 15x30px e `scale(1.03)` no hover com `cubic-bezier(0.34,1.4,0.64,1)` em 0.2s
- Grade: container de 1140px com padding de 22px; cards em 2 ou 3 colunas, gap de 16-24px
- Acessibilidade: `:focus-visible` com outline de 3px teal; `prefers-reduced-motion` respeitado

---

# Taste DNA

### Neutros tingidos de verde, nunca cinza
- **Trigger**: ao escolher texto, fundo e sombra para uma marca infantil que também vende terapia.
- **Decision**: texto `#1A3F35`, secundário `#4C6B62`, fundo creme `#FFF9F1` e sombras `rgba(26,63,53,x)`, em vez de cinzas puros e sombra preta.
- **Reason**: a mãe que chega preocupada associa o creme com verde-musgo a uma casa ou um berçário, e não a um consultório. O tom quente baixa a guarda antes de qualquer texto.
- **Evidence**: `#1A3F35` em 73 nós de texto; `#4C6B62` em 43; 43 sombras `rgba(26,63,53,0.08)`; nenhuma sombra `rgba(0,0,0)` fora da capa do e-book.

### Nenhum canto vivo
- **Trigger**: ao definir a geometria de botões, chips e cards.
- **Decision**: pílula de 9999px em todo botão e chip e raio de 18-32px nos cards, em vez de cantos de 4-8px.
- **Reason**: num espaço para criança, o canto arredondado repete visualmente a promessa de segurança física. A interface parece macia como o tapete.
- **Evidence**: 9999px em 38 elementos; cards com 20px (17x), 18px (10x) e 24px (6x); `lazer-card` com 32px; nenhum raio abaixo de 14px.

### Voz infantil só no título
- **Trigger**: ao equilibrar o tom lúdico com o texto longo para pais.
- **Decision**: Fredoka One, em peso único 400, só de h1 a h4, e Nunito em 398 nós de texto, em vez de uma família lúdica no corpo ou de uma neutra no título.
- **Reason**: o título fala com a criança que existe na marca. O corpo fala com o adulto, que precisa ler preço, horário e laudo sem esforço.
- **Evidence**: Fredoka One em 25 nós, todos títulos; h1 de 51.2px e h2 de 35.2px com peso 400; Nunito em 398 nós; corpo com line-height 1.6.

### Foto real em vez de ilustração
- **Trigger**: ao decorar um site de playground, setor em que mascote e ilustração cartunesca são o padrão.
- **Decision**: fotos do próprio espaço (originais 3:4, sem tratamento) e só duas formas abstratas chapadas, em vez de mascote, ilustração ou banco de imagem.
- **Reason**: pais de crianças atípicas precisam ver o lugar exato antes de ir, e a ilustração esconde justamente o que eles querem conferir.
- **Evidence**: um círculo amarelo de 340px com opacidade 0.45 e um teal de 240px com 0.16 são a única decoração; grifo `#FFE234` sob as palavras-chave do H1; fotos `playground-piscina-casinha` e `circuito-lamborghini-menino` em resolução original; nenhum SVG ilustrativo além dos ícones.
