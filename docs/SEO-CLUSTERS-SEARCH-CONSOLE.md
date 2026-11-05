# Clusters de intenção comercial: regex para o Search Console

> Criado em 2026-10-05. Documento interno (`docs/` não vai ao ar, ver `.vercelignore`).
> **Atualizado em 2026-11-05:** rotas corrigidas na seção 4 (`/servicos` virou `/clinica` e `/teste` virou `/mapeamento`) e a Clínica deixou de ser tratada como "em breve". O mapa da jornada de quem busca atendimento na Clínica está em `TOPICAL-MAP.md`; a seção 4 daqui vale para os outros clusters.
> Substitui o regex de e-commerce (`comprar|loja|pedido|estoque…`), que não descreve o FaçaAmigos: aqui se vende **serviço local**, então a intenção de compra aparece como "quanto custa", "precisa agendar", "horário", "aniversário", "convênio", "perto de mim".

## 1. O que este regex faz (e o que não faz)

- É um **filtro de leitura** do Google Search Console. Ele mostra quais buscas já trazem impressões e cliques. **Não otimiza nada sozinho** e não entra no HTML.
- A otimização é o passo seguinte: olhar o que o filtro devolve, ver qual página aparece para cada busca e cobrir a lacuna na página pilar do cluster (seção 4).
- Repetir palavras como "preço" e "melhor" pelo site sem resposta real não ajuda e esbarra na regra da casa: nada de "melhor/maior/1º" sem fato público, nada de `AggregateRating` inventado.

## 2. Como usar no Search Console

1. Use a propriedade de **Domínio** (`institutofacaamigos.com.br`). Desde 09/10/2026 o Playground e o Circuito moram no hub; o host antigo `playground.` só redireciona (308). Numa propriedade de prefixo de URL, o histórico desse host antigo some.
2. **Desempenho > Resultados da pesquisa > + Novo > Consulta > Regex personalizado**, opção **Corresponde ao regex**. Cole um bloco abaixo.
3. Período: **3 a 16 meses**. O site é local e novo; o GSC esconde consultas raras, e filtro fino em 28 dias tende a voltar vazio.
4. Depois de filtrar, abra a aba **Páginas**: se a busca de um cluster cai na página errada (ex.: "preço carrinho elétrico" caindo no hub), o problema é de arquitetura, não de palavra.
5. Para separar **marca de descoberta**: rode o regex da marca com **Não corresponde ao regex**. O GSC aceita só um filtro de consulta por vez, então compare o cluster com e sem marca em duas leituras.

### Limites do RE2 (motor do GSC)

- Sem lookahead: "entidade **e** intenção" se escreve `entidade.*intenção|intenção.*entidade` (é o que os blocos combinados da seção 3.3 fazem).
- `\b` só entende letras sem acento. `\bpará\b` não casa "pará clube". Por isso os padrões evitam `\b` perto de acento e aceitam busca sem acento (`pre[çc]o`, `bel[ée]m`).
- "Pará" só casa **com acento** (`pará( |$)`): sem acento seria igual à preposição "para" e sujaria tudo.
- Limite de 4.096 caracteres por regex. O maior bloco aqui tem cerca de 1.100.

## 3. Regexes prontos

Todos foram testados num motor RE2 (Go `regexp`) contra 27 buscas de exemplo, positivas e negativas, com e sem acento: 0 falhas.

### 3.1 Modificadores

Intenção comercial (o equivalente, para serviço, do regex original):

```
(?i)(pre[çc]o|valor|quanto custa|quanto [ée] |pacote|passaporte|mensal|ingresso|desconto|promo[çc]|cupom|agend|marcar|hor[áa]rio|aberto (hoje|agora|domingo|feriado)|funciona|perto de mim|pr[óo]xim|onde fica|endere[çc]o|avalia[çc]|vale a pena|reclama|melhor|\bvs\b|versus|diferen[çc]a|anivers|festa|conv[êe]nio|plano de sa[úu]de|reembols)
```

