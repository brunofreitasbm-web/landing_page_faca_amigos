-- Gestão Hub: o token do convite passa a ser guardado só como hash SHA-256 (como fa_gestao_sessoes).
-- Aditiva e idempotente: convites pendentes ganham o hash a partir do token em claro e continuam abrindo.
-- O token em claro dos convites antigos fica até uma limpeza futura; os novos já nascem sem ele.

create extension if not exists pgcrypto;

alter table public.fa_gestao_convites
  add column if not exists token_hash text;

update public.fa_gestao_convites
   set token_hash = encode(digest(token, 'sha256'), 'hex')
 where token_hash is null
   and token is not null;

create unique index if not exists fa_gestao_convites_token_hash_idx
  on public.fa_gestao_convites (token_hash);

alter table public.fa_gestao_convites
  alter column token drop not null;

comment on column public.fa_gestao_convites.token_hash is
  'SHA-256 (hex) do token do link de convite. O token em claro só existe no link enviado.';
