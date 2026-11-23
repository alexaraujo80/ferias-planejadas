-- =====================================================================
-- Férias Planejadas — distâncias do roteiro (Google Routes API)
-- Execute depois dos scripts 1 a 3. Idempotente.
-- =====================================================================

-- Recurso por plano: distâncias calculadas só nos planos pagos (inclui o teste grátis, que é Família)
alter table public.plan_limits add column if not exists can_routes boolean not null default false;
update public.plan_limits set can_routes = (plan <> 'free');

-- Plano efetivo de uma conta, para as funções do servidor (service_role)
create or replace function public.plan_of(uid uuid) returns text
language sql stable security definer set search_path = public as $$
  select public.effective_plan(p) from public.profiles p where p.id = uid
$$;
revoke all on function public.plan_of(uuid) from public, anon, authenticated;
grant execute on function public.plan_of(uuid) to service_role;

-- Cache de rotas: a mesma sequência de paradas não é consultada de novo no Google por 30 dias.
-- Sem políticas: só o servidor (service_role) lê e grava.
create table if not exists public.route_cache (
  key text primary key,
  data jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.route_cache enable row level security;
revoke all on public.route_cache from anon, authenticated;
