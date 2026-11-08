# Recadastro de identidade (Fase 2b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada pessoa que entra na Clínica, no RH (supervisores) ou no Hub informa CPF e e-mail real, confirmado por código, e o Hub liga essa identidade às contas dela, sem perder permissão e sem mudar a forma de login.

**Architecture:** O `gestao-hub` (um único `index.ts`, publicado por copia e cola no painel) ganha ações `recadastro_*` e tabelas novas no projeto A. Clínica e RH só consultam o status depois do login, pedem um código de uso único e redirecionam para a página `gestao.html#recadastro`. Tudo atrás de chaves desligadas por padrão.

**Tech Stack:** Deno edge function (supabase-js@2), Postgres, HTML+JS puro (`gestao.html`), Next.js 16 (clínica, `node --test`), React/Vite (RH, `vitest`).

**Spec:** `docs/superpowers/specs/2026-11-08-recadastro-identidade-design.md`

## Global Constraints

- Prazo de **7 dias** com "Fazer depois"; depois bloqueia. `RECADASTRO_DIAS = 7`.
- Código de uso único: **2 minutos**, 1 uso, só o hash. Código por e-mail: 6 dígitos, **5 tentativas**, **10 minutos**, só o hash.
- Chaves de liberação, **desligadas por padrão**: `GESTAO_RECADASTRO` (Hub e Clínica, vale `"1"`) e `VITE_GESTAO_RECADASTRO` (RH, vale `"1"`). Desligada, toda ação responde `pendente:false` e não grava nada.
- Hub fora do ar, timeout (3 s) ou erro: **nunca bloqueia**.
- Quem tem conflito aberto **nunca é bloqueado**.
- Isentos: papel `*_unit` ou `intern`, `profiles.role = 'responsavel'`, banido ou inativo.
- E-mail do login só é trocado quando for fictício (`/@(staff\.facaamigos\.local|grupoib\.internal|kiosk\.internal|familia\.clinica\.local)$/i`), mantendo o mesmo `id`. Chave `fa_gestao_contas.email` nunca é renomeada. RH: nunca escrever em `app_metadata`.
- Migrations aditivas e idempotentes. CPF só dígitos, validado por `cpfValido` (`gestao-hub/index.ts`). Textos em pt-BR, sem travessões.
- Sem `apply_migration` nem deploy sem o aval do dono. PRs em draft. Um PR por repo, na branch `claude/gifted-albattani-su6he9`.
- Comandos de teste: Hub `deno test --no-check --config supabase/tests/gestao-hub/deno.json --allow-env --allow-read --allow-net=none supabase/tests/gestao-hub`; tela `node --test tests/gestao-recadastro.test.mjs`; Clínica `npm test`, `npm run typecheck`; RH `npm test`.

## Decisões que o spec deixa em aberto

- **Mesma pessoa, dois logins.** Mesmo CPF com **o mesmo e-mail real confirmado** é a mesma pessoa: acrescenta mais um vínculo em `fa_gestao_pessoa_contas` e não é conflito. Só é `cpf_de_outra_pessoa` quando o CPF já existe com **e-mail real diferente**. (Caso real: o owner tem conta no Hub e na clínica.)
- **Token da página.** `recadastro_consultar` troca o código de uso único (2 min) por um token de página de 30 min, guardado como hash na mesma tabela. As ações seguintes aceitam esse token, ou a sessão do Hub.
- **Identidade dos sistemas.** O corpo da chamada traz `sistema: "clinica" | "rh"`; o token é validado no projeto B com `clinicaAdmin().auth.getUser(jwt)`.
- **Código por e-mail.** `fa_gestao_desafios` ganha `dados jsonb` (guarda o CPF digitado). A confirmação lê o CPF do desafio, nunca do cliente.
- **Limite de pedidos de código** é por pessoa (`alvo_id`), 3 a cada 15 minutos. O limite por IP do spec fica de fora: o IP que chega ao Hub é o do sistema, não o do usuário, e `excedeuTentativas` conta logins, não pedidos de código.
- **Painel do owner** lista só quem já foi avisado (linhas de `fa_gestao_recadastro_estado`). Quem nunca entrou não aparece.

## Review Focus

