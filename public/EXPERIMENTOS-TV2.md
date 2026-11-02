# Experimentos da `/tv2` (vitrine do quiosque do Circuito)

Objetivo: saber se uma mudança no painel vende mais, em vez de decidir no palpite.

## Como a medição funciona

- A TV é passiva: ninguém clica. O que ela registra é **o que estava na tela e quando**.
- Cada troca de slide envia ao `dataLayer` o evento `tv2_slide`, com `tv2_experiment` (rótulo), `tv2_slide` (nome da foto) e `tv2_plan` (20 ou 30).
- A **venda** vem do sistema do quiosque (`sessoes` e `caixa`, pelo conector do FaçaAmigos, só leitura). O rótulo diz qual versão do painel estava no ar em cada dia.
- O rótulo mora em `CONFIG.experiment` no `tv2.html`. `?exp=<rótulo>` na URL sobrepõe, só para teste: não usar na TV do quiosque.

## Regras

1. **Uma mudança por vez.** Duas mudanças juntas e não dá para saber qual funcionou.
2. **Mínimo de 2 semanas por versão** antes de concluir. Uma semana só mede o acaso (chuva, evento, feriado).
3. **Comparar iguais:** mesmo dia da semana e mesma faixa de horário. Sábado só com sábado.
4. **Métrica:** sessões vendidas por hora de funcionamento, por plano (20 e 30 min). Anotar também o que mexeu no fluxo do shopping naquela semana (evento, promoção, feriado).
5. **Trocar o rótulo junto com a mudança**, no mesmo deploy. Formato: `<o-que-mudou>-AAAA-MM`.
6. **Parar um teste** se a venda cair forte e sem outra causa. Voltar ao rótulo anterior.

## Registro

| Rótulo | No ar de | Até | O que mudou | Sessões/hora (20 min) | Sessões/hora (30 min) | Conclusão |
|---|---|---|---|---|---|---|
| `base-2026-10` | 2026-10-20 | 2026-10-21 | 14 slides: 8 antigos + 6 novos (pelúcias, bebê no Lamborghini, quiosque) | | | Ficou menos de 1 dia no ar: não serve de linha de base (regra 2). |
| `fotos-novas-2026-10` | 2026-10-21 | | 19 slides: entram 6 fotos novas com criança ao volante (jeep, Lamborghini x2, Range Rover, moto, capivara); sai `bombeiro-h` (repetia a foto do bombeiro). Cartão de 20 min passa a dizer "Pelúcias e jeep". No mesmo dia, o aviso de cookies deixou de aparecer em cima dos preços. | | | Passa a ser a linha de base. Comparar a próxima mudança contra ela. |

## Ideias de testes, em ordem sugerida

1. Duração do slide: 7 s contra 5 s.
2. Preço ligado ao cartão do plano (depende de confirmar se os dois planos têm o mesmo valor).
3. Slides que respondem objeções (idade, segurança).
4. Slide "livre agora" com a ocupação ao vivo.
5. Ponte para o Playground com benefício contável.

## Limite desta medição

O rótulo e a venda se cruzam por data e hora, não por pessoa. Isso mostra tendência, não prova causa. Se o painel mudar e o shopping tiver um evento na mesma semana, a conclusão fica em aberto.
