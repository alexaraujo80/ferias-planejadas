-- =====================================================================
-- Férias Planejadas — Fase 3: planos, teste grátis, limites e Stripe
-- Execute DEPOIS do schema.sql: Supabase > SQL Editor > New query > Run
-- Idempotente: pode ser executado de novo sem perder dados.
-- =====================================================================

-- ---------- Catálogo de planos e limites (null = sem limite) ----------
alter table public.plan_limits add column if not exists name text;
alter table public.plan_limits add column if not exists sort integer not null default 0;
alter table public.plan_limits add column if not exists max_active_trips integer;
alter table public.plan_limits add column if not exists max_programs integer;
alter table public.plan_limits add column if not exists max_memberships_per_program integer;
alter table public.plan_limits add column if not exists can_edit_weights boolean not null default false;
alter table public.plan_limits add column if not exists can_import_csv boolean not null default false;
alter table public.plan_limits add column if not exists max_members_per_trip integer not null default 0;

insert into public.plan_limits (plan, name, sort, max_active_trips, max_quotes_per_trip, max_programs, max_memberships_per_program, can_edit_weights, can_import_csv, max_members_per_trip, storage_mb, description) values
  ('free',     'Gratuito', 1, 1,    3,    1,    1,    false, false, 0, 0,    'Uma viagem completa para conhecer o app'),
  ('viajante', 'Viajante', 2, null, null, null, null, true,  true,  0, 200,  'Viagens e cotações sem limite'),
  ('familia',  'Família',  3, null, null, null, null, true,  true,  6, 1024, 'Tudo do Viajante e viagem compartilhada')
on conflict (plan) do update set
  name = excluded.name, sort = excluded.sort, max_active_trips = excluded.max_active_trips,
  max_quotes_per_trip = excluded.max_quotes_per_trip, max_programs = excluded.max_programs,
  max_memberships_per_program = excluded.max_memberships_per_program, can_edit_weights = excluded.can_edit_weights,
  can_import_csv = excluded.can_import_csv, max_members_per_trip = excluded.max_members_per_trip,
  storage_mb = excluded.storage_mb, description = excluded.description;

-- ---------- Assinatura no perfil (gravada só pelo webhook, com service_role) ----------
alter table public.profiles add column if not exists trial_ends_at timestamptz;
alter table public.profiles add column if not exists stripe_customer_id text;
alter table public.profiles add column if not exists subscription_id text;
alter table public.profiles add column if not exists subscription_status text;
alter table public.profiles add column if not exists billing_interval text;
alter table public.profiles add column if not exists current_period_end timestamptz;
alter table public.profiles add column if not exists cancel_at_period_end boolean not null default false;
alter table public.profiles add column if not exists billing_event_at timestamptz;
alter table public.profiles add column if not exists last_checkout_session text;
create unique index if not exists profiles_stripe_customer_idx on public.profiles (stripe_customer_id) where stripe_customer_id is not null;

-- Teste de 14 dias do plano Família para contas novas e para as que já existem.
alter table public.profiles alter column trial_ends_at set default (now() + interval '14 days');
update public.profiles set trial_ends_at = now() + interval '14 days' where trial_ends_at is null;

-- O navegador continua podendo alterar apenas "settings" (colunas de cobrança ficam bloqueadas).
revoke insert, update, delete on public.profiles from authenticated;
grant update (settings) on public.profiles to authenticated;

-- ---------- Plano efetivo ----------
-- Ordem: teste ativo > assinatura ativa > carência de 7 dias por atraso > Pix anual válido > Gratuito.
create or replace function public.effective_plan(p public.profiles) returns text
language sql stable set search_path = public as $$
  select case
    when p.trial_ends_at is not null and p.trial_ends_at > now() then 'familia'
    when p.subscription_status in ('active', 'trialing') and p.plan in ('viajante', 'familia') then p.plan
    when p.subscription_status = 'past_due' and p.plan in ('viajante', 'familia')
         and coalesce(p.current_period_end, now()) + interval '7 days' > now() then p.plan
    when p.subscription_status = 'pago_unico' and p.current_period_end > now() then p.plan
    else 'free'
  end
$$;

create or replace function public.my_limits(uid uuid) returns public.plan_limits
language sql stable security definer set search_path = public as $$
  select l.* from public.profiles p join public.plan_limits l on l.plan = public.effective_plan(p) where p.id = uid
$$;
revoke all on function public.my_limits(uuid) from public, anon, authenticated;

