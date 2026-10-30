-- =====================================================================
-- Férias Planejadas — Fase 3: viagens compartilhadas em família
-- Execute DEPOIS de schema.sql e 002_planos_stripe.sql.
-- Idempotente: pode ser executado de novo sem perder dados.
--
-- Modelo: os registros de uma viagem continuam gravados com user_id = organizador
-- (dono da viagem). Quem mais pode ler ou alterar é decidido por trip_members + papel.
-- Despesas privadas (is_private) só são visíveis para quem as cadastrou — nem o
-- organizador vê os detalhes; os demais recebem apenas a soma (my_shared_context).
-- =====================================================================

-- ---------- Autor de cada registro ----------
do $$
declare t text;
begin
  foreach t in array array['budget_items','quotes','bookings','payments','expenses','itinerary_items','redemptions','attachments','audit_logs'] loop
    execute format('alter table public.%I add column if not exists created_by uuid default auth.uid()', t);
    execute format('update public.%I set created_by = user_id where created_by is null', t);
  end loop;
end $$;
alter table public.expenses add column if not exists is_private boolean not null default false;

-- O autor nunca muda depois de criado.
create or replace function public.keep_created_by() returns trigger language plpgsql as $$
begin new.created_by := old.created_by; return new; end $$;
do $$
declare t text;
begin
  foreach t in array array['budget_items','quotes','bookings','payments','expenses','itinerary_items','redemptions','attachments','audit_logs'] loop
    execute format('drop trigger if exists keep_author_%1$s on public.%1$s', t);
    execute format('create trigger keep_author_%1$s before update on public.%1$s for each row execute function public.keep_created_by()', t);
  end loop;
end $$;

-- ---------- Membros e convites ----------
create table if not exists public.trip_members (
  trip_owner uuid not null,
  trip_id text not null,
  member_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'participante', 'leitor')),
  traveler_name text,
  invited_by uuid,
  created_at timestamptz not null default now(),
  primary key (trip_owner, trip_id, member_id),
  foreign key (trip_owner, trip_id) references public.trips(user_id, id) on delete cascade
);
create index if not exists trip_members_member_idx on public.trip_members (member_id);

create table if not exists public.trip_invites (
  token uuid primary key default gen_random_uuid(),
  trip_owner uuid not null,
  trip_id text not null,
  role text not null check (role in ('editor', 'participante', 'leitor')),
  traveler_name text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  revoked boolean not null default false,
  foreign key (trip_owner, trip_id) references public.trips(user_id, id) on delete cascade
);

-- ---------- Papel do usuário atual em uma viagem ----------
-- Se o organizador sair do plano Família, os convidados passam a apenas visualizar.
create or replace function public.trip_role(p_owner uuid, p_trip text) returns text
language sql stable security definer set search_path = public as $$
  select case
    when p_owner = auth.uid() then 'owner'
    else (
      select case when coalesce((public.my_limits(p_owner)).max_members_per_trip, 0) > 0 then m.role else 'leitor' end
      from public.trip_members m
      where m.trip_owner = p_owner and m.trip_id = p_trip and m.member_id = auth.uid() and m.role <> 'owner'
    )
  end
$$;
revoke all on function public.trip_role(uuid, text) from public, anon;
grant execute on function public.trip_role(uuid, text) to authenticated;

-- ---------- RLS por papel ----------
-- Remove as políticas "só o dono" das tabelas de viagem (schema.sql não as recria depois disto).
do $$
declare t text;
begin
  foreach t in array array['trips','budget_items','quotes','bookings','payments','expenses','itinerary_items','redemptions','attachments','audit_logs'] loop
    execute format('drop policy if exists "proprio_select" on public.%I', t);
    execute format('drop policy if exists "proprio_insert" on public.%I', t);
    execute format('drop policy if exists "proprio_update" on public.%I', t);
    execute format('drop policy if exists "proprio_delete" on public.%I', t);
    execute format('drop policy if exists "membro_select" on public.%I', t);
    execute format('drop policy if exists "membro_insert" on public.%I', t);
    execute format('drop policy if exists "membro_update" on public.%I', t);
    execute format('drop policy if exists "membro_delete" on public.%I', t);
  end loop;