Mapeamento do original para o FaçaAmigos:

| Original (produto) | FaçaAmigos (serviço) |
|---|---|
| comprar, loja, pedido | agendar, marcar, ingresso, passaporte, pacote |
| preço, precificação, custo | preço, valor, quanto custa, mensal, convênio, plano de saúde, reembolso |
| reserva | agendar, aniversário, festa |
| melhor, avaliações, vs | melhor, avaliação, reclamação, vale a pena, vs, diferença |
| perto de mim | perto de mim, próximo, onde fica, endereço, aberto hoje, horário |
| em estoque | (não existe em serviço; o equivalente é "aberto hoje", "funciona") |
| desconto, oferta | desconto, promoção, cupom |

Marca:

```
(?i)fa[çc]a ?amigos|instituto fa[çc]a
```

Local:

```
(?i)bel[ée]m|parque shopping|augusto montenegro|umarizal|ananindeua|marituba|pará( |$)
```

### 3.2 Entidades (um por cluster)

Use sozinho para ver tudo do tema, ou combinado (3.3) para ver só a intenção de compra.

**Playground**

```
(?i)playground|parquinho|brinquedoteca|espa[çc]o kids|[áa]rea kids|recrea[çc]|onde levar (as |a |o |os |meu |minha )?(crian|filh)|programa (com|para) crian|brincar (em|no|na) shopping
```

**Circuito**

```
(?i)circuito|carrinho|kart|carro el[ée]trico|mini ?carro
```

**Clínica**

```
(?i)cl[íi]nica|terapia|\baba\b|fono|terapeuta ocupacional|psicopedag|neuropsic|avalia[çc][ãa]o (infantil|comportament|neuro)
```

**Teste / Mapeamento**

```
(?i)teste|mapeamento|question[áa]rio|checklist|sinais de|meu filho (tem|[ée] |pode ser)|autis|\btea\b|tdah
```

**E-books**

```
(?i)e-?book|livro|apostila|guia (pr[áa]tico|para pais|para m[ãa]es)|brincar com prop[óo]sito|c[óo]digo do desenvolvimento
```

**Eventos**

```
(?i)palestra|curso|treinamento|workshop|encontro|capacita[çc]|forma[çc][ãa]o
```

### 3.3 Entidade + intenção (o filtro que importa)

Casam só buscas que têm o tema **e** um sinal de compra, em qualquer ordem.

**Playground + intenção**

```
(?i)(playground|parquinho|brinquedoteca|espa[çc]o kids|[áa]rea kids|recrea[çc]|onde levar (as |a |o |os |meu |minha )?(crian|filh)|programa (com|para) crian|brincar (em|no|na) shopping).*((pre[çc]o|valor|quanto custa|quanto [ée] |pacote|passaporte|mensal|ingresso|desconto|promo[çc]|cupom|agend|marcar|hor[áa]rio|aberto (hoje|agora|domingo|feriado)|funciona|perto de mim|pr[óo]xim|onde fica|endere[çc]o|avalia[çc]|vale a pena|reclama|melhor|\bvs\b|versus|diferen[çc]a|anivers|festa|conv[êe]nio|plano de sa[úu]de|reembols))|((pre[çc]o|valor|quanto custa|quanto [ée] |pacote|passaporte|mensal|ingresso|desconto|promo[çc]|cupom|agend|marcar|hor[áa]rio|aberto (hoje|agora|domingo|feriado)|funciona|perto de mim|pr[óo]xim|onde fica|endere[çc]o|avalia[çc]|vale a pena|reclama|melhor|\bvs\b|versus|diferen[çc]a|anivers|festa|conv[êe]nio|plano de sa[úu]de|reembols)).*(playground|parquinho|brinquedoteca|espa[çc]o kids|[áa]rea kids|recrea[çc]|onde levar (as |a |o |os |meu |minha )?(crian|filh)|programa (com|para) crian|brincar (em|no|na) shopping)
```

