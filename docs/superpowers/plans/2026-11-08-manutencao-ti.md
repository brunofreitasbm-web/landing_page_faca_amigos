# Manutenção TI no Hub de Gestão Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tirar o script de otimização do Windows 11 e seus comandos da pasta pública `/fa7k2m9` e entregá-los só a owners, por um card "Manutenção TI" no Hub de Gestão.

**Architecture:** Bucket privado `ti-arquivos` no Supabase Storage. Duas ações novas em `gestao-hub` (`ti_listar`, `ti_baixar`) entram na lista `ACOES_OWNER`, que já recusa quem não é owner. `ti_baixar` devolve URL assinada de 60 s e grava auditoria. O `gestao.html` ganha um card e uma tela interna no padrão do Portal do Site.

**Tech Stack:** Deno (função Supabase, testes com `fake_supabase.ts`), Supabase Storage, HTML/JS puro em `public/gestao.html`, `vercel.json`.

**Spec:** `docs/superpowers/specs/2026-11-08-manutencao-ti-design.md`

## Global Constraints

- Só `papel = owner` vê o card e chama as ações. Não mexer em `APPS`, `APP_IDS`, `carregarNiveis`, `launch`, `conta_salvar` nem no provisionamento.
- Bucket `ti-arquivos`, `public = false`, sem policy de leitura para `anon` ou `authenticated`.
- URL assinada de 60 s. Evento de auditoria `ti_download` (e-mail, id do arquivo, IP) via `auditar(...)`.
- Catálogo fixo com 2 arquivos: `otimizar-win11.ps1` (versão `2026.11.04-3`, SHA256 `71d1dde0cf4ecbce6413067b5f5d7184b54852b68df243287554bd1ce045f5e8`, 21725 bytes) e `comandos-otimizar.txt`.
- Os papéis de parede não vão para o Hub nem para o Storage. O ZIP é excluído do repositório.
- Nenhuma reescrita do histórico do git.
- Texto de interface em português, sem travessões.
- Testes seguem `supabase/tests/gestao-hub/` e rodam com:
  `deno test --no-check --config supabase/tests/gestao-hub/deno.json --allow-env supabase/tests/gestao-hub`

## Review Focus

- `id` com caminho (`../otimizar-win11.ps1`, `otimizar-win11.ps1/..`): 404, nada é assinado. Pinado na Task 2.
- `id` ausente, número ou objeto no corpo: 404, sem exceção. Pinado na Task 2.
- Objeto ainda não enviado ao bucket (Storage devolve erro): 502 legível, sem auditoria de sucesso e sem o nome do bucket na resposta. Pinado na Task 2.
- Token de sessão expirado ou inexistente: 401 também nas ações novas. Pinado na Task 2.
- Tamanho e SHA256 do catálogo diferentes dos arquivos reais (alguém bumpa o script e esquece o catálogo). Pinado na Task 2.
- Link antigo com caminho profundo (`/fa7k2m9/otimizar-win11.ps1`) cai no Hub, não em 404. Pinado na Task 5.

## File Structure

- `supabase/ops/ti/otimizar-win11.ps1`, `supabase/ops/ti/comandos-otimizar.txt` (novos locais, fora de `public/`): fonte dos arquivos que o dono envia ao bucket.
- `supabase/functions/gestao-hub/index.ts`: catálogo e as duas ações.
- `supabase/tests/gestao-hub/fake_supabase.ts` e `gestao_hub_test.ts`: Storage simulado e testes.
- `supabase/migrations/20261108120000_ti_arquivos_bucket.sql`: bucket privado.
- `public/gestao.html`: card, tela e JS.
- `vercel.json`, `public/fa7k2m9/` (removida), `PUBLICAR.md`, `MAPA-DO-SITE.md`, `docs/CODEBASE_MAP.md`.

---

### Task 1: Mover os arquivos de TI e reescrever os comandos

**Files:**
- Move: `public/fa7k2m9/otimizar-win11.ps1` e `public/fa7k2m9/comandos-otimizar.txt` para `supabase/ops/ti/`
- Modify: `supabase/ops/ti/comandos-otimizar.txt`

**Interfaces:**
- Produces: os dois arquivos em `supabase/ops/ti/` com tamanho e SHA256 finais, que a Task 2 copia para o catálogo.

