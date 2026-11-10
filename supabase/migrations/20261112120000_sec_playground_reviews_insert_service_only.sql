-- Segurança (auditoria 2026-11-10): a policy de INSERT de fa_playground_reviews
-- não tinha `TO`, então valia para anon: qualquer pessoa gravava direto em
-- /rest/v1/fa_playground_reviews, sem passar pela validação da edge function
-- `playground-reviews`. A inserção legítima é feita pela função com a service
-- role (que ignora RLS), então basta remover a policy aberta.
-- A leitura pública de avaliações aprovadas (fa_playground_reviews_public_read)
-- não muda.
--
-- ROLLBACK:
--   create policy fa_playground_reviews_insert on public.fa_playground_reviews
--     for insert with check (approved = false);
--   grant insert on public.fa_playground_reviews to anon, authenticated;

drop policy if exists fa_playground_reviews_insert on public.fa_playground_reviews;
revoke insert, update, delete on public.fa_playground_reviews from anon, authenticated;
