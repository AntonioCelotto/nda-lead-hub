create extension if not exists pgcrypto;

create schema if not exists private;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'lead_status'
  ) then
    create type public.lead_status as enum (
      'new',
      'contacted',
      'booked',
      'recall',
      'closed_lost'
    );
  end if;

  if not exists (
    select 1
    from pg_type
    where typname = 'lead_priority'
  ) then
    create type public.lead_priority as enum (
      'low',
      'medium',
      'high'
    );
  end if;

  if not exists (
    select 1
    from pg_type
    where typname = 'message_direction'
  ) then
    create type public.message_direction as enum (
      'incoming',
      'outgoing',
      'system'
    );
  end if;

  if not exists (
    select 1
    from pg_type
    where typname = 'service_type'
  ) then
    create type public.service_type as enum (
      'pranzo',
      'cena'
    );
  end if;
end
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text unique,
  full_name text,
  role text not null default 'operator' check (role in ('admin', 'manager', 'operator')),
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text not null,
  email text,
  source_channel text not null,
  status public.lead_status not null default 'new',
  priority public.lead_priority not null default 'medium',
  assigned_to uuid references public.profiles (id) on delete set null,
  event_date date,
  event_type text,
  service_type public.service_type,
  guest_count integer check (guest_count is null or guest_count > 0),
  appointment_at timestamptz,
  appointment_notes text,
  last_message_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.lead_messages (
  id bigint generated always as identity primary key,
  lead_id uuid not null references public.leads (id) on delete cascade,
  direction public.message_direction not null,
  body text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.lead_notes (
  id bigint generated always as identity primary key,
  lead_id uuid not null references public.leads (id) on delete cascade,
  note text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists leads_status_idx on public.leads (status);
create index if not exists leads_assigned_to_idx on public.leads (assigned_to);
create index if not exists leads_created_at_idx on public.leads (created_at desc);
create index if not exists lead_messages_lead_id_idx on public.lead_messages (lead_id, created_at);
create index if not exists lead_notes_lead_id_idx on public.lead_notes (lead_id, created_at desc);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = coalesce(public.profiles.full_name, excluded.full_name),
    updated_at = timezone('utc', now());

  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function private.set_updated_at();

drop trigger if exists leads_set_updated_at on public.leads;
create trigger leads_set_updated_at
before update on public.leads
for each row
execute function private.set_updated_at();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function private.handle_new_user();

create or replace view public.lead_dashboard
with (security_invoker = true)
as
select
  l.id,
  l.full_name,
  l.phone,
  l.email,
  l.source_channel,
  l.status,
  l.priority,
  l.event_date,
  l.event_type,
  l.service_type,
  l.guest_count,
  l.appointment_at,
  l.appointment_notes,
  l.last_message_at,
  l.created_at,
  l.updated_at,
  l.assigned_to,
  p.full_name as assigned_to_name,
  p.email as assigned_to_email,
  (
    select count(*)
    from public.lead_messages m
    where m.lead_id = l.id
  ) as message_count,
  (
    select count(*)
    from public.lead_notes n
    where n.lead_id = l.id
  ) as note_count
from public.leads l
left join public.profiles p on p.id = l.assigned_to;

alter table public.profiles enable row level security;
alter table public.leads enable row level security;
alter table public.lead_messages enable row level security;
alter table public.lead_notes enable row level security;

drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
on public.profiles
for select
to authenticated
using (true);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (auth.uid() is not null and auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (auth.uid() is not null and auth.uid() = id)
with check (auth.uid() is not null and auth.uid() = id);

drop policy if exists "leads_select_authenticated" on public.leads;
create policy "leads_select_authenticated"
on public.leads
for select
to authenticated
using (auth.uid() is not null);

drop policy if exists "leads_insert_authenticated" on public.leads;
create policy "leads_insert_authenticated"
on public.leads
for insert
to authenticated
with check (auth.uid() is not null);

drop policy if exists "leads_update_authenticated" on public.leads;
create policy "leads_update_authenticated"
on public.leads
for update
to authenticated
using (auth.uid() is not null)
with check (auth.uid() is not null);

drop policy if exists "messages_select_authenticated" on public.lead_messages;
create policy "messages_select_authenticated"
on public.lead_messages
for select
to authenticated
using (auth.uid() is not null);

drop policy if exists "messages_insert_authenticated" on public.lead_messages;
create policy "messages_insert_authenticated"
on public.lead_messages
for insert
to authenticated
with check (auth.uid() is not null);

drop policy if exists "notes_select_authenticated" on public.lead_notes;
create policy "notes_select_authenticated"
on public.lead_notes
for select
to authenticated
using (auth.uid() is not null);

drop policy if exists "notes_insert_authenticated" on public.lead_notes;
create policy "notes_insert_authenticated"
on public.lead_notes
for insert
to authenticated
with check (auth.uid() is not null);

insert into public.leads (
  full_name,
  phone,
  email,
  source_channel,
  status,
  priority,
  event_type,
  service_type,
  guest_count
)
select
  'Mirko Bizzarri',
  '+39 346 822 7289',
  'mirko@bizzarri.life',
  'Matrimonio.com',
  'new',
  'high',
  'Matrimonio',
  'cena',
  120
where not exists (
  select 1 from public.leads where email = 'mirko@bizzarri.life'
);

insert into public.lead_messages (
  lead_id,
  direction,
  body
)
select
  l.id,
  'incoming',
  'Ciao, vorrei ricevere informazioni e fissare un appuntamento.'
from public.leads l
where l.email = 'mirko@bizzarri.life'
and not exists (
  select 1 from public.lead_messages m where m.lead_id = l.id
);