**Circuito + intenção**

```
(?i)(circuito|carrinho|kart|carro el[ée]trico|mini ?carro).*((pre[çc]o|valor|quanto custa|quanto [ée] |pacote|passaporte|mensal|ingresso|desconto|promo[çc]|cupom|agend|marcar|hor[áa]rio|aberto (hoje|agora|domingo|feriado)|funciona|perto de mim|pr[óo]xim|onde fica|endere[çc]o|avalia[çc]|vale a pena|reclama|melhor|\bvs\b|versus|diferen[çc]a|anivers|festa|conv[êe]nio|plano de sa[úu]de|reembols))|((pre[çc]o|valor|quanto custa|quanto [ée] |pacote|passaporte|mensal|ingresso|desconto|promo[çc]|cupom|agend|marcar|hor[áa]rio|aberto (hoje|agora|domingo|feriado)|funciona|perto de mim|pr[óo]xim|onde fica|endere[çc]o|avalia[çc]|vale a pena|reclama|melhor|\bvs\b|versus|diferen[çc]a|anivers|festa|conv[êe]nio|plano de sa[úu]de|reembols)).*(circuito|carrinho|kart|carro el[ée]trico|mini ?carro)
```

**Clínica + intenção**

```
(?i)(cl[íi]nica|terapia|\baba\b|fono|terapeuta ocupacional|psicopedag|neuropsic|avalia[çc][ãa]o (infantil|comportament|neuro)).*((pre[çc]o|valor|quanto custa|quanto [ée] |pacote|passaporte|mensal|ingresso|desconto|promo[çc]|cupom|agend|marcar|hor[áa]rio|aberto (hoje|agora|domingo|feriado)|funciona|perto de mim|pr[óo]xim|onde fica|endere[çc]o|avalia[çc]|vale a pena|reclama|melhor|\bvs\b|versus|diferen[çc]a|anivers|festa|conv[êe]nio|plano de sa[úu]de|reembols))|((pre[çc]o|valor|quanto custa|quanto [ée] |pacote|passaporte|mensal|ingresso|desconto|promo[çc]|cupom|agend|marcar|hor[áa]rio|aberto (hoje|agora|domingo|feriado)|funciona|perto de mim|pr[óo]xim|onde fica|endere[çc]o|avalia[çc]|vale a pena|reclama|melhor|\bvs\b|versus|diferen[çc]a|anivers|festa|conv[êe]nio|plano de sa[úu]de|reembols)).*(cl[íi]nica|terapia|\baba\b|fono|terapeuta ocupacional|psicopedag|neuropsic|avalia[çc][ãa]o (infantil|comportament|neuro))
```

**Teste / Mapeamento + intenção**

```
(?i)(teste|mapeamento|question[áa]rio|checklist|sinais de|meu filho (tem|[ée] |pode ser)|autis|\btea\b|tdah).*((pre[çc]o|valor|quanto custa|quanto [ée] |pacote|passaporte|mensal|ingresso|desconto|promo[çc]|cupom|agend|marcar|hor[áa]rio|aberto (hoje|agora|domingo|feriado)|funciona|perto de mim|pr[óo]xim|onde fica|endere[çc]o|avalia[çc]|vale a pena|reclama|melhor|\bvs\b|versus|diferen[çc]a|anivers|festa|conv[êe]nio|plano de sa[úu]de|reembols))|((pre[çc]o|valor|quanto custa|quanto [ée] |pacote|passaporte|mensal|ingresso|desconto|promo[çc]|cupom|agend|marcar|hor[áa]rio|aberto (hoje|agora|domingo|feriado)|funciona|perto de mim|pr[óo]xim|onde fica|endere[çc]o|avalia[çc]|vale a pena|reclama|melhor|\bvs\b|versus|diferen[çc]a|anivers|festa|conv[êe]nio|plano de sa[úu]de|reembols)).*(teste|mapeamento|question[áa]rio|checklist|sinais de|meu filho (tem|[ée] |pode ser)|autis|\btea\b|tdah)
```