1. **Mesma pessoa, dois logins:** mesmo CPF e mesmo e-mail confirmado, vindo de outro login, vincula e não vira conflito (Task 5).
2. **Token inválido como credencial:** JWT do projeto A, de conta banida, de `*_unit` ou de `responsavel` não gera status, ticket nem página (Tasks 2 e 3).
3. **Troca de e-mail que colide:** `updateUserById` falha porque o e-mail já é de outro login. Nada fica gravado e abre conflito `email_de_outro_login` (Task 5).
4. **Reuso e clique duplo:** código de uso único e código por e-mail usados duas vezes, ou confirmação enviada duas vezes, não duplicam vínculo nem trocam o e-mail duas vezes (Tasks 3 e 5).
5. **Hub inalcançável ou lento no sistema:** clínica e RH seguem sem bloquear, sem erro na tela de login (Tasks 8 e 9). **E CORS do RH:** o navegador do RH precisa conseguir chamar o Hub (Task 4).

---

### Task 1: Migration

**Files:**
- Create: `landing_page_faca_amigos/supabase/migrations/20261109120000_gestao_recadastro.sql`

**Interfaces:**
- Produces: tabelas `fa_gestao_pessoas`, `fa_gestao_pessoa_contas`, `fa_gestao_recadastro_estado`, `fa_gestao_recadastro_tickets`, `fa_gestao_recadastro_conflitos` (colunas do spec, mais as abaixo); `fa_gestao_desafios.dados jsonb` e finalidade `'recadastro'`.

- [ ] **Step 1:** Somente leitura em produção (projeto A): `select conname from pg_constraint where conrelid='public.fa_gestao_desafios'::regclass and contype='c'` e anotar o nome real da constraint de `finalidade`.
- [ ] **Step 2:** Escrever a migration, todas com RLS ligado e sem policy:
  - `fa_gestao_recadastro_tickets`: `ticket_hash text primary key`, `chave`, `origem`, `auth_user_id uuid`, `hub_email`, `login_email`, `nome`, `expira_em`, `usado_em`, `pagina_hash text`, `pagina_expira_em`.
  - `fa_gestao_pessoa_contas`: unique em `(origem, auth_user_id)` e em `(origem, hub_email)`, `email_login_antes text`.
  - `fa_gestao_desafios`: `drop constraint if exists <nome do Step 1>` e recriar com `('login','reset','recadastro')`; `add column if not exists dados jsonb`.
- [ ] **Step 3:** Rodar o Hub inteiro. Esperado: todos passando, nenhum teste muda.
- [ ] **Step 4:** `git commit -m "feat(recadastro): migration das tabelas e da finalidade recadastro"`.

### Task 2: Hub, chave, identidade e `recadastro_status`

**Files:**
- Modify: `supabase/functions/gestao-hub/index.ts` (ações públicas, antes de `// --- daqui para baixo exige sessão ---`; e `me`)
- Test: `supabase/tests/gestao-hub/recadastro_status_test.ts`

**Interfaces:**
- Produces:
  - `const RECADASTRO_DIAS = 7`
  - `function recadastroLigado(): boolean`
  - `function diasRestantesRecadastro(primeiroAvisoEm: string, agora?: number): number` = `max(0, 7 - floor((agora - t) / 86_400_000))`
  - `type IdentRecad = { chave: string; origem: "clinica" | "rh" | "hub"; authUserId: string | null; hubEmail: string | null; loginEmail: string; nome: string }`
  - `async function identificarRecadastro(admin: Admin, req: Request, body: Record<string, unknown>): Promise<IdentRecad | "isento" | null>` (ordem: `body.pagina` → sessão do Hub → JWT do projeto B com `body.sistema`)
  - `type StatusRecadastro = { pendente: boolean; bloquear: boolean; dias_restantes: number }`
  - ação `recadastro_status` e campo `recadastro: StatusRecadastro` na resposta de `me`.

- [ ] **Step 1:** Escrever os testes, com `Deno.env.set/delete("GESTAO_RECADASTRO")` e relógio injetado por linhas de `fa_gestao_recadastro_estado` com `primeiro_aviso_em` antigo:
  - `desligado_responde_nao_pendente`
  - `jwt_de_outro_projeto_ou_quiosque_ou_banido_recusado` (401/isento, sem linha de estado)
  - `primeira_consulta_cria_estado_e_diz_7_dias`
  - `dia_6_ainda_adia`, `dia_7_e_dia_8_bloqueiam`
  - `conflito_aberto_nunca_bloqueia`
  - `ja_concluido_nao_pendente`
  - `me_do_hub_traz_recadastro`
- [ ] **Step 2:** Rodar. Esperado: FAIL.
- [ ] **Step 3:** Implementar as assinaturas acima. Isenção: `app_metadata.role` termina em `_unit` ou é `intern`, `profiles.role = 'responsavel'` (consulta ao projeto B), `banned_until` no futuro, `profiles.active = false`.
- [ ] **Step 4:** Rodar o Hub inteiro. Esperado: PASS.
- [ ] **Step 5:** `git commit -m "feat(recadastro): status, identidade e prazo no Hub"`.

