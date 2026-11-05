# Topical map: mãe de criança autista que precisa de atendimento

> Criado em 2026-11-05. Documento interno (`docs/` não vai ao ar, ver `.vercelignore`).
> Substitui, para a Clínica, o mapa de clusters da seção 4 de `SEO-CLUSTERS-SEARCH-CONSOLE.md`, que está defasado (cita `/servicos` e `/teste`, que hoje são `/clinica` e `/mapeamento`, e trata a Clínica como "em breve").

## 1. Para quem é

**ICP:** mãe (ou pai, ou cuidadora) de criança autista, ou com suspeita, que mora em Belém e precisa de atendimento terapêutico. Origem: decisão de 2026-11-05.

**O que isso muda no mapa:** o objetivo do cluster não é explicar autismo para o público geral. É levar essa mãe de "estou preocupada" até "falei com a equipe da Clínica". Tema que não ajuda esse trajeto fica fora do cluster, mesmo que tenha volume.

**Regras de conteúdo que já valem no site** (conferidas pelo `scripts/check.mjs` e pelas notas do `MAPA-DO-SITE.md`):
- sem "melhor clínica", sem promessa de resultado, sem "cura";
- página de saúde com no mínimo 450 palavras;
- `reviewedBy` só com profissional real que aprovou;
- nos artigos de Aprender, o convite para a Clínica é "fale conosco e agende uma conversa", sem citar "avaliação inicial" (decisão de 2026-11-05).

## 2. A jornada em cinco momentos

| # | Momento | O que ela pensa | O que ela busca (hipótese, **sem volume medido**) |
|---|---|---|---|
| 1 | Desconfia | "Será que meu filho é autista?" | sinais de autismo, autismo ou atraso de fala, birra ou crise |
| 2 | Quer entender | "O que é isso e o que significa?" | o que é autismo, níveis de suporte, TDAH ou autismo |
| 3 | Precisa de atendimento | "Que terapia ele precisa e onde?" | terapia ABA Belém, fonoaudiologia infantil Belém, clínica autismo Belém |
| 4 | Precisa pagar e provar | "Como consigo plano, laudo, direitos?" | plano de saúde cobre ABA, laudo e CIPTEA, IASEP, PROASA, BPC |
| 5 | Convive todo dia | "Como ajudo em casa e na escola?" | rotina visual, seletividade alimentar, conversar com a escola |

O momento 3 é onde está a conversão. Os momentos 1, 2, 4 e 5 existem para trazer a mãe até ele.

## 3. O mapa, página por página

Pilar = página que deve ranquear para a busca principal do momento. Apoio = responde uma dúvida e aponta de volta ao pilar.

### Momento 1: desconfia
| Papel | Página | Estado |
|---|---|---|
| Pilar | `/aprender/sinais-para-observar` | existe |
| Apoio | `/aprender/sinais-de-autismo-por-idade` | existe |
| Apoio | `/aprender/autismo-ou-atraso-de-fala` | existe |
| Apoio | `/aprender/birra-ou-crise` | existe |
| Apoio | `/mapeamento` (questionário gratuito) | existe |

### Momento 2: quer entender
| Papel | Página | Estado |
|---|---|---|
| Pilar | `/autismo` | existe |
| Pilar | `/tdah`, `/neurodivergencia` | existem |
| Apoio | `/aprender/niveis-de-suporte-autismo` | existe |
| Apoio | `/aprender/tdah-ou-autismo-diferencas` | existe |
| Apoio | `/aprender/o-que-e-neurodivergencia-e-atipico` | existe |
| Apoio | `/glossario` | existe |

### Momento 3: precisa de atendimento
| Papel | Página | Estado |
|---|---|---|
| Pilar | `/clinica` | existe |
| Pilar de serviço | `/clinica/terapia-aba`, `/clinica/fonoaudiologia`, `/clinica/terapia-ocupacional`, `/clinica/psicologia-infantil` | existem |
| Serviços complementares | `/clinica/integracao-sensorial`, `/clinica/psicopedagogia`, `/clinica/orientacao-parental`, `/clinica/nutricao`, `/clinica/musicoterapia`, `/clinica/habilidades-sociais`, `/clinica/psicomotricidade`, `/clinica/fisioterapia`, `/clinica/educacao-fisica-adaptada`, `/clinica/avaliacao-neuropsicologica` | existem |
| Apoio | `/aprender/como-e-a-terapia-comportamental` | existe |
| Apoio | `/aprender/como-escolher-clinica-de-terapia-aba` | existe |
| Apoio | `/aprender/aba-denver-pecs-diferencas` | existe |
| Apoio | `/planos` (pacotes particulares) | existe |

### Momento 4: precisa pagar e provar
| Papel | Página | Estado |
|---|---|---|
| Pilar | `/direitos` | existe |
| Apoio | `/aprender/plano-de-saude-cobre-terapia-aba` | existe |
| Apoio | `/aprender/laudo-e-ciptea` | existe |

### Momento 5: convive todo dia
| Papel | Página | Estado |
|---|---|---|
| Apoio | `/aprender/rotina-visual-em-casa` | existe |
| Apoio | `/aprender/seletividade-alimentar-no-autismo` | existe |
| Apoio | `/aprender/integracao-sensorial-sinais` | existe |
| Apoio | `/aprender/conversar-com-a-escola` | existe |
| Apoio | `/aprender/brincar-com-proposito-10-minutos` | existe |

