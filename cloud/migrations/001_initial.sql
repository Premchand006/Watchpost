-- 001_initial.sql
-- The original v1 schema (formerly cloud/schema.sql). Kept so the migration
-- history is complete. If your project already ran the old schema.sql, it is
-- at this version: skip this file and run 002_watchpost.sql.
--
-- Only change from the original: the realtime publication step checks
-- pg_publication_tables first, so the file can be re-run without errors.
--
-- Access model: the Pi uses the service key (bypasses RLS). The dashboard uses
-- the anon key plus a signed-in user, so every read and write goes through the
-- RLS policies below.

-- profiles: one row per auth user, holds the role
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  role       text not null default 'viewer' check (role in ('admin','officer','viewer')),
  created_at timestamptz not null default now()
);

-- cameras / zones
create table if not exists public.cameras (
  id         text primary key,
  node_id    text not null default 'pi-01',
  name       text,
  role       text,
  status     text default 'online',
  last_seen  timestamptz default now()
);

create table if not exists public.zones (
  id         bigint generated always as identity primary key,
  camera_id  text references public.cameras(id) on delete cascade,
  name       text,
  polygon    jsonb,
  restricted boolean default false
);

-- people: one row per tracked identity
create table if not exists public.people (
  node_id     text not null default 'pi-01',
  track_id    integer not null,
  camera      text,
  best_frame  text,
  zone        text,
  quality     real,
  first_seen  timestamptz,
  last_seen   timestamptz,
  updated_at  timestamptz default now(),
  primary key (node_id, track_id)
);

-- events
create table if not exists public.events (
  id              bigint generated always as identity primary key,
  node_id         text not null default 'pi-01',
  type            text not null,
  camera          text,
  track_id        integer,
  severity        text default 'info',
  meta            jsonb,
  acknowledged    boolean default false,
  acknowledged_by uuid references auth.users(id),
  created_at      timestamptz not null default now()
);
create index if not exists events_created_idx on public.events (created_at desc);
create index if not exists events_sev_idx on public.events (severity);

-- audit log
create table if not exists public.audit_log (
  id         bigint generated always as identity primary key,
  user_id    uuid references auth.users(id),
  action     text,
  detail     jsonb,
  created_at timestamptz not null default now()
);

-- Signup creates a profile. First account is admin, the rest are viewers.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare n int;
begin
  select count(*) into n from public.profiles;
  insert into public.profiles (id, email, role)
  values (new.id, new.email, case when n = 0 then 'admin' else 'viewer' end);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.user_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

-- Row-level security
alter table public.profiles  enable row level security;
alter table public.cameras   enable row level security;
alter table public.zones     enable row level security;
alter table public.people    enable row level security;
alter table public.events    enable row level security;
alter table public.audit_log enable row level security;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select
  using (id = auth.uid() or public.user_role() = 'admin');
drop policy if exists profiles_admin_write on public.profiles;
create policy profiles_admin_write on public.profiles for update
  using (public.user_role() = 'admin') with check (public.user_role() = 'admin');

drop policy if exists cameras_read on public.cameras;
create policy cameras_read on public.cameras for select using (auth.role() = 'authenticated');
drop policy if exists cameras_admin on public.cameras;
create policy cameras_admin on public.cameras for all
  using (public.user_role() = 'admin') with check (public.user_role() = 'admin');

drop policy if exists zones_read on public.zones;
create policy zones_read on public.zones for select using (auth.role() = 'authenticated');
drop policy if exists zones_admin on public.zones;
create policy zones_admin on public.zones for all
  using (public.user_role() = 'admin') with check (public.user_role() = 'admin');

drop policy if exists people_read on public.people;
create policy people_read on public.people for select using (auth.role() = 'authenticated');

drop policy if exists events_read on public.events;
create policy events_read on public.events for select using (auth.role() = 'authenticated');
drop policy if exists events_ack on public.events;
create policy events_ack on public.events for update
  using (public.user_role() in ('admin','officer'))
  with check (public.user_role() in ('admin','officer'));

drop policy if exists audit_admin_read on public.audit_log;
create policy audit_admin_read on public.audit_log for select using (public.user_role() = 'admin');
drop policy if exists audit_self_insert on public.audit_log;
create policy audit_self_insert on public.audit_log for insert with check (user_id = auth.uid());

-- Realtime
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['events', 'people', 'cameras'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- Storage buckets (v1: snapshots was public; 002 makes it private)
insert into storage.buckets (id, name, public)
values ('best-frames', 'best-frames', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('snapshots', 'snapshots', true)
on conflict (id) do nothing;

drop policy if exists read_best_frames on storage.objects;
create policy read_best_frames on storage.objects for select
  using (bucket_id = 'best-frames' and auth.role() = 'authenticated');

-- Seed the three cameras
insert into public.cameras (id, name, role) values
  ('cam-01', 'MX Brio 4K',           'identity'),
  ('cam-02', 'AR0234 Global Shutter', 'detect'),
  ('cam-03', 'IMX678 Low-Light',     'perimeter')
on conflict (id) do nothing;