end $$;

-- Viagem: membros leem; organizador e editores alteram; só o organizador cria e exclui.
create policy "membro_select" on public.trips for select to authenticated using (user_id = (select auth.uid()) or public.trip_role(user_id, id) is not null);
-- (o upsert do editor também passa pela verificação de INSERT, por isso o papel entra aqui;
--  uma viagem nova só tem papel para o próprio dono, então ninguém cria viagem em nome de outro)
create policy "membro_insert" on public.trips for insert to authenticated with check (user_id = (select auth.uid()) or public.trip_role(user_id, id) in ('owner', 'editor'));
create policy "membro_update" on public.trips for update to authenticated using (public.trip_role(user_id, id) in ('owner', 'editor')) with check (public.trip_role(user_id, id) in ('owner', 'editor'));
create policy "membro_delete" on public.trips for delete to authenticated using (user_id = (select auth.uid()));

-- Planejamento financeiro: todos os membros leem; organizador e editores alteram.
do $$
declare t text;
begin
  foreach t in array array['budget_items','quotes','bookings','payments','redemptions','attachments'] loop
    execute format('create policy "membro_select" on public.%I for select to authenticated using (public.trip_role(user_id, trip_id) is not null)', t);
    execute format('create policy "membro_insert" on public.%I for insert to authenticated with check (public.trip_role(user_id, trip_id) in (''owner'', ''editor''))', t);
    execute format('create policy "membro_update" on public.%I for update to authenticated using (public.trip_role(user_id, trip_id) in (''owner'', ''editor'')) with check (public.trip_role(user_id, trip_id) in (''owner'', ''editor''))', t);
    execute format('create policy "membro_delete" on public.%I for delete to authenticated using (public.trip_role(user_id, trip_id) in (''owner'', ''editor''))', t);
  end loop;
end $$;

-- Roteiro: participantes também incluem atividades e alteram as próprias.
create policy "membro_select" on public.itinerary_items for select to authenticated using (public.trip_role(user_id, trip_id) is not null);
create policy "membro_insert" on public.itinerary_items for insert to authenticated with check (public.trip_role(user_id, trip_id) in ('owner', 'editor', 'participante') and created_by = (select auth.uid()));
create policy "membro_update" on public.itinerary_items for update to authenticated
  using (public.trip_role(user_id, trip_id) in ('owner', 'editor') or (created_by = (select auth.uid()) and public.trip_role(user_id, trip_id) = 'participante'))
  with check (public.trip_role(user_id, trip_id) in ('owner', 'editor', 'participante'));
create policy "membro_delete" on public.itinerary_items for delete to authenticated
  using (public.trip_role(user_id, trip_id) in ('owner', 'editor') or (created_by = (select auth.uid()) and public.trip_role(user_id, trip_id) = 'participante'));

-- Despesas: privadas só para quem cadastrou. Participantes lançam e alteram as próprias.
create policy "membro_select" on public.expenses for select to authenticated
  using (public.trip_role(user_id, trip_id) is not null and (not is_private or created_by = (select auth.uid())));
create policy "membro_insert" on public.expenses for insert to authenticated
  with check (public.trip_role(user_id, trip_id) in ('owner', 'editor', 'participante') and created_by = (select auth.uid()));
create policy "membro_update" on public.expenses for update to authenticated
  using ((not is_private and public.trip_role(user_id, trip_id) in ('owner', 'editor')) or (created_by = (select auth.uid()) and public.trip_role(user_id, trip_id) in ('owner', 'editor', 'participante')))
  with check ((not is_private or created_by = (select auth.uid())) and public.trip_role(user_id, trip_id) in ('owner', 'editor', 'participante'));
create policy "membro_delete" on public.expenses for delete to authenticated
  using ((not is_private and public.trip_role(user_id, trip_id) in ('owner', 'editor')) or (created_by = (select auth.uid()) and public.trip_role(user_id, trip_id) in ('owner', 'editor', 'participante')));

