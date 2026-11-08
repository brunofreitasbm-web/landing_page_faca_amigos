-- Gestão Hub, Fase 1: convite com vários sistemas (função por sistema) e pessoa identificada por CPF.
-- Aditiva e idempotente. A chave de fa_gestao_permissoes continua (email, modulo): uma função por sistema.

-- CPF da pessoa (só dígitos). Único quando informado; contas antigas ficam nulas até o recadastro (Fase 2b).
alter table public.fa_gestao_contas
  add column if not exists cpf text;
create unique index if not exists fa_gestao_contas_cpf_uidx
  on public.fa_gestao_contas (cpf) where cpf is not null;

alter table public.fa_gestao_convites
  add column if not exists cpf text;

-- Unidades em que a pessoa atua naquele sistema (código nativo de cada sistema, sem unificar).
alter table public.fa_gestao_permissoes
  add column if not exists unidades text[] not null default '{}';

-- A constraint original listava 7 módulos e deixava 'porto' de fora (o código já tem 8).
alter table public.fa_gestao_permissoes drop constraint if exists fa_gestao_permissoes_modulo_check;
alter table public.fa_gestao_permissoes
  add constraint fa_gestao_permissoes_modulo_check
  check (modulo in ('playground', 'clinica', 'financeiro', 'rh', 'cacau', 'painel', 'eventos', 'porto'));

-- Itens do convite: um por sistema, cada um com sua função e nível.
create table if not exists public.fa_gestao_convite_itens (
  convite_id uuid not null references public.fa_gestao_convites (id) on delete cascade,
  modulo text not null check (modulo in ('playground', 'clinica', 'financeiro', 'rh', 'cacau', 'painel', 'eventos', 'porto')),
  funcao text not null,
  nivel text not null check (nivel in ('ver', 'operar', 'admin')),
  papel_nativo text,
  escopo text,
  unidades text[] not null default '{}',
  primary key (convite_id, modulo)
);

alter table public.fa_gestao_convite_itens enable row level security;

comment on table public.fa_gestao_convite_itens is
  'Sistemas de um convite do Hub: cada linha dá à pessoa uma função e um nível em um sistema.';
