# Vender os e-books com verba zero

Situação em 03/11/2026: a API da Hotmart confirma **zero** vendas (a `hotmart-sync` consulta a cada 15 min), e o banco
não tem nenhum carrinho ou evento de webhook desde setembro.
Foram 20 Mapeamentos concluídos em 6 semanas. O gargalo é gente vendo a oferta, e não a página nem o preço
(que já caiu de R$ 149 para R$ 29,90 e R$ 9,90). Este guia reúne o que dá para fazer **uma vez** e deixar rodando,
sem verba e sem ninguém postando toda semana.

| Produto | Preço | Hotmart | Página |
|---|---|---|---|
| O Brincar com Propósito (97 págs.) | R$ 29,90 | M107692257Y · id 8560642 | `/guia` |
| O Código do Desenvolvimento Infantil (40 págs.) | R$ 9,90 | V107698297N | `/codigo` |

**Ordem:** 0 → 1 → 2 → 3.

---

## 0. Conferir a medição (5 min, painel da Hotmart)

**As vendas já são medidas.** A `hotmart-sync` consulta a API da Hotmart a cada 15 min (pg_cron `hotmart-sync-15min`)
e responde `{"days":7,"sales":0}`: o zero é real, não falha de integração (conferido em 03/11/2026 nas respostas
guardadas em `net._http_response`). O webhook (`fa_hotmart_eventos` vazia) nunca recebeu nada, o que é coerente
com zero vendas, mas também acontece se ele não estiver cadastrado. Ele faz falta só para **carrinho abandonado**
e para mandar a compra na hora ao GA4/Meta.

1. Conferir o id do Código: `POST .../hotmart-sync?list_products=1` com o cabeçalho `x-sync-key`. O secret
   `HOTMART_PRODUCT_ID` precisa ter os dois ids (`8560642,<id do Código>`). Se tiver só o do Guia, a sync não vê as
   vendas do Código.
2. Hotmart → Ferramentas → Webhook: se a URL `https://ivjvpdzsfjdpyabbzzuj.supabase.co/functions/v1/hotmart-webhook`
   não estiver lá, cadastrar (versão 2.0.0, os dois produtos, compra/reembolso/chargeback/cancelada/carrinho abandonado).
   O hottok do painel tem que ser igual ao secret `HOTMART_HOTTOK`. Passo a passo em `PUBLICAR.md`, Lote 3.
3. "Enviar teste" no painel e conferir: `select * from fa_hotmart_eventos order by received_at desc;`

## 1. Canais próprios (já no código; falta instalar e imprimir)

- **TV da sala de espera da Clínica (`/tv3`)**: 2 slides novos na família E, em toda volta: capítulo 1 grátis
  do Guia e o Código (R$ 9,90). O QR abre a prévia da página,
  com `utm_source=tv3`. Entram no ar junto com a TV, quando a Clínica abrir (dezembro/2026).
- **Cartaz de balcão A5**: `public/cartaz-ebooks/cartaz-ebooks-a5.pdf` (fonte em `public/cartaz-ebooks/index.html`;
  para gerar de novo: `node scripts/cartaz-ebooks-pdf.mjs`). Imprimir 1 para a recepção da Clínica e 1 para cada
  balcão de Playground. O QR vai com `utm_source=cartaz`.
- **Portal Wi-Fi**: já mostra os dois e-books (`public/wifi.html`, `hotspot/alogin.html`). Nada a fazer.

> **Para a Isabella decidir:** oferecer material pago dela na sala de espera da própria clínica. Os slides foram
> escritos para não pressionar: pedem o capítulo grátis, mostram o preço e trazem o aviso "material educativo".
> Mesmo assim, quem decide se isso combina com a relação terapêutica é ela. Se houver dúvida, consultar a
> orientação do CRP. Para tirar da TV: apague os dois slides `e_ebook_*` de `conteudo/tv3-slides.json` e
> rode `python3 scripts/tv3-pool.py`.

## 2. Hotmart: aumentar o valor de cada venda (30 min, sem código)

1. **Order bump no checkout do Código**: Produto Código → Checkout → Order Bump → oferecer o Guia.
   Sugestão: R$ 19,90 no bump, contra R$ 29,90 avulso. Quem compra o produto de entrada é o comprador mais
   provável do segundo, e o bump não precisa de tráfego novo.
   **Atenção ao CDC:** "de R$ 29,90 por R$ 19,90" só pode aparecer se R$ 29,90 for o preço praticado de verdade (é, em `/guia`).
2. **Garantia**: conferir se os 7 dias estão ativos nos dois produtos. A auditoria (`docs/AUDITORIA-COPY-CONVERSAO.md`, P6)
   sugere 15 a 30 dias. Com zero vendas, o risco de reembolso é irrelevante perto do ganho de confiança.