**E-books + intenção**

```
(?i)(e-?book|livro|apostila|guia (pr[áa]tico|para pais|para m[ãa]es)|brincar com prop[óo]sito|c[óo]digo do desenvolvimento).*((pre[çc]o|valor|quanto custa|quanto [ée] |pacote|passaporte|mensal|ingresso|desconto|promo[çc]|cupom|agend|marcar|hor[áa]rio|aberto (hoje|agora|domingo|feriado)|funciona|perto de mim|pr[óo]xim|onde fica|endere[çc]o|avalia[çc]|vale a pena|reclama|melhor|\bvs\b|versus|diferen[çc]a|anivers|festa|conv[êe]nio|plano de sa[úu]de|reembols))|((pre[çc]o|valor|quanto custa|quanto [ée] |pacote|passaporte|mensal|ingresso|desconto|promo[çc]|cupom|agend|marcar|hor[áa]rio|aberto (hoje|agora|domingo|feriado)|funciona|perto de mim|pr[óo]xim|onde fica|endere[çc]o|avalia[çc]|vale a pena|reclama|melhor|\bvs\b|versus|diferen[çc]a|anivers|festa|conv[êe]nio|plano de sa[úu]de|reembols)).*(e-?book|livro|apostila|guia (pr[áa]tico|para pais|para m[ãa]es)|brincar com prop[óo]sito|c[óo]digo do desenvolvimento)
```

**Eventos + intenção**

```
(?i)(palestra|curso|treinamento|workshop|encontro|capacita[çc]|forma[çc][ãa]o).*((pre[çc]o|valor|quanto custa|quanto [ée] |pacote|passaporte|mensal|ingresso|desconto|promo[çc]|cupom|agend|marcar|hor[áa]rio|aberto (hoje|agora|domingo|feriado)|funciona|perto de mim|pr[óo]xim|onde fica|endere[çc]o|avalia[çc]|vale a pena|reclama|melhor|\bvs\b|versus|diferen[çc]a|anivers|festa|conv[êe]nio|plano de sa[úu]de|reembols))|((pre[çc]o|valor|quanto custa|quanto [ée] |pacote|passaporte|mensal|ingresso|desconto|promo[çc]|cupom|agend|marcar|hor[áa]rio|aberto (hoje|agora|domingo|feriado)|funciona|perto de mim|pr[óo]xim|onde fica|endere[çc]o|avalia[çc]|vale a pena|reclama|melhor|\bvs\b|versus|diferen[çc]a|anivers|festa|conv[êe]nio|plano de sa[úu]de|reembols)).*(palestra|curso|treinamento|workshop|encontro|capacita[çc]|forma[çc][ãa]o)
```

Sobreposições esperadas: "autis" e "tea" estão no cluster Teste, mas aparecem em buscas de Clínica e Playground ("playground autismo"). Isso é sinal, não erro: mostra onde a família está na jornada.

## 4. Mapa de clusters

Cada cluster tem uma **página pilar** (a que deve ranquear para a busca principal) e páginas de apoio que respondem dúvidas e comparações e linkam de volta para o pilar.

