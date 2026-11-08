-- Gestão Hub, Fase 2b: recadastro de identidade (CPF e e-mail real confirmado por código).
-- Aditiva e idempotente. Tabelas novas com RLS ligado e sem policy (só a service role acessa).

-- Pessoa identificada por CPF (só dígitos) com o e-mail real confirmado.
create table if not exists public.fa_gestao_pessoas (
  cpf text primary key,
  email_real text not null,
  nome text,
  confirmado_em timestamptz not null default now()
);

-- Logins de cada sistema ligados à pessoa. email_login_antes permite reverter a troca do e-mail fictício.
create table if not exists public.fa_gestao_pessoa_contas (
  id uuid primary key default gen_random_uuid(),
  cpf text not null references public.fa_gestao_pessoas (cpf),
  origem text not null check (origem in ('clinica', 'rh', 'hub')),
  auth_user_id uuid,
  hub_email text,
  email_login_antes text,
  criado_em timestamptz not null default now()
);
create unique index if not exists fa_gestao_pessoa_contas_origem_user_uidx
  on public.fa_gestao_pessoa_contas (origem, auth_user_id);
create unique index if not exists fa_gestao_pessoa_contas_origem_hub_email_uidx
  on public.fa_gestao_pessoa_contas (origem, hub_email);

-- Prazo de 7 dias: chave é 'b:<auth_user_id>' ou 'hub:<email>'.
create table if not exists public.fa_gestao_recadastro_estado (
  chave text primary key,
  primeiro_aviso_em timestamptz not null default now(),
  concluido_em timestamptz,
  adiado_em timestamptz
);

-- Código de uso único (guardado como hash) para abrir a página de recadastro a partir de um sistema.
create table if not exists public.fa_gestao_recadastro_tickets (
  ticket_hash text primary key,
  chave text not null,
  origem text not null check (origem in ('clinica', 'rh', 'hub')),
  auth_user_id uuid,
  hub_email text,
  login_email text,
  nome text,
  expira_em timestamptz not null,
  usado_em timestamptz,
  pagina_hash text,
  pagina_expira_em timestamptz
);
create index if not exists fa_gestao_recadastro_tickets_pagina_hash_idx
  on public.fa_gestao_recadastro_tickets (pagina_hash);

-- Conflitos que o owner resolve à mão (sem fusão automática).
create table if not exists public.fa_gestao_recadastro_conflitos (
  id uuid primary key default gen_random_uuid(),
  chave text not null,
  motivo text not null check (motivo in ('cpf_de_outra_pessoa', 'email_de_outro_login')),
  cpf_informado text,
  email_informado text,
  criado_em timestamptz not null default now(),
  resolvido_em timestamptz
);

alter table public.fa_gestao_pessoas enable row level security;
alter table public.fa_gestao_pessoa_contas enable row level security;
alter table public.fa_gestao_recadastro_estado enable row level security;
alter table public.fa_gestao_recadastro_tickets enable row level security;
alter table public.fa_gestao_recadastro_conflitos enable row level security;

-- Desafios por e-mail passam a aceitar a finalidade 'recadastro' e a guardar os dados pendentes de confirmação.
alter table public.fa_gestao_desafios drop constraint if exists fa_gestao_desafios_finalidade_check;
alter table public.fa_gestao_desafios
  add constraint fa_gestao_desafios_finalidade_check
  check (finalidade in ('login', 'reset', 'recadastro'));
alter table public.fa_gestao_desafios
  add column if not exists dados jsonb;