- [ ] **Step 1: Mover com `git mv`** os dois arquivos para `supabase/ops/ti/` (criar a pasta). O `.ps1` não muda.
- [ ] **Step 2: Reescrever `comandos-otimizar.txt`.** Manter o cabeçalho (versão e hash esperado do `.ps1`). Trocar o BLOCO A e o BLOCO B: em vez de `Invoke-WebRequest https://institutofacaamigos.com.br/fa7k2m9/...`, o passo 1 passa a ser "Entre no Hub de Gestão como owner, abra Manutenção TI e baixe `otimizar-win11.ps1` para a pasta Downloads". O bloco A conta com o arquivo já em `$env:USERPROFILE\Downloads`, confere com `Get-FileHash` contra `$esperado` (mesmo hash) e roda `powershell -ExecutionPolicy Bypass -File .\otimizar-win11.ps1` só se bater. O bloco B só confere o hash e mostra `Select-String ... 'ScriptVersao ='`. Nenhuma linha do arquivo pode conter `fa7k2m9`.
- [ ] **Step 3: Verificar.** Run: `grep -c fa7k2m9 supabase/ops/ti/comandos-otimizar.txt` Expected: `0`. Run: `sha256sum supabase/ops/ti/otimizar-win11.ps1` Expected: `71d1dde0cf4ecbce6413067b5f5d7184b54852b68df243287554bd1ce045f5e8`.
- [ ] **Step 4: Anotar** `stat -c %s` e `sha256sum` do `comandos-otimizar.txt` final. A Task 2 precisa desses dois valores.
- [ ] **Step 5: Commit**

```bash
git add -A supabase/ops/ti public/fa7k2m9
git commit -m "Move arquivos de TI para supabase/ops/ti e reescreve os comandos"
```

---

### Task 2: Ações `ti_listar` e `ti_baixar` no `gestao-hub`

**Files:**
- Modify: `supabase/functions/gestao-hub/index.ts` (lista `ACOES_OWNER` perto da linha 1530 e função `acaoOwner`)
- Modify: `supabase/tests/gestao-hub/fake_supabase.ts` (o `createClient` perto da linha 181)
- Test: `supabase/tests/gestao-hub/gestao_hub_test.ts`

**Interfaces:**
- Consumes: `auditar(admin, req, evento, { email, app, detalhe })`, `jsonResponse(req, obj, status)`, `acaoOwner(admin, req, body, action, dono)`, `str(v)`.
- Produces:
  - `const BUCKET_TI = "ti-arquivos"`.
  - `type ArquivoTi = { id: string; rotulo: string; descricao: string; nome: string; versao: string | null; tamanho_bytes: number; sha256: string }` e `const ARQUIVOS_TI: ArquivoTi[]` com os ids `"otimizar-win11"` e `"comandos-otimizar"`.
  - `ti_listar` devolve `{ arquivos: [{ id, rotulo, descricao, tamanho_bytes, versao, sha256 }] }` (sem `nome`).
  - `ti_baixar` com `{ id }` devolve `{ url }`.
  - Fake: `Projeto.assinaturas: Array<{ bucket: string; path: string; seconds: number; download: string | boolean | undefined }>` e `client.storage.from(bucket).createSignedUrl(path, seconds, opts)`; erro simulado quando `operacoesComErro.has("storage:createSignedUrl")`.

- [ ] **Step 1: Estender o fake.** Em `fake_supabase.ts`, adicionar `assinaturas` à classe `Projeto` e `storage: { from(bucket) { return { createSignedUrl } } }` ao objeto de `createClient`. Sucesso: `{ data: { signedUrl: "http://a/storage/<bucket>/<path>?t=x" }, error: null }` e registro em `assinaturas`. Erro: `{ data: null, error: { message: "Object not found" } }`.
- [ ] **Step 2: Escrever os testes que falham** em `gestao_hub_test.ts`. Antes, semear uma conta `gerente` `ti-gerente@t.com` e um token de sessão dela (`GTOKEN`), no mesmo estilo de `contaBase` e `fa_gestao_sessoes`. Testes:
  - `ti_listar: owner recebe os 2 arquivos, sem o campo nome`: status 200, ids `["otimizar-win11", "comandos-otimizar"]`, nenhum item com `nome`.
  - `ti_listar e ti_baixar: gerente recebe 403 e fica na auditoria como acao_owner_negada`: nenhum registro novo em `A.assinaturas`.
  - `ti_listar e ti_baixar: sem token ou com token inexistente recebem 401`.
  - `ti_baixar: owner recebe url, 60 segundos e auditoria ti_download`: `A.assinaturas.at(-1)` com `bucket "ti-arquivos"`, `path "otimizar-win11.ps1"`, `seconds 60`, `download "otimizar-win11.ps1"`; linha em `fa_gestao_auditoria` com `evento "ti_download"`, `email "bruno@t.com"`, `app "ti"`, `detalhe "otimizar-win11"`.
  - `ti_baixar: id fora do catálogo é 404 e nada é assinado`, para `"../otimizar-win11.ps1"`, `"otimizar-win11.ps1/.."`, `"nao-existe"`, `""`, `undefined`, `42` e `{}`: status 404 e `A.assinaturas.length` não muda.
  - `ti_baixar: objeto ausente no Storage é 502 sem vazar o bucket e sem auditoria de sucesso`: com `A.operacoesComErro.add("storage:createSignedUrl")`, status 502, `JSON.stringify(corpo)` não contém `ti-arquivos`, nenhum `ti_download` novo.
  - `catálogo bate com os arquivos reais`: lê `supabase/ops/ti/otimizar-win11.ps1` e `comandos-otimizar.txt` com `Deno.readFile`, calcula tamanho e SHA256 (função `sha` já existe no arquivo de teste, adaptar para bytes) e compara com `ti_listar`.