### Task 3: Hub, `recadastro_ticket` e `recadastro_consultar`

**Files:**
- Modify: `index.ts` · Test: `supabase/tests/gestao-hub/recadastro_ticket_test.ts`

**Interfaces:**
- Consumes: `identificarRecadastro`, `recadastroLigado`, `sha256Hex`, `randomHex`, `auditar`, `HUB_URL`.
- Produces: `recadastro_ticket` (entrada `{sistema}` + Bearer do projeto B; saída `{ url: string }` com `…/#recadastro&c=<código>`, 2 min); `recadastro_consultar` (entrada `{c}` ou sessão do Hub; saída `{ nome, dias_restantes, bloquear, voltar_url, pagina }`, com `pagina` = token de 30 min; **nunca** devolve CPF nem e-mail já cadastrados).

- [ ] **Step 1:** Testes: `ticket_valido_vira_pagina_uma_vez` (segunda troca dá 410), `ticket_expirado_2_min`, `ticket_de_isento_recusado`, `consultar_nao_vaza_cpf_nem_email`, `voltar_url_aponta_para_o_sistema_certo`, `pagina_expira_em_30_min`.
- [ ] **Step 2:** Rodar. Esperado: FAIL.
- [ ] **Step 3:** Implementar. `voltar_url` sai de `APPS[sistema]` (`baseEnv`/`baseDefault`).
- [ ] **Step 4:** Rodar o Hub inteiro. Esperado: PASS.
- [ ] **Step 5:** `git commit -m "feat(recadastro): codigo de uso unico e token de pagina"`.

### Task 4: Hub, código por e-mail e CORS

**Files:**
- Modify: `index.ts` (`enviarCodigo`, `conferirCodigo`, `corsHeaders`) · Test: `supabase/tests/gestao-hub/recadastro_codigo_test.ts`

**Interfaces:**
- Consumes: Task 3.
- Produces: `finalidade` aceita `"recadastro"` em `enviarCodigo` e `conferirCodigo`; ação `recadastro_enviar_codigo` (`{pagina|sessão, cpf, email}` → `{ challenge_id }`); função `async function conflitosRecadastro(admin: Admin, ident: IdentRecad, cpf: string, emailReal: string): Promise<"cpf_de_outra_pessoa" | "email_de_outro_login" | null>`.

- [ ] **Step 1:** Testes: `cpf_invalido_400`, `cpf_com_mascara_igual_sem_mascara`, `mais_de_3_codigos_em_15_min_429`, `cpf_de_outra_pessoa_abre_conflito_e_nao_envia`, `mesmo_cpf_e_mesmo_email_nao_e_conflito`, `email_de_outro_login_abre_conflito`, `codigo_vai_para_o_email_digitado_e_cpf_fica_em_dados`, `cors_aceita_origem_do_rh` (origens `rh.institutofacaamigos.com.br` e `porto-terapia-gestao.vercel.app`).
- [ ] **Step 2:** Rodar. Esperado: FAIL.
- [ ] **Step 3:** Implementar. Limite de pedidos por `alvo_id` com `CODES_MAX_PER_WINDOW`. Mensagem ao usuário em caso de conflito: "não foi possível concluir, o responsável foi avisado".
- [ ] **Step 4:** Rodar o Hub inteiro. Esperado: PASS.
- [ ] **Step 5:** `git commit -m "feat(recadastro): codigo por e-mail, deteccao de conflito e CORS do RH"`.

### Task 5: Hub, `recadastro_confirmar` e `recadastro_adiar`

**Files:**
- Modify: `index.ts` · Test: `supabase/tests/gestao-hub/recadastro_confirmar_test.ts`

**Interfaces:**
- Consumes: Tasks 2 a 4.
- Produces: `recadastro_confirmar` (`{challenge_id, code}` → `{ ok: true }`); `recadastro_adiar` (só enquanto `dias_restantes > 0`). Ordem do `confirmar`: (1) `conferirCodigo`; (2) `conflitosRecadastro`; (3) gravar `fa_gestao_pessoas` e `fa_gestao_pessoa_contas`; (4) se o e-mail do login é fictício, `updateUserById` (mesmo `id`) e `email_login_antes`; **se falhar, desfazer o item 3 e abrir conflito `email_de_outro_login`**; (5) `profiles.cpf` e `profiles.email` (Clínica); (6) `fa_gestao_contas.cpf` e `email_codigo` quando houver conta ligada por `email`, `login_email`, `clinica_email` ou `rh_email`; (7) `concluido_em`. Auditoria `recadastro_concluido`, `recadastro_conflito`, `recadastro_adiado`.

