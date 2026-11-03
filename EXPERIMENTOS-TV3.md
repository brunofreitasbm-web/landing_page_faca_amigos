# Experimentos da `/tv3` (sala de espera da Clínica)

> **Aviso (nov/2026):** a `tv3.html` está com `data-fa-sem-tag` no `<html>`: não carrega GTM nem GA4 e, por isso, **não envia mais o `tv3_slide` ao GA4**. Foi uma troca pedida para a TV de painel HD abrir mais rápido. Para medir exposição por slide de novo, tire o atributo do `<html>` da `tv3.html`.


Objetivo: saber se uma mudança na TV faz mais famílias entrarem no Portal, em vez de decidir no palpite.

## Como a medição funciona

- A TV é passiva: ninguém clica nela. Cada troca de slide vai ao `dataLayer` como `tv3_slide`, com
  `tv3_slide_id`, `tv3_fam`, `tv3_round`, `tv3_dia` e `tv3_experiment` (o rótulo de `CONFIG.experiment`).
- O QR do Portal leva a `/familia`, e o botão Entrar leva ao login com `utm_source=tv3&utm_medium=indoor&utm_campaign=portal_familia`.
  Cliques em "Entrar" e no WhatsApp da página são eventos de contato do site.
- **A métrica que importa** vem do sistema da clínica: famílias com primeiro acesso por semana, dividido pelas famílias atendidas
  na semana. O sistema ainda não publica isso; até lá, a contagem manual da recepção ("quantos pais já entraram?") vale como referência.
- O rótulo diz qual versão da TV estava no ar em cada dia. `?exp=<rótulo>` sobrepõe só para teste: não usar na TV da sala.

## Regras (as mesmas do `EXPERIMENTOS-TV2.md`)

1. **Uma mudança por vez.**
2. **Mínimo de 2 semanas por versão.**
3. **Comparar iguais:** mesmo dia da semana e mesma faixa de horário.
4. **Trocar o rótulo junto com a mudança**, no mesmo deploy. Formato `<o-que-mudou>-AAAA-MM`.
5. **Parar um teste** se algo piorar de forma clara e sem outra causa. Voltar ao rótulo anterior.

## Registro

| Rótulo | No ar de | Até | O que mudou | Entradas no Portal por semana | Conclusão |
|---|---|---|---|---|---|
| `base-2026-12` | (data da instalação) | | 63 slides no JSON (com os 2 de e-book da família E, em rodízio por dia), volta de ~12 min, QR do Portal a cada 6 min, trilha baixa | | Linha de base: comparar a próxima mudança contra ela. Os slides de e-book entraram antes da instalação, então já fazem parte da base. Vendas por origem: `fa_ebook_compras.origem_src` / UTM `utm_source=tv3` |

## Ideias de testes, em ordem sugerida

1. Cartão de mesa com o QR (presente ou ausente), a mudança de maior efeito esperado.
2. Peso da família A: dobrar `a_lembrete` (`weight: 3`) contra o padrão.
3. Tutorial `a_tut` aos 20 s contra 30 s.
4. Com o benefício da Família da Clínica definido, medir o uso no caixa do Playground.
5. Trilha ligada contra desligada (por semana inteira), olhando a opinião da recepção.

## Limite desta medição

O rótulo e as entradas se cruzam por data, não por pessoa. Isso mostra tendência, não prova causa. Se a clínica mudar de
rotina de cadastro na mesma semana, a conclusão fica em aberto.

> Atualização: `tv.html` e `tv2.html` também ficaram sem Tag Manager/Analytics (`data-fa-sem-tag`). O evento `tv2_slide` deixou de ser enviado ao GA4.