| Cluster | Pilar | Apoio que já existe | Busca principal | Variações | Dúvidas | Comparações |
|---|---|---|---|---|---|---|
| Playground | `institutofacaamigos.com.br/playground` | `/aprender/primeira-vez-no-playground`, `/aprender/e-para-todas-as-criancas`, FAQ do hub | playground inclusivo Belém | parquinho Parque Shopping, espaço kids, onde levar criança em Belém | quanto custa, precisa agendar, posso deixar e circular, faixa etária, horário | playground x brinquedoteca, "é só para autista?" |
| Circuito | `institutofacaamigos.com.br/circuito` | FAQ do circuito | carrinho elétrico shopping Belém | kart infantil, mini carro, circuito de carrinhos | quanto custa (R$ 48), minuto adicional, idade/altura, vai sozinho | circuito x playground (qual escolher para a idade) |
| Clínica | `/clinica` | `/aprender/como-e-a-terapia-comportamental`, `/aprender/laudo-e-ciptea`, `/glossario` | clínica terapia comportamental infantil Belém | ABA Umarizal, fono infantil, terapia ocupacional infantil | atende convênio, precisa laudo, idade, avaliação é diagnóstico | ABA x outras abordagens, clínica x terapia em casa |
| Teste | `/mapeamento` | `/aprender/sinais-para-observar`, `/aprender/birra-ou-crise` | teste comportamental infantil gratuito | checklist autismo, sinais de TDAH, meu filho é autista | o teste dá diagnóstico, quanto tempo leva, é gratuito | teste online x avaliação profissional |
| E-books | `/guia` e `/codigo` | `/aprender/brincar-com-proposito-10-minutos`, `/aprender/rotina-visual-em-casa` | guia para pais desenvolvimento infantil | e-book brincar com propósito, livro para pais de criança atípica | vale a pena, garantia, como recebo | guia x código: qual comprar |
| Eventos | `/eventos` | `/aprender/conversar-com-a-escola` | palestra autismo Belém | curso para pais, treinamento para professores | ingresso, vagas, certificado | (só medir, depende do calendário) |

## 5. Lacunas priorizadas

Ordem por intenção de compra e esforço. Nada disso foi implementado: este documento só mapeia.

1. **Circuito: idade mínima / altura / acompanhante.** Dúvida de quem já decidiu ir; hoje só parcialmente na FAQ.
2. **Comparação "guia x código: qual escolher".** Quem compara está pronto para comprar e hoje não tem resposta; vale um bloco nas duas páginas ou um artigo em `/aprender`.
3. **"Teste online x avaliação profissional".** Liga o Teste à Clínica sem prometer diagnóstico.
4. **"Como escolher um playground para criança atípica".** Responde "melhor playground" com critérios, sem usar "melhor" como promessa.
5. **Clínica por serviço (fono, TO, ABA).** A Clínica já atende e as páginas por serviço existem (`/clinica/terapia-aba`, `/clinica/fonoaudiologia`, `/clinica/terapia-ocupacional` e outras). O que falta é ligar cada uma a artigos de apoio, como descrito em `TOPICAL-MAP.md`.

## 6. Armadilhas

- **Volume baixo**: um mês sem resultado no filtro não prova que a busca não existe; o GSC oculta consultas raras. Some o período antes de concluir.
- **Aniversário / festa**: o FaçaAmigos **não oferece** (confirmado em 2026-10-05). `anivers|festa` fica no regex de intenção só para medir demanda; não criar página nem citar em FAQ. Se o volume no GSC for alto, é dado para decidir se vale lançar o serviço.
- **Marca infla o resultado**: "faça amigos preço" é cliente que já conhece. Descoberta é o cluster **sem** marca.
- **Clínica**: já atende (os textos "em breve" e "lista de espera" foram corrigidos, ver `MAPA-DO-SITE.md`). Conteúdo comercial da Clínica segue as regras do `scripts/check.mjs` (sem "melhor clínica", sem promessa de resultado, sem "cura") e a revisão da Isabella.
- **Preços** vivem em vários lugares (HTML, JSON-LD, `llms*.txt`, `fa-track.js`, `fa-health`). Conteúdo novo que cite preço tem que seguir a tabela da seção 11 do `docs/CODEBASE_MAP.md`.
- **Regex mudou?** Revalide num motor RE2 (Go `regexp` serve) antes de colar: Python e JavaScript aceitam coisas que o GSC recusa (lookahead) e tratam `\b` diferente.