- [ ] **Step 3: Rodar e ver falhar.** Run: o comando de teste das Global Constraints. Expected: FAIL (`ação inválida`, 400).
- [ ] **Step 4: Implementar** em `index.ts`: constantes `BUCKET_TI` e `ARQUIVOS_TI` com os valores da Task 1 (os dois tamanhos e hashes); `"ti_listar"` e `"ti_baixar"` adicionados a `ACOES_OWNER`; dois blocos `if (action === ...)` em `acaoOwner`. `ti_baixar` procura o catálogo por igualdade estrita com `typeof id === "string"` (nunca monta caminho a partir da entrada), chama `admin.storage.from(BUCKET_TI).createSignedUrl(arquivo.nome, 60, { download: arquivo.nome })`; em erro devolve 502 `{ error: "não consegui gerar o link agora, tente de novo" }` e só audita depois do sucesso.
- [ ] **Step 5: Rodar e ver passar.** Run: o comando de teste das Global Constraints. Expected: todos os testes PASS, incluindo os antigos.
- [ ] **Step 6: Commit**

```bash
git add supabase/functions/gestao-hub/index.ts supabase/tests/gestao-hub
git commit -m "gestao-hub: ações ti_listar e ti_baixar (só owner, URL assinada de 60 s)"
```

---

### Task 3: Migração do bucket privado

**Files:**
- Create: `supabase/migrations/20261108120000_ti_arquivos_bucket.sql`

**Interfaces:**
- Produces: bucket `ti-arquivos` privado, que a Task 2 já usa.

- [ ] **Step 1: Escrever a migração.** `insert into storage.buckets (id, name, public, file_size_limit) values ('ti-arquivos', 'ti-arquivos', false, 5242880) on conflict (id) do update set public = false, file_size_limit = 5242880;`. Nenhuma policy em `storage.objects` para esse bucket (sem policy, só a service role lê). Comentário de cabeçalho no estilo das outras migrações explicando que a leitura é só pela função `gestao-hub`.
- [ ] **Step 2: Conferir o estilo.** Run: `ls supabase/migrations | tail -3` Expected: o novo arquivo é o último em ordem alfabética.
- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20261108120000_ti_arquivos_bucket.sql
git commit -m "Migração: bucket privado ti-arquivos"
```

---

### Task 4: Card e tela "Manutenção TI" no Hub

**Files:**
- Modify: `public/gestao.html` (grid de operações perto da linha 860, `showHub` perto da linha 1347, busca perto da linha 1413, novo `main`, JS da tela perto da linha 1573)

**Interfaces:**
- Consumes: `api(action, payload)` que devolve `{ ok, status, data }`; `showMsg(el, text)`; `hubMain`, `hubError`, `meuPapel`; as chamadas do contrato da Task 2.
- Produces: `button#btnAbrirTi.tile[data-ti]` e `main#tiMain[hidden]` com `button#voltarTiBtn`.