-- Histórico: membros leem e registram nas viagens em que participam.
create policy "membro_select" on public.audit_logs for select to authenticated using (user_id = (select auth.uid()) or (trip_id is not null and public.trip_role(user_id, trip_id) is not null));
create policy "membro_insert" on public.audit_logs for insert to authenticated with check (user_id = (select auth.uid()) or (trip_id is not null and public.trip_role(user_id, trip_id) in ('owner', 'editor', 'participante')));
create policy "membro_update" on public.audit_logs for update to authenticated using (created_by = (select auth.uid())) with check (created_by = (select auth.uid()));
create policy "membro_delete" on public.audit_logs for delete to authenticated using (user_id = (select auth.uid()) or created_by = (select auth.uid()));

-- Membros e convites: leitura pela RLS; alterações só pelas funções abaixo.
alter table public.trip_members enable row level security;
alter table public.trip_members force row level security;
alter table public.trip_invites enable row level security;
alter table public.trip_invites force row level security;
drop policy if exists "membros_select" on public.trip_members;
create policy "membros_select" on public.trip_members for select to authenticated using (member_id = (select auth.uid()) or public.trip_role(trip_owner, trip_id) is not null);
drop policy if exists "convites_select" on public.trip_invites;
create policy "convites_select" on public.trip_invites for select to authenticated using (trip_owner = (select auth.uid()));
revoke all on public.trip_members, public.trip_invites from anon;
revoke insert, update, delete on public.trip_members, public.trip_invites from authenticated;
grant select on public.trip_members, public.trip_invites to authenticated;