**Fora do cluster da Clínica de propósito:** `/playground`, `/circuito`, `/aprender/primeira-vez-no-playground`, `/aprender/e-para-todas-as-criancas`, `/eventos` e os e-books. São outros públicos ou outra intenção. Os dois artigos do Playground ficam ligados à Clínica só por um convite, sem competir pelas mesmas buscas.

## 4. Lacunas (o que falta para a jornada fechar)

Ordenadas por impacto na conversão. Nenhuma está feita.

| # | Lacuna | Por que importa | Observação |
|---|---|---|---|
| 1 | **Página de "como funciona o primeiro contato / como agendar"** | Momento 3 não responde "como começo, quanto tempo leva, preciso de laudo, o que levo". É a dúvida que antecede o WhatsApp. | Sem usar o nome "avaliação" no título. O texto do `FAQ` da Clínica pode ser a base. |
| 2 | **Convênio por nome:** IASEP e PROASA | A Clínica atende os dois, e a mãe busca pelo nome do convênio. Hoje só aparece dentro de `plano-de-saude-cobre-terapia-aba`. | Confirmar com a recepção as regras atuais de cada convênio antes de escrever. |
| 3 | **"Meu filho recebeu o diagnóstico, e agora?"** | Momento entre o 2 e o 3. É o caminho natural para a Clínica e não tem página própria. | `/direitos` tem a situação "Meu filho acabou de receber o laudo", mas é sobre direitos, não sobre próximos passos de terapia. Revisão da Isabella. |
| 4 | **"Terapia ABA: quantas horas por semana?"** | Dúvida concreta de quem já decidiu. Evitar número fixo: depende de cada criança. | Revisão da Isabella para o tom e a ausência de promessa. |
| 5 | **Neuropediatra / como achar um em Belém** | Muita mãe precisa do médico antes de começar. | Não recomendar nome de profissional de fora. Só explicar o caminho e como o SUS funciona. Fontes oficiais antes de escrever. |
| 6 | **Páginas curtas dos momentos 4 e 5 ligadas à Clínica** | Os artigos já recebem convite; falta o caminho de volta (Clínica → artigo certo). | A Clínica e as especialidades já têm "relacionados". Falta ligar cada especialidade a 1 ou 2 artigos de Aprender. |

**Atualização de 2026-11-05:** as lacunas 1, 2, 3, 4 e 5 viraram guias em `/aprender`, em rascunho até a revisão da Isabella: `como-comecar-na-clinica-primeiro-contato`, `convenio-iasep-proasa-terapia-autismo`, `diagnostico-de-autismo-e-agora-proximos-passos`, `terapia-aba-quantas-horas-por-semana` e `neuropediatra-em-belem-como-chegar-ao-diagnostico`. Só usam fatos que já estão no site e na base de conhecimento da Clínica. A lacuna 6 (ligar cada especialidade a artigos de apoio) segue aberta.

## 5. Regras de ligação entre as páginas

1. Todo artigo de apoio aponta para **o pilar do momento dele** e para **a Clínica** (convite "fale conosco").
2. Todo pilar de serviço da Clínica aponta para **2 a 3 artigos de apoio** e para `/direitos` quando tratar de custo.
3. Artigo do momento 1 aponta para o momento 2 ou 3, não para o 5.
4. Mínimo de 3 links de entrada por página indexável. Hoje isso não é verificado automaticamente; o `check.mjs` poderia falhar abaixo disso.
5. Âncora com o nome do assunto ("terapia ABA em Belém"), não "clique aqui".

## 6. Palavras-chave: o que falta para validar

O arquivo `docs/palavras-chave-planejador.csv` já lista 28 termos com a página-alvo, mas a coluna `volume_mensal_belem` está vazia. Eu não consigo medir daqui (sem acesso ao Google Ads nem ao Search Console).

**Passos:**
1. Colar a lista no Planejador de Palavras-chave (Google Ads), com local Belém e idioma português, e exportar.
2. Preencher o CSV. Termos com volume muito baixo em Belém podem ser ampliados para Pará ou Brasil só para decidir o assunto do artigo.
3. Abrir o Search Console (propriedade de Domínio) e olhar, no cluster Clínica (seção 3.2 do documento de regex), **quais buscas já trazem impressão e para qual página**. Se a página errada aparece, é sinal de canibalização.
4. Acrescentar ao CSV os termos do momento 4 que faltam: `IASEP`, `PROASA`, `terapia ABA convênio Belém`, `laudo autismo Belém`, `neuropediatra Belém`.
5. Reabrir este mapa e reordenar as lacunas da seção 4 pelo volume.

**Marcar e não usar:** termos de compra de produto (carrinho, moto elétrica) e qualquer termo que prometa resultado.

## 7. Como medir se funcionou

| Pergunta | Onde |
|---|---|
| A mãe chega pelos artigos do momento 1 e 2? | Search Console, páginas de `/aprender/*` e pilares de condição |
| Ela passa dos artigos para a Clínica? | GA4: navegação de `/aprender/*` para `/clinica/*` |
| Ela fala com a equipe? | GA4: `whatsapp_click`, com o `data-fa-link="aprender_fale_conosco"` desses convites |
| O convite funciona melhor em qual artigo? | Mesmo evento, por página de origem |

**Limite:** o GA4 registra o clique no WhatsApp, mas não sabe se virou atendimento. Com menos de 200 cliques por mês, não dá para fazer teste A/B com significância (nota de `.claude/product-marketing.md`). Compare mês a mês, sem concluir por semana.