create or replace function public.get_my_plan() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'plan', public.effective_plan(p),
    'paid_plan', p.plan,
    'status', p.subscription_status,
    'interval', p.billing_interval,
    'trial_ends_at', p.trial_ends_at,
    'current_period_end', p.current_period_end,
    'cancel_at_period_end', p.cancel_at_period_end,
    'has_customer', p.stripe_customer_id is not null,
    'limits', (select to_jsonb(l) from public.plan_limits l where l.plan = public.effective_plan(p)),
    'catalog', (select jsonb_agg(to_jsonb(l) order by l.sort) from public.plan_limits l where l.plan in ('free', 'viajante', 'familia'))
  )
  from public.profiles p where p.id = auth.uid()
$$;
revoke all on function public.get_my_plan() from public, anon;
grant execute on function public.get_my_plan() to authenticated;

-- ---------- Limites aplicados no banco ----------
-- Só impedem CRIAR acima do limite. Nada existente é apagado ou bloqueado ao trocar de plano.

create or replace function public.enforce_trip_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare lim public.plan_limits; n integer;
begin
  if coalesce(new.data->>'archived', 'false') = 'true' then return new; end if;
  -- upsert: o gatilho de INSERT roda mesmo quando a linha já existe; quem valida é o de UPDATE
  if tg_op = 'INSERT' and exists (select 1 from public.trips t where t.user_id = new.user_id and t.id = new.id) then return new; end if;
  -- edição de viagem que já estava ativa: sempre permitida
  if tg_op = 'UPDATE' and coalesce(old.data->>'archived', 'false') <> 'true' then return new; end if;
  if coalesce(new.data->>'demo', 'false') = 'true' then
    if exists (select 1 from public.trips t where t.user_id = new.user_id and t.id <> new.id and coalesce(t.data->>'demo', 'false') = 'true') then
      raise exception 'LIMITE_DEMO';
    end if;
    return new;
  end if;
  lim := public.my_limits(new.user_id);
  if lim.max_active_trips is null then return new; end if;
  select count(*) into n from public.trips t
   where t.user_id = new.user_id and t.id <> new.id
     and coalesce(t.data->>'archived', 'false') <> 'true' and coalesce(t.data->>'demo', 'false') <> 'true';
  if n >= lim.max_active_trips then raise exception 'LIMITE_VIAGENS'; end if;
  return new;
end $$;
drop trigger if exists limit_trips on public.trips;
create trigger limit_trips before insert or update on public.trips for each row execute function public.enforce_trip_limit();

create or replace function public.enforce_quote_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare lim public.plan_limits; n integer;
begin
  if exists (select 1 from public.quotes q where q.user_id = new.user_id and q.id = new.id) then return new; end if;
  lim := public.my_limits(new.user_id);
  if lim.max_quotes_per_trip is null then return new; end if;
  select count(*) into n from public.quotes q where q.user_id = new.user_id and q.trip_id = new.trip_id;
  if n >= lim.max_quotes_per_trip then raise exception 'LIMITE_COTACOES'; end if;
  return new;
end $$;
drop trigger if exists limit_quotes on public.quotes;
create trigger limit_quotes before insert on public.quotes for each row execute function public.enforce_quote_limit();

create or replace function public.enforce_program_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare lim public.plan_limits; n integer; m_new integer; m_old integer;
begin
  lim := public.my_limits(new.user_id);
  m_new := case when jsonb_typeof(new.data->'memberships') = 'array' then jsonb_array_length(new.data->'memberships') else 1 end;
  if tg_op = 'INSERT' then
    if exists (select 1 from public.loyalty_programs x where x.user_id = new.user_id and x.id = new.id) then return new; end if;
    if lim.max_programs is not null then
      select count(*) into n from public.loyalty_programs x where x.user_id = new.user_id;
      if n >= lim.max_programs then raise exception 'LIMITE_PROGRAMAS'; end if;
    end if;
    m_old := 0;
  else
    m_old := case when jsonb_typeof(old.data->'memberships') = 'array' then jsonb_array_length(old.data->'memberships') else 1 end;
  end if;
  if lim.max_memberships_per_program is not null and m_new > lim.max_memberships_per_program and m_new > m_old then
    raise exception 'LIMITE_ADESOES';
  end if;
  return new;
end $$;
drop trigger if exists limit_programs on public.loyalty_programs;
create trigger limit_programs before insert or update on public.loyalty_programs for each row execute function public.enforce_program_limit();
