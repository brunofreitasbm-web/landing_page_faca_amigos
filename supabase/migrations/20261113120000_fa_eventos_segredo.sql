-- Eventos: segredos lidos do Vault quando a variavel de ambiente da Edge Function nao existe (13/11/2026).
-- O conector do Supabase nao grava `supabase secrets` sem o usuario digitar o valor no painel; o Vault (criptografado)
-- ja guardava o ops_key do cron. As funcoes eventos-public/admin/dispatch leem a variavel de ambiente primeiro e,
-- se ela faltar, chamam esta funcao. Nomes aceitos: OPS_KEY (vault ops_key), EVENTOS_SECRET (eventos_secret) e
-- EVENTOS_AVISO_EMAIL (eventos_aviso_email, opcional). Só a service role executa.
create or replace function public.fa_eventos_segredo(p_nome text)
returns text
language sql
security definer
set search_path = ''
as $$
  select s.decrypted_secret
    from vault.decrypted_secrets s
   where s.name = case p_nome
     when 'OPS_KEY' then 'ops_key'
     when 'EVENTOS_SECRET' then 'eventos_secret'
     when 'EVENTOS_AVISO_EMAIL' then 'eventos_aviso_email'
   end
   limit 1;
$$;

revoke all on function public.fa_eventos_segredo(text) from public, anon, authenticated;
grant execute on function public.fa_eventos_segredo(text) to service_role;

-- Criacao dos valores (NAO fica no repositorio): vault.create_secret('<valor>', 'eventos_secret', '...') e
-- vault.update_secret(id, '<valor>') para o ops_key. Trocar eventos_secret invalida todos os links de ingresso ja enviados.
