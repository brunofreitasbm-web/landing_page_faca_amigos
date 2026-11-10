# Segurança: pendências da auditoria de 2026-11-10

Lista do que **não** foi resolvido pela Onda 1 neste repositório. Nenhum valor de
segredo aparece aqui, só onde está e o que fazer. Apague cada item ao concluir.

## Ações do dono (não dependem de código)

- [ ] Fazer deploy de `playground-reviews` e `wifi-mural-coupon` (até lá, o XSS só está fechado pelo lado do site e o cupom segue emitível com a chave anon).
- [ ] Revisar as avaliações já aprovadas em `fa_playground_reviews` atrás de conteúdo injetado ou falso.

## Onda 2 (muda comportamento, aprovar item a item)

- [ ] Avaliação com nota 9 ou mais é publicada na hora por POST público: passar a fila de moderação.
- [ ] CSP está em `Report-Only` e com `unsafe-inline` (`vercel.json`): tornar bloqueante.
- [ ] Turnstile nos formulários de lead (`behavior-test-webhook`, `wifi-lead-webhook`, `eventos-public`, reviews).
- [ ] `fa_teste_admin_sessions.token` em texto puro: guardar só o hash (como o `gestao-hub` já faz).
- [ ] Tokens de sessão de `/admin` e `/gestao` em `localStorage`.
- [ ] `gestao-hub` cria usuários do Simulador no Auth do projeto do PDV: eles herdam leitura de toda a base do PDV. Separar.
- [ ] `gestao-hub` aceitar um segredo dedicado da Clínica em vez da service_role dela.
- [ ] Arquivos internos em `public/`: `fa7k2m9/`, `NEWVITTA/proposta/*.pdf`, `contexto.md`.
- [ ] `error.message` em `geo-facts` e `hotmart-sync`; CORS com `*` de reserva em `playground-reviews`.
