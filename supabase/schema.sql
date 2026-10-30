-- =====================================================================
-- Férias Planejadas — schema do Supabase
-- Execute uma vez em: Supabase > SQL Editor > New query > Run
-- O script é idempotente (pode ser executado novamente sem perder dados).
-- =====================================================================

-- ---------- Perfil e planos (estrutura para o SaaS; sem cobrança nesta versão) ----------
create table if not exists public.plan_limits (
  plan text primary key,
  max_trips integer,               -- null = sem limite
  max_quotes_per_trip integer,
  storage_mb integer,
  description text
);
insert into public.plan_limits (plan, max_trips, max_quotes_per_trip, storage_mb, description)
values ('free', null, null, 0, 'Uso pessoal. Limites ainda não aplicados nesta versão.')
on conflict (plan) do nothing;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free' references public.plan_limits(plan),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin insert into public.profiles (id) values (new.id) on conflict (id) do nothing; return new; end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- perfis de contas criadas antes do gatilho
insert into public.profiles (id) select id from auth.users on conflict (id) do nothing;

-- ---------- Viagens ----------
create table if not exists public.trips (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- ---------- Programas de benefícios (valem para todas as viagens) ----------
create table if not exists public.loyalty_programs (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- Itens do planejamento: previsto e contratado por categoria
create table if not exists public.budget_items (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  trip_id text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, trip_id) references public.trips(user_id, id) on delete cascade
);
create index if not exists budget_items_trip_idx on public.budget_items (user_id, trip_id);

-- Cotações das agências e operadoras
create table if not exists public.quotes (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  trip_id text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, trip_id) references public.trips(user_id, id) on delete cascade
);
create index if not exists quotes_trip_idx on public.quotes (user_id, trip_id);

-- Propostas selecionadas (contratações registradas pelo usuário)
create table if not exists public.bookings (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  trip_id text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, trip_id) references public.trips(user_id, id) on delete cascade
);
create index if not exists bookings_trip_idx on public.bookings (user_id, trip_id);

-- Cronograma de pagamentos e parcelas
create table if not exists public.payments (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  trip_id text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, trip_id) references public.trips(user_id, id) on delete cascade
);
create index if not exists payments_trip_idx on public.payments (user_id, trip_id);

-- Despesas realizadas, com divisão e benefício utilizado
create table if not exists public.expenses (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  trip_id text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, trip_id) references public.trips(user_id, id) on delete cascade
);
create index if not exists expenses_trip_idx on public.expenses (user_id, trip_id);

-- Roteiro: restaurantes, passeios, deslocamentos
create table if not exists public.itinerary_items (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  trip_id text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, trip_id) references public.trips(user_id, id) on delete cascade
);
create index if not exists itinerary_items_trip_idx on public.itinerary_items (user_id, trip_id);

-- Simulações e resgates de pontos e milhas
create table if not exists public.redemptions (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  trip_id text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, trip_id) references public.trips(user_id, id) on delete cascade
);
create index if not exists redemptions_trip_idx on public.redemptions (user_id, trip_id);

-- Documentos e reservas (links)
create table if not exists public.attachments (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  trip_id text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, trip_id) references public.trips(user_id, id) on delete cascade
);
create index if not exists attachments_trip_idx on public.attachments (user_id, trip_id);

-- Histórico de alterações relevantes (sobrevive à exclusão da viagem)
create table if not exists public.audit_logs (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  trip_id text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- ---------- updated_at automático ----------
do $$
declare t text;
begin
  foreach t in array array['profiles','trips','loyalty_programs','budget_items','quotes','bookings','payments','expenses','itinerary_items','redemptions','attachments','audit_logs'] loop
    execute format('drop trigger if exists touch_%1$s on public.%1$s', t);
    execute format('create trigger touch_%1$s before update on public.%1$s for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- ---------- Segurança: RLS (cada conta só enxerga e altera os próprios registros) ----------
do $$
declare t text;
begin
  foreach t in array array['trips','loyalty_programs','budget_items','quotes','bookings','payments','expenses','itinerary_items','redemptions','attachments','audit_logs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    -- se 003_compartilhamento.sql já foi aplicado, as políticas por papel ficam como estão
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'membro_select') then continue; end if;
    execute format('drop policy if exists "proprio_select" on public.%I', t);
    execute format('drop policy if exists "proprio_insert" on public.%I', t);
    execute format('drop policy if exists "proprio_update" on public.%I', t);
    execute format('drop policy if exists "proprio_delete" on public.%I', t);
    execute format('create policy "proprio_select" on public.%I for select to authenticated using (user_id = (select auth.uid()))', t);
    execute format('create policy "proprio_insert" on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t);
    execute format('create policy "proprio_update" on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('create policy "proprio_delete" on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- Perfil: o usuário lê o próprio perfil e altera apenas "settings".
-- O campo "plan" só poderá ser alterado pelo backend (service_role), nunca pelo navegador.
alter table public.profiles enable row level security;
drop policy if exists "perfil_select" on public.profiles;
drop policy if exists "perfil_update" on public.profiles;
create policy "perfil_select" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "perfil_update" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
revoke all on public.profiles from anon;
revoke insert, update, delete on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update (settings) on public.profiles to authenticated;

alter table public.plan_limits enable row level security;
drop policy if exists "planos_leitura" on public.plan_limits;
create policy "planos_leitura" on public.plan_limits for select to authenticated using (true);
revoke insert, update, delete on public.plan_limits from anon, authenticated;