- [ ] **Step 1: Card.** Adicionar `<button type="button" class="tile" id="btnAbrirTi" data-ti hidden>` ao fim de `.grid-ops`, mesma estrutura de `.tile` do Portal (ícone, `.name` "Manutenção TI", `.desc` "Script de otimização do Windows 11 e comandos de instalação", `.host` "só owner"). Em `showHub`, `btnAbrirTi.hidden = meuPapel !== 'owner'`. Incluir `.tile[data-ti]` no seletor da busca (`allItems`). Acento próprio: `.tile[data-ti] { --accent: ... }` com uma cor já existente em `:root`.
- [ ] **Step 2: Tela.** `main.hub-main#tiMain[hidden]` irmão de `#portalMain`, com título "Manutenção TI", botão `#voltarTiBtn` "Voltar aos sistemas", `div#tiLista` e `div#tiErro.form-error`. Em `showHub`, esconder `tiMain` junto com as outras telas.
- [ ] **Step 3: JS.** Ao clicar no card: esconde `hubMain`, mostra `tiMain`, chama `api('ti_listar')`. Estados: "Carregando...", erro com `data.error`, e 401 tratado igual a `abrirPessoas` (volta ao login). Cada arquivo renderiza com `textContent` (nunca `innerHTML` com dados do servidor): rótulo, descrição, tamanho legível, versão se houver, SHA256 em `<code>` e botão "Baixar". O botão desabilita durante a chamada a `api('ti_baixar', { id })` e, com sucesso, faz `window.location.assign(data.url)`; em falha mostra `data.error` em `#tiErro`. `#voltarTiBtn` faz o inverso do clique do card.
- [ ] **Step 4: Verificar no navegador.** Abrir `public/gestao.html` com Playwright, interceptando a API (`page.route`) para devolver sessão owner, depois gerente. Expected: owner vê o card, abre a tela com 2 itens e o hash, "Baixar" navega para a URL devolvida; gerente não vê o card (`#btnAbrirTi` com `hidden`); `ti_baixar` com 502 mostra a mensagem do servidor e reabilita o botão. Screenshot em `deviceScaleFactor: 1` só para conferência.
- [ ] **Step 5: Commit**

```bash
git add public/gestao.html
git commit -m "Hub de Gestão: card e tela Manutenção TI (só owner)"
```

---

### Task 5: Desligar o endereço antigo e documentar o deploy

**Files:**
- Modify: `vercel.json` (bloco de headers de `/fa7k2m9/:path*` perto da linha 55, lista `redirects` no topo)
- Delete: `public/fa7k2m9/` (o que restar: `index.html` e o ZIP)
- Modify: `PUBLICAR.md`, `MAPA-DO-SITE.md`, `docs/CODEBASE_MAP.md`

**Interfaces:**
- Consumes: nada das tarefas anteriores além de os arquivos já estarem em `supabase/ops/ti/`.

- [ ] **Step 1: Redirects.** Em `vercel.json`, adicionar a `redirects`: `{ "source": "/fa7k2m9", "destination": "https://gestao.institutofacaamigos.com.br/", "permanent": true }` e o mesmo com `"source": "/fa7k2m9/:path*"`. Remover o bloco de `headers` de `/fa7k2m9/:path*`.
- [ ] **Step 2: Excluir o resto** com `git rm -r public/fa7k2m9`. Run: `ls public/fa7k2m9 2>&1` Expected: `No such file or directory`.
- [ ] **Step 3: Validar.** Run: `node -e "const j=JSON.parse(require('fs').readFileSync('vercel.json','utf8')); const r=j.redirects.filter(x=>x.source.startsWith('/fa7k2m9')); console.log(r.length, JSON.stringify(j).includes('X-Robots-Tag') )"` Expected: `2 true` (o `true` vem de outros headers que ficam). Run: `grep -rIn fa7k2m9 --exclude-dir=node_modules --exclude-dir=.git . | grep -v "^./docs/superpowers\|^./vercel.json"` Expected: sem linhas.
- [ ] **Step 4: Docs.** `PUBLICAR.md`: novo "Lote 12: Manutenção TI no Hub de Gestão (pendente)" com a ordem: (1) aplicar a migração `20261108120000_ti_arquivos_bucket.sql`; (2) enviar `supabase/ops/ti/otimizar-win11.ps1` e `comandos-otimizar.txt` ao bucket `ti-arquivos` pelo painel do Supabase, com esses nomes exatos; (3) conferir `select public from storage.buckets where id = 'ti-arquivos'` = `false`; (4) deploy de `gestao-hub` (`--no-verify-jwt`); (5) site. Teste: como owner baixar os 2 arquivos e conferir o hash; como gerente confirmar que o card não aparece e que chamar `ti_baixar` direto dá 403; abrir `/fa7k2m9/otimizar-win11.ps1` e cair no login do Hub. Avisar que o ZIP continua no histórico do git. `MAPA-DO-SITE.md` e `docs/CODEBASE_MAP.md`: uma linha em cada sobre o card e a pasta `supabase/ops/ti/`.
- [ ] **Step 5: Rodar tudo.** Run: o comando de teste das Global Constraints e `npm run check` se existir em `package.json`. Expected: PASS.
- [ ] **Step 6: Commit**

```bash
git add -A vercel.json public PUBLICAR.md MAPA-DO-SITE.md docs/CODEBASE_MAP.md
git commit -m "Desliga /fa7k2m9 (redirect para o Hub) e documenta o deploy da Manutenção TI"
```
