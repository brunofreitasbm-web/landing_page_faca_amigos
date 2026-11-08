-- Hub de Gestão, Manutenção TI: bucket privado dos arquivos de TI (08/11/2026).
-- Guarda o script de otimização do Windows 11 e o texto de comandos (fonte em supabase/ops/ti/).
-- Privado e sem nenhuma policy em storage.objects para este bucket: ninguém lê pela API pública.
-- Só a service role (a função gestao-hub, ação ti_baixar, só para owner) gera o link assinado de 60 s.
-- Aditiva e repetível: se o bucket já existir, volta a ficar privado.
insert into storage.buckets (id, name, public, file_size_limit)
values ('ti-arquivos', 'ti-arquivos', false, 5242880)
on conflict (id) do update set public = false, file_size_limit = 5242880;