- [ ] **Step 1:** Testes: `email_ficticio_vira_real_mesmo_id`, `email_real_nao_muda_e_vira_contato`, `rh_nao_escreve_app_metadata`, `conta_do_hub_recebe_cpf_sem_renomear_chave`, `mesma_pessoa_dois_logins_vincula` (Review Focus 1), `troca_de_email_que_colide_nao_grava_nada` (Review Focus 3), `confirmar_duas_vezes_nao_duplica` (Review Focus 4), `codigo_errado_5_vezes_bloqueia`, `adiar_so_dentro_do_prazo`, `profiles_cpf_duplicado_vira_conflito`.
- [ ] **Step 2:** Rodar. Esperado: FAIL.
- [ ] **Step 3:** Implementar na ordem acima. Idempotência pela chave única de `fa_gestao_pessoa_contas`.
- [ ] **Step 4:** Rodar o Hub inteiro. Esperado: PASS.
- [ ] **Step 5:** `git commit -m "feat(recadastro): confirmacao com vinculo e reversao"`.

### Task 6: Hub, painel do owner

**Files:**
- Modify: `index.ts` (lista `ACOES_OWNER`, handler em `acaoOwner`) · Test: `supabase/tests/gestao-hub/recadastro_painel_test.ts`

**Interfaces:**
- Produces: `recadastro_painel` → `{ resumo: {concluidos:number, pendentes:number, bloqueados:number}, pendentes: Array<{nome:string, origem:string, dias_restantes:number}>, conflitos: Array<{id:string, motivo:string, criado_em:string, cpf:string /* mascarado */, email_informado:string}> }`; `recadastro_resolver` (`{id}` dá baixa).

- [ ] **Step 1:** Testes: `gerente_recebe_403`, `painel_conta_estados`, `cpf_vem_mascarado`, `resolver_da_baixa_e_libera_a_pessoa`.
- [ ] **Step 2:** Rodar. Esperado: FAIL. **Step 3:** Implementar. **Step 4:** Rodar o Hub inteiro. Esperado: PASS.
- [ ] **Step 5:** `git commit -m "feat(recadastro): painel e fila de conflitos do owner"`.

### Task 7: Página `#recadastro` e painel na tela

**Files:**
- Modify: `public/gestao.html` · Test: `tests/gestao-recadastro.test.mjs` (Playwright, API simulada, mesmo molde de `tests/gestao-convite.test.mjs`)

**Interfaces:**
- Consumes: ações das Tasks 2 a 6.
- Produces: tela com CPF, e-mail real, código, botão "Fazer depois" (some quando `bloquear`) e mensagens genéricas; bloco "Recadastro" em "Pessoas e acessos" para o owner. Após `login`, se `me.recadastro.pendente`, abre `#recadastro`.

- [ ] **Step 1:** Testes: `fluxo_completo_cpf_email_codigo`, `fazer_depois_some_quando_bloquear`, `erro_de_conflito_mostra_mensagem_generica`, `sem_rolagem_horizontal_390px`, `owner_ve_painel_e_resolve_conflito`, `nao_usa_innerHTML_com_dados_do_servidor`.
- [ ] **Step 2:** Rodar. Esperado: FAIL. **Step 3:** Implementar no JS puro do arquivo (`api(action, payload)`, `textContent`). **Step 4:** Rodar os 4 testes antigos mais os novos. Esperado: PASS; conferir captura em 390 px.
- [ ] **Step 5:** `git commit -m "feat(recadastro): pagina de recadastro e painel do owner"`.

### Task 8: Clínica

**Files:**
- Create: `lib/recadastro.ts`, `app/recadastro/route.ts`, `tests/recadastro.test.ts`
- Modify: `app/login/actions.ts` (`signIn`), `lib/supabase/middleware.ts`, `.env.local.example`

**Interfaces:**
- Produces (em `lib/recadastro.ts`): `type StatusRecadastro = { pendente: boolean; bloquear: boolean; dias_restantes: number }`; `cookieDoStatus(s: StatusRecadastro | null): "ok" | "pendente" | "bloquear"`; `decidirRedirecionamentoRecadastro(cookie: string | undefined, pathname: string): "recadastro" | null` (só `"bloquear"`, fora de `/recadastro`, `/login`, `/trocar-senha` e rotas públicas); `consultarStatusRecadastro(accessToken: string, fetchImpl?: typeof fetch): Promise<StatusRecadastro | null>` (timeout 3 s; `null` com a chave desligada ou em erro); `pedirTicketRecadastro(accessToken: string, fetchImpl?: typeof fetch): Promise<string | null>`.