-- ---------- Funções de compartilhamento ----------
create or replace function public.create_invite(p_trip text, p_role text, p_traveler text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare lim public.plan_limits; n integer; tok uuid;
begin
  if not exists (select 1 from public.trips where user_id = auth.uid() and id = p_trip) then raise exception 'SEM_PERMISSAO'; end if;
  if p_role not in ('editor', 'participante', 'leitor') then raise exception 'PAPEL_INVALIDO'; end if;
  lim := public.my_limits(auth.uid());
  if coalesce(lim.max_members_per_trip, 0) = 0 then raise exception 'LIMITE_COMPARTILHAR'; end if;
  insert into public.trip_members (trip_owner, trip_id, member_id, role) values (auth.uid(), p_trip, auth.uid(), 'owner') on conflict do nothing;
  select count(*) into n from public.trip_members where trip_owner = auth.uid() and trip_id = p_trip and member_id <> auth.uid();
  n := n + (select count(*) from public.trip_invites where trip_owner = auth.uid() and trip_id = p_trip and accepted_by is null and not revoked and expires_at > now());
  if n >= lim.max_members_per_trip - 1 then raise exception 'LIMITE_MEMBROS'; end if;
  insert into public.trip_invites (trip_owner, trip_id, role, traveler_name) values (auth.uid(), p_trip, p_role, nullif(trim(p_traveler), '')) returning token into tok;
  return tok;
end $$;

create or replace function public.accept_invite(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare inv public.trip_invites; lim public.plan_limits; n integer;
begin
  select * into inv from public.trip_invites where token = p_token for update;
  if not found or inv.revoked then raise exception 'CONVITE_INVALIDO'; end if;
  if inv.trip_owner = auth.uid() then raise exception 'CONVITE_PROPRIO'; end if;
  if inv.accepted_by is not null and inv.accepted_by <> auth.uid() then raise exception 'CONVITE_USADO'; end if;
  if inv.accepted_by is null and inv.expires_at < now() then raise exception 'CONVITE_EXPIRADO'; end if;
  if not exists (select 1 from public.trip_members where trip_owner = inv.trip_owner and trip_id = inv.trip_id and member_id = auth.uid()) then
    lim := public.my_limits(inv.trip_owner);
    if coalesce(lim.max_members_per_trip, 0) = 0 then raise exception 'LIMITE_COMPARTILHAR'; end if;
    select count(*) into n from public.trip_members where trip_owner = inv.trip_owner and trip_id = inv.trip_id and member_id <> inv.trip_owner;
    if n >= lim.max_members_per_trip - 1 then raise exception 'LIMITE_MEMBROS'; end if;
    insert into public.trip_members (trip_owner, trip_id, member_id, role, traveler_name, invited_by)
    values (inv.trip_owner, inv.trip_id, auth.uid(), inv.role, inv.traveler_name, inv.trip_owner);
  end if;
  update public.trip_invites set accepted_by = auth.uid(), accepted_at = coalesce(accepted_at, now()) where token = p_token;
  return jsonb_build_object('owner', inv.trip_owner, 'trip_id', inv.trip_id, 'role', inv.role,
    'name', (select data->>'name' from public.trips where user_id = inv.trip_owner and id = inv.trip_id));
end $$;

create or replace function public.update_member(p_trip text, p_member uuid, p_role text, p_traveler text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.trips where user_id = auth.uid() and id = p_trip) then raise exception 'SEM_PERMISSAO'; end if;
  if p_member = auth.uid() then
    insert into public.trip_members (trip_owner, trip_id, member_id, role, traveler_name) values (auth.uid(), p_trip, auth.uid(), 'owner', nullif(trim(p_traveler), ''))
    on conflict (trip_owner, trip_id, member_id) do update set traveler_name = excluded.traveler_name;
    return;
  end if;
  if p_role not in ('editor', 'participante', 'leitor') then raise exception 'PAPEL_INVALIDO'; end if;
  update public.trip_members set role = p_role, traveler_name = nullif(trim(p_traveler), '')
   where trip_owner = auth.uid() and trip_id = p_trip and member_id = p_member;
end $$;

-- O organizador remove alguém; qualquer membro pode sair sozinho.
create or replace function public.remove_member(p_owner uuid, p_trip text, p_member uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_member = p_owner then raise exception 'SEM_PERMISSAO'; end if;
  if auth.uid() <> p_owner and auth.uid() <> p_member then raise exception 'SEM_PERMISSAO'; end if;
  delete from public.trip_members where trip_owner = p_owner and trip_id = p_trip and member_id = p_member;
end $$;

create or replace function public.revoke_invite(p_token uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.trip_invites set revoked = true where token = p_token and trip_owner = auth.uid() and accepted_by is null;
end $$;

-- Contexto das viagens compartilhadas: papel, membros e SOMA das despesas privadas dos outros.
create or replace function public.my_shared_context() returns jsonb
language sql stable security definer set search_path = public as $$
  with mine as (
    select distinct m.trip_owner as owner, m.trip_id
    from public.trip_members m
    where m.member_id = auth.uid() and (m.role = 'owner' or exists (select 1 from public.trips t where t.user_id = m.trip_owner and t.id = m.trip_id))
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'owner', x.owner,
    'trip_id', x.trip_id,
    'my_role', public.trip_role(x.owner, x.trip_id),
    'members', (
      select jsonb_agg(jsonb_build_object('member_id', m.member_id, 'email', u.email, 'role', m.role, 'traveler_name', m.traveler_name) order by (m.role = 'owner') desc, m.created_at)
      from public.trip_members m join auth.users u on u.id = m.member_id
      where m.trip_owner = x.owner and m.trip_id = x.trip_id),
    'private_totals', (
      select jsonb_build_object(
        'realized', coalesce(sum(nullif(e.data->>'amount', '')::numeric) filter (where e.data->>'status' in ('realizada', 'paga', 'pendente')), 0),
        'paid', coalesce(sum(nullif(e.data->>'amount', '')::numeric) filter (where e.data->>'status' = 'paga'), 0),
        'pending', coalesce(sum(nullif(e.data->>'amount', '')::numeric) filter (where e.data->>'status' in ('realizada', 'pendente')), 0))
      from public.expenses e
      where e.user_id = x.owner and e.trip_id = x.trip_id and e.is_private and e.created_by is distinct from auth.uid())
  )), '[]'::jsonb)
  from mine x
$$;

do $$
declare f text;
begin
  foreach f in array array['create_invite(text, text, text)', 'accept_invite(uuid)', 'update_member(text, uuid, text, text)', 'remove_member(uuid, text, uuid)', 'revoke_invite(uuid)', 'my_shared_context()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ---------- Atualização ao vivo (Supabase Realtime) ----------
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['trips','budget_items','quotes','bookings','payments','expenses','itinerary_items','attachments','trip_members'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
