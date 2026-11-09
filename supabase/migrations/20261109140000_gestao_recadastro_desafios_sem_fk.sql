-- Gestão Hub, Fase 2b: o código do recadastro vai para o e-mail real digitado pela pessoa, que ainda não é
-- conta do Hub. A chave estrangeira de fa_gestao_desafios.email para fa_gestao_contas.email recusava o insert
-- (erro 23503) e o envio do código falhava com 500. Login e reset continuam buscando a conta antes de criar o
-- desafio; desafios expiram em minutos. Idempotente. Para reverter: recriar a constraint
-- (foreign key (email) references public.fa_gestao_contas (email) on delete cascade) depois de apagar desafios órfãos.
alter table public.fa_gestao_desafios drop constraint if exists fa_gestao_desafios_email_fkey;