## 3. Plataformas que já têm comprador procurando

### 3a. Amazon KDP (Kindle), para o Código

Na Amazon, quem busca "birra", "comportamento infantil" ou "criação de filhos" já quer comprar. Nenhum
canal próprio do FaçaAmigos tem isso. Configura uma vez e roda sozinho.

1. Conta em kdp.amazon.com no **CPF da Isabella** (o mesmo titular da Hotmart; os termos do site dizem que é ela quem vende).
2. Arquivo: o PDF está em `ebook/` (fora do git, de propósito). Converter para EPUB no computador. O Kindle
   Create, gratuito da Amazon, importa PDF. Conferir que o sumário vira índice clicável.
3. **NÃO inscrever no KDP Select.** O Select exige exclusividade digital na Amazon, e isso impediria a venda na Hotmart.
4. Preço: antes de definir, conferir no KDP a faixa de preço em reais que dá royalty de 70% (a regra muda; não está
   confirmada aqui). Manter perto de R$ 9,90 para não contradizer a Hotmart.
5. Ficha (copiar e colar):
   - **Título:** O Código do Desenvolvimento Infantil
   - **Subtítulo:** Um guia de coração para mães, pais e famílias entenderem o comportamento da criança
   - **Autora:** Isabella Gonçalves Freitas
   - **Descrição:** O comportamento do seu filho tem lógica. Em 9 capítulos curtos, com histórias do cotidiano e sem
     jargão de especialista, a psicóloga Isabella Gonçalves Freitas (CRP 10/4727) traduz a Análise do Comportamento
     para a linguagem da sua casa: por que um comportamento se repete, o que acontece antes e depois dele e o que ajuda
     no dia a dia. Material educativo: não faz diagnóstico e não substitui avaliação e acompanhamento profissional.
   - **7 palavras-chave:** birra criança · comportamento infantil · análise do comportamento para pais ·
     desenvolvimento infantil · criação de filhos · disciplina positiva · ABA para famílias
   - **Categorias:** Família e relacionamentos › Criação de filhos · Psicologia › Psicologia infantil
6. Em cada busca, a Amazon mostra o autor: deixar a página de autora (Author Central) com a mesma bio do site.

O Guia (97 págs., cheio de fichas para imprimir) funciona pior no Kindle. Deixar só na Hotmart.

### 3b. Marketplace e afiliados da Hotmart

1. Nos dois produtos: Configurações → **Mostrar no Mercado** = sim.
2. Afiliação: **aprovação automática**, comissão de **50%** (no Código, a R$ 9,90, o afiliado ganha ~R$ 4. É pouco, então
   use 60% ou 70% nele, porque cada venda ainda puxa o order bump).
3. Página de divulgação para afiliados: usar as capas (`public/img/guia/capa.webp`, `public/img/codigo/capa.webp`) e
   as prévias em `public/img/*/prev-*.webp`.

Expectativa honesta: afiliado escolhe produto que já vende. Com zero vendas e ticket baixo, poucos vão aparecer.
Fica no plano porque custa zero.

### 3c. Lista de e-mail que já existe

São 15 pessoas que fizeram o Mapeamento e aceitaram receber e-mails. Um envio único no Brevo (lista `BREVO_LIST_ID=3`)
com o link do capítulo grátis: `https://institutofacaamigos.com.br/guia?utm_source=brevo&utm_medium=email&utm_campaign=capitulo_gratis#h-previa`.
Não reenviar para quem está na sequência automática (`fa_teste_ebook_seq`) nos últimos 7 dias.

---

## O que ficou de fora, de propósito

- **Anúncio pago**: no Código sobram ~R$ 8 líquidos por venda, e no Meta o custo por venda de infoproduto quase
  nunca fica abaixo disso. Só reavaliar com o order bump ativo e dados de conversão reais.
- **Instagram/TikTok orgânico**: funciona, mas precisa de alguém produzindo toda semana.
- **Baixar o preço de novo**: com 0 visitas no checkout, o preço não é o problema.

## Como saber se funcionou (revisar em 4 semanas)

```sql
-- vendas por origem (depois do passo 0)
select origem_src, product_id, count(*), sum(valor) from fa_ebook_compras
where status in ('APPROVED','COMPLETE') group by 1,2 order by 3 desc;
-- carrinhos abandonados
select product_id, count(*) from fa_ebook_carrinhos group by 1;
```

No GA4, filtrar sessões por `utm_source` = `tv3`, `cartaz`, `brevo`. Na Amazon, ver o relatório de vendas do KDP.
Se a TV e o cartaz trouxerem visitas e nenhuma venda, aí o problema passa a ser a página. Voltar à auditoria P6.