- [ ] **Step 1:** Ler o guia de `cookies` em `node_modules/next/dist/docs/` (exigência do `AGENTS.md`).
- [ ] **Step 2:** Testes: `chave_desligada_devolve_null`, `timeout_ou_erro_devolve_null`, `cookie_do_status_mapeia`, `so_bloquear_redireciona`, `rotas_isentas_nunca_redirecionam`, `ticket_devolve_url_ou_null`.
- [ ] **Step 3:** Rodar `npm test`. Esperado: FAIL. **Step 4:** Implementar. `signIn`: depois do login, consulta o status e grava o cookie `fa_recad` (12 h, `httpOnly`); redireciona para `/recadastro` se pendente ou bloqueado, senão `/`. `app/recadastro/route.ts`: consulta de novo; se não pendente, cookie `ok` e `/`; senão pede o ticket e redireciona ao Hub. Middleware: aplica `decidirRedirecionamentoRecadastro` no ponto da troca de senha obrigatória e isenta `responsavel`.
- [ ] **Step 5:** `npm test`, `npm run typecheck`, `npx eslint` nos arquivos alterados. Esperado: limpos.
- [ ] **Step 6:** `git commit -m "feat(recadastro): redirecionamento do login da Clinica"`.

### Task 9: RH

**Files:**
- Create: `src/utils/recadastro.js`, `src/utils/recadastro.test.js`
- Modify: `src/App.jsx` (`handleSession`, ramo `role === 'supervisor'`), `.env.example`

**Interfaces:**
- Produces: `consultarStatusRecadastro(accessToken, fetchImpl = fetch): Promise<{pendente:boolean, bloquear:boolean, dias_restantes:number} | null>`; `pedirTicketRecadastro(accessToken, fetchImpl = fetch): Promise<string | null>`; `decidirRecadastro(status, jaVisto: boolean): "ir" | "seguir"` (`"ir"` se bloquear, ou se pendente e `!jaVisto`). URL base do Hub com `VITE_GESTAO_HUB_URL` e padrão `https://ivjvpdzsfjdpyabbzzuj.supabase.co/functions/v1/gestao-hub`.

- [ ] **Step 1:** Testes (vitest): `chave_desligada_seguir`, `status_null_seguir`, `pendente_primeira_vez_vai`, `pendente_ja_visto_segue`, `bloquear_sempre_vai`, `timeout_3s_devolve_null`.
- [ ] **Step 2:** Rodar `npm test`. Esperado: FAIL. **Step 3:** Implementar. `handleSession`: só para `supervisor`; `sessionStorage` guarda `fa_recad_visto` para não entrar em laço depois de "Fazer depois"; quiosques e estagiário nominal ficam fora.
- [ ] **Step 4:** Rodar `npm test` e `npm run build`. Esperado: PASS e build limpo.
- [ ] **Step 5:** `git commit -m "feat(recadastro): redirecionamento do supervisor do RH"`.

### Task 10: Revisão, PRs e implantação

- [ ] **Step 1:** Rodar tudo: Hub, tela, `npm test` e `typecheck` da Clínica, `npm test` e `build` do RH. Esperado: tudo verde.
- [ ] **Step 2:** `deno check supabase/functions/gestao-hub/index.ts` com o config de `supabase/tests/behavior-test-admin/deno.json`. Esperado: só o erro `Uint8Array` que já existia.
- [ ] **Step 3:** Pedir a uma revisão independente (agente sem o histórico) das três branches, pelos pontos do Review Focus.
- [ ] **Step 4:** Abrir três PRs em draft (Hub, Clínica, RH), cada um com a ordem de implantação e as chaves. Assinar o acompanhamento.
- [ ] **Step 5:** Depois do merge e **do aval do dono**: aplicar a migration; publicar o `gestao-hub` pelo painel (dono); conferir o publicado contra a `main`. Chaves desligadas em tudo.
- [ ] **Step 6:** Somente leitura antes de ligar: conflitos esperados (CPF e e-mail repetidos). Depois ligar na ordem Hub, Clínica, RH, com o owner testando cada uma.

## Fora deste plano
Login por CPF e aparelho confiável (Fase 2), criação de contas no Hub a partir de contas existentes, fusão de contas duplicadas.
