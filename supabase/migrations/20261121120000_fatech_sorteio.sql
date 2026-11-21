-- Sorteio de brindes da FA Tech no evento (Belém, 21/11/2026).
-- Cadastro por QR Code (/fatech/sorteio): a pessoa recebe um número e o contato vira lead da FA Tech.
-- O navegador nunca lê esta tabela: tudo passa pela função fatech-sorteio (service role).

create table if not exists public.fa_fatech_sorteio (
  id             uuid primary key default gen_random_uuid(),
  numero         integer generated always as identity (start with 1) unique,
  nome           text not null check (char_length(nome) between 2 and 120),
  telefone       text not null unique check (telefone ~ '^55[0-9]{10,11}$'),
  email          text not null unique check (email = lower(email) and char_length(email) <= 254),
  perfil         text not null check (perfil in ('gestor_clinica', 'profissional', 'familia_outro')),
  origem         text not null default 'palestra' check (char_length(origem) <= 40),
  consentimento  boolean not null default false,
  ip_hash        text,
  email_enviado_em timestamptz,
  brevo_sync_at  timestamptz,
  sorteado_em    timestamptz,
  status_sorteio text check (status_sorteio in ('ganhou', 'ausente')),
  criado_em      timestamptz not null default now()
);

create index if not exists fa_fatech_sorteio_ip_idx on public.fa_fatech_sorteio (ip_hash, criado_em desc);
create index if not exists fa_fatech_sorteio_pool_idx on public.fa_fatech_sorteio (sorteado_em) where sorteado_em is null;

alter table public.fa_fatech_sorteio enable row level security;
revoke all on public.fa_fatech_sorteio from anon, authenticated;

-- Senha do painel: o conector não grava `supabase secrets`, então a função lê do Vault quando a variável
-- FATECH_SORTEIO_SENHA não existe. O valor NÃO fica no repositório:
--   select vault.create_secret('<senha>', 'fatech_sorteio_senha', 'Senha do painel do sorteio FA Tech');
create or replace function public.fa_fatech_sorteio_senha()
returns text
language sql
security definer
set search_path = ''
as $$
  select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'fatech_sorteio_senha' limit 1;
$$;
revoke all on function public.fa_fatech_sorteio_senha() from public, anon, authenticated;
grant execute on function public.fa_fatech_sorteio_senha() to service_role;
