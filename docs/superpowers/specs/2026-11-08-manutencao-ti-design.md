# Manutenção TI no Hub de Gestão

Data: 2026-11-08. Status: aprovado em conversa, aguardando revisão deste texto.

## Objetivo

Mover as ferramentas de TI da pasta pública `/fa7k2m9` para dentro do Hub de
Gestão, num card chamado **Manutenção TI**, de modo que os arquivos só sejam baixados por quem está logado
como owner (Bruno e Isabella).

## Escopo

Dentro:
- Os 2 arquivos de TI hoje em `public/fa7k2m9/`: `otimizar-win11.ps1` (versão 2026.11.04-3) e
  `comandos-otimizar.txt`.
- Card e tela interna no `public/gestao.html`.
- Duas ações novas na função `gestao-hub`.
- Bucket privado no Supabase Storage.
- Desligar o endereço público antigo.

Fora (decidido em conversa):
- Os papéis de parede (`papeis-de-parede-faca-amigos.zip`, 58 MB) não vão para o Hub. Serão excluídos do
  repositório no mesmo commit que remove a pasta. Nada deles está no banco de dados ou no Storage.
- Gerentes não veem o card. Só `papel = owner`. Não se mexe em `APPS`, `APP_IDS`, na matriz de permissões
  nem em `launch`, `conta_salvar` e provisionamento.
- Nenhuma checklist de programas instalados nas máquinas.
- Nenhuma reescrita do histórico do git. O ZIP e o script continuam nele.

## Armazenamento

- Migração nova em `supabase/migrations/` cria o bucket `ti-arquivos` com `public = false` e nenhuma policy
  de leitura para `anon` ou `authenticated`. Só a service role (usada por `gestao-hub`) acessa.
- Catálogo fixo na função, não no banco: nome do arquivo no bucket, rótulo, descrição, versão, tamanho e
  SHA256, tudo como constantes. O hash do `.ps1` já existe em `comandos-otimizar.txt`; o do `.txt` é
  calculado uma vez no upload (`sha256sum`).
- Upload inicial dos arquivos: manual pelo painel do Supabase ou por script único, fora do deploy.
- O `index.html` e o ZIP da pasta antiga são descartados (o primeiro era só a lista de links). Os arquivos saem de `public/` no mesmo commit que liga o Hub, para nunca existirem nos dois lugares.

## Backend (`supabase/functions/gestao-hub/index.ts`)

Duas ações, ambas exigem token de sessão válido e `conta.papel === "owner"`. Qualquer outro papel recebe 403.

- `ti_listar`: devolve `{ arquivos: [{ id, rotulo, descricao, tamanho_bytes, versao, sha256 }] }`.
- `ti_baixar` com `{ id }`: confere que `id` está no catálogo, gera URL assinada de 60 s com
  `createSignedUrl(nome, 60, { download: nomeOriginal })`, grava em `fa_gestao_auditoria` o evento
  `ti_download` (e-mail, id do arquivo, IP) e devolve `{ url }`. `id` fora do catálogo: 404, nada é gerado.
- Falha do Storage: 502 com mensagem legível, sem vazar o nome interno do bucket.

## Frontend (`public/gestao.html`)

- Card `.tile[data-portal]` "Manutenção TI" na seção de operações, visível só para owner (mesma lógica que o
  Hub já usa para elementos de owner). Gerente não recebe o elemento.
- Tela interna `main#tiMain[hidden]`, no mesmo padrão de `#portalMain`, com botão "Voltar aos sistemas".
- Dois itens com nome, descrição, tamanho, versão e hash SHA256 visível. Botão "Baixar" chama `ti_baixar` e
  inicia o download pela URL devolvida.
- Estados: carregando, erro (mensagem do servidor), sessão expirada (volta ao login, como as demais telas).

## Instruções de uso do script

`comandos-otimizar.txt` hoje baixa o `.ps1` por `Invoke-WebRequest` na URL pública, que deixa de existir.
O arquivo (agora guardado no bucket, não no repositório) é reescrito para: baixar o `.ps1` pelo Hub, conferir
o hash com `Get-FileHash` e rodar o arquivo local. O bloco que baixava pela URL sai. Bump de `ScriptVersao`
não é necessário, o script em si não muda.

## Desligar o endereço antigo

- `vercel.json`: o header `/fa7k2m9/:path*` sai e entra um redirecionamento permanente de `/fa7k2m9/:path*`
  para `https://gestao.institutofacaamigos.com.br/`. Quem tinha a URL cai no login do Hub, não num 404 seco.
- Conferido: nenhum outro arquivo do repositório referencia `/fa7k2m9` (`fatech/` incluído).

## Riscos em aberto

- O ZIP e o script permanecem no histórico do git mesmo excluídos da árvore. Se o conteúdo for sensível, reescrever o histórico é decisão separada.
- Quem já guardou a URL antiga (atalho, impresso, QR code) vai ao login do Hub em vez do arquivo.

## Testes

Seguem o padrão de `supabase/tests/gestao-hub/` (Deno, workflow `gestao-hub.yml`):
- `ti_listar` e `ti_baixar` sem token: 401.
- Ambos com conta `gerente`: 403.
- `ti_baixar` com `id` fora do catálogo: 404, sem chamar o Storage.
- `ti_baixar` com owner: devolve URL, grava auditoria, `createSignedUrl` recebe 60 s e o nome certo.
- Falha do Storage: 502 e nenhuma linha de auditoria de sucesso.
- Verificação manual no Hub depois do deploy: card visível para owner, ausente para gerente, download do `.ps1`
  e conferência do hash.
