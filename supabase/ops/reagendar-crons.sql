-- Reagenda os crons que chamam Edge Functions protegidas por chave, lendo a chave do Vault
-- (nunca em texto no comando do job, que fica visível em cron.job).
--
-- guia-sequence: a chave é gerada AQUI, no banco (ninguém precisa ver o valor). A função a confere pela RPC
-- fa_seq_run_key_ok (migration 20261105130000). ORDEM (senão a sequência para de rodar):
--   1. Aplique a migration 20261105130000 (cria a RPC).
--   2. Rode este arquivo (cria o secret e reagenda o cron; a função antiga ignora o cabeçalho).
--   3. Só então implante a guia-sequence nova.
--
-- Para a Hotmart, a chave HOTMART_SYNC_KEY já existe e o cron já lê 'hotmart_sync_key' do Vault.

select vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'seq_run_key', 'chave do ?run=1 da guia-sequence')
where not exists (select 1 from vault.secrets where name = 'seq_run_key');

select cron.unschedule('guia-sequence-hourly');
select cron.schedule(
  'guia-sequence-hourly',
  '0 * * * *',
  $$
    select net.http_post(
      url := 'https://ivjvpdzsfjdpyabbzzuj.supabase.co/functions/v1/guia-sequence?run=1',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-run-key', (select decrypted_secret from vault.decrypted_secrets where name = 'seq_run_key')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $$
);
