-- Confere a chave do disparo agendado da guia-sequence contra o secret 'seq_run_key' do Vault.
-- O secret é criado por ops/reagendar-crons.sql (valor aleatório gerado no banco, nunca em texto).
-- Só a service role (a Edge Function) executa; anon e authenticated não.

create or replace function public.fa_seq_run_key_ok(p_key text)
returns boolean
language sql
stable
security definer
set search_path = public, vault
as $$
  select exists (
    select 1 from vault.decrypted_secrets
    where name = 'seq_run_key' and decrypted_secret = p_key
  );
$$;

revoke all on function public.fa_seq_run_key_ok(text) from public, anon, authenticated;
grant execute on function public.fa_seq_run_key_ok(text) to service_role;
