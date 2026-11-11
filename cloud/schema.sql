-- Watchpost: cloud/schema.sql
--
-- Full schema for a new Supabase project. Paste it into the SQL editor and run.
-- Safe to run again. For a project that already ran the v1 schema, use
-- cloud/migrations/002_watchpost.sql instead.
--
-- Access model: the Pi writes with the service key, which bypasses RLS. The
-- dashboard uses the anon key plus a signed-in user, so every read and write
-- it makes goes through the column grants and RLS policies in this file.


-- Tables

-- One row per auth user. Holds the role.
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  role       text not null default 'viewer' check (role in ('admin', 'officer', 'viewer')),
  created_at timestamptz not null default now()
);

-- Upserted by the Pi about every 10 s.
create table if not exists public.cameras (
  id            text primary key,                -- 'cam-01'
  node_id       text not null default 'pi-01',
  name          text,
  role          text,                            -- identity | detect | perimeter
  status        text default 'offline',          -- online | offline | tamper
  last_seen     timestamptz default now(),
  fps           real,
  resolution    text,                            -- '1280x720'
  snapshot_path text                             -- path in the snapshots bucket
);

create table if not exists public.zones (
  id         bigint generated always as identity primary key,
  camera_id  text references public.cameras(id) on delete cascade,
  name       text,
  polygon    jsonb,                              -- normalized [[x,y], ...]
  restricted boolean default false
);

-- One row per tracked person. id is written by the Pi as
-- 'node:camera:session:track_id', so track ids can repeat across restarts.
create table if not exists public.people (
  id          text primary key,
  node_id     text not null default 'pi-01',
  track_id    integer not null,
  camera      text,
  best_frame  text,                              -- path in the best-frames bucket
  zone        text,
  quality     real,
  dwell_s     real,
  first_seen  timestamptz,
  last_seen   timestamptz,
  updated_at  timestamptz default now()
);

-- Detections, zone rules and camera health. The dashboard streams these.
-- meta by type: enter {conf, zone}, intrusion {zone}, loiter {zone, dwell_s},
-- exit {dwell_s}, tamper {reason, score}.
create table if not exists public.events (
  id              bigint generated always as identity primary key,
  node_id         text not null default 'pi-01',
  type            text not null,
  camera          text,
  track_id        integer,
  person_id       text,                          -- people.id, no FK: events can arrive first
  severity        text default 'info',           -- info | warning | critical
  meta            jsonb,
  acknowledged    boolean default false,
  acknowledged_by uuid references auth.users(id) on delete set null,
  acknowledged_at timestamptz,
  created_at      timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'events_type_check' and conrelid = 'public.events'::regclass
  ) then
    alter table public.events add constraint events_type_check
      check (type in ('enter', 'exit', 'intrusion', 'loiter', 'offline', 'online', 'tamper'))
      not valid;
  end if;
  -- On a new project there are no old rows, so this validates at once. If
  -- old 'telemetry' rows exist the constraint stays NOT VALID (new rows are
  -- still checked).
  begin
    alter table public.events validate constraint events_type_check;
  exception when check_violation then
    raise notice 'events_type_check left NOT VALID: old rows use other types';
  end;
end $$;

-- Node health, inserted by the Pi every 5 s and pruned hourly.
create table if not exists public.telemetry (
  id         bigint generated always as identity primary key,
  node_id    text not null default 'pi-01',
  cpu        real,                               -- percent
  mem        real,                               -- percent
  temp       real,                               -- SoC temperature, C
  latency_ms real,                               -- inference latency
  fps        jsonb,                              -- {"cam-01": 9.8, ...}
  created_at timestamptz not null default now()
);

create table if not exists public.audit_log (
  id         bigint generated always as identity primary key,
  user_id    uuid references auth.users(id) on delete set null,
  action     text,                               -- login | logout | ack_alert | config_change
  detail     jsonb,
  created_at timestamptz not null default now()
);


-- Indexes for the dashboard's common queries
create index if not exists events_created_idx     on public.events (created_at desc);
create index if not exists events_sev_idx         on public.events (severity);
create index if not exists events_type_created_idx   on public.events (type, created_at desc);
create index if not exists events_camera_created_idx on public.events (camera, created_at desc);
create index if not exists events_person_idx      on public.events (person_id);
create index if not exists people_last_seen_idx   on public.people (last_seen desc);
create index if not exists telemetry_created_idx  on public.telemetry (created_at desc);
create index if not exists audit_created_idx      on public.audit_log (created_at desc);


-- Functions and triggers
--
-- "End user" below means a request carrying a signed-in user's JWT, which is
-- when auth.uid() is not null. The Pi (service key) and the SQL editor have no
-- sub claim, so they skip the per-user checks.

-- Role of the signed-in user. Used by the RLS policies.
create or replace function public.user_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

-- Signup creates a profile. The first account is admin, the rest are viewers.
-- The advisory lock stops two simultaneous first signups from both becoming admin.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform pg_advisory_xact_lock(hashtext('watchpost.profiles.role'));
  select count(*) into n from public.profiles;
  insert into public.profiles (id, email, role)
  values (new.id, new.email, case when n = 0 then 'admin' else 'viewer' end)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Role changes: nobody changes their own role, and the last admin cannot be demoted.
create or replace function public.profiles_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare other_admins int;
begin
  if new.id is distinct from old.id then
    raise exception 'profile id cannot change' using errcode = '42501';
  end if;
  if new.role is distinct from old.role then
    if auth.uid() is not null and new.id = auth.uid() then
      raise exception 'you cannot change your own role' using errcode = '42501';
    end if;
    if old.role = 'admin' then
      perform pg_advisory_xact_lock(hashtext('watchpost.profiles.role'));
      select count(*) into other_admins
      from public.profiles where role = 'admin' and id <> old.id;
      if other_admins = 0 then
        raise exception 'cannot demote the last admin' using errcode = 'P0001';
      end if;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard
  before update on public.profiles
  for each row execute function public.profiles_guard();

create or replace function public.audit_role_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (user_id, action, detail)
  values (
    auth.uid(),
    'config_change',
    jsonb_build_object(
      'email',  (select email from public.profiles where id = auth.uid()),
      'change', 'role',
      'target', new.email,
      'from',   old.role,
      'to',     new.role
    )
  );
  return new;
end $$;

drop trigger if exists profiles_audit_role on public.profiles;
create trigger profiles_audit_role
  after update of role on public.profiles
  for each row when (old.role is distinct from new.role)
  execute function public.audit_role_change();

-- Acknowledging an event. For end users the server stamps who and when, and
-- refuses edits to any other column (column grants below already block them;
-- this is the second line). Acknowledgement is one-way.
create or replace function public.events_ack_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if (new.id, new.node_id, new.type, new.camera, new.track_id, new.person_id,
      new.severity, new.meta, new.created_at)
     is distinct from
     (old.id, old.node_id, old.type, old.camera, old.track_id, old.person_id,
      old.severity, old.meta, old.created_at) then
    raise exception 'only the acknowledged flag can be changed' using errcode = '42501';
  end if;

  if coalesce(old.acknowledged, false) then
    if not coalesce(new.acknowledged, false) then
      raise exception 'an acknowledgement cannot be undone' using errcode = '42501';
    end if;
    new.acknowledged_by := old.acknowledged_by;
    new.acknowledged_at := old.acknowledged_at;
  elsif coalesce(new.acknowledged, false) then
    new.acknowledged_by := auth.uid();
    new.acknowledged_at := now();
  else
    new.acknowledged_by := null;
    new.acknowledged_at := null;
  end if;
  return new;
end $$;

drop trigger if exists events_ack_guard on public.events;
create trigger events_ack_guard
  before update on public.events
  for each row execute function public.events_ack_guard();

create or replace function public.audit_ack()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (user_id, action, detail)
  values (
    auth.uid(),
    'ack_alert',
    jsonb_build_object(
      'email',    (select email from public.profiles where id = auth.uid()),
      'event_id', new.id,
      'type',     new.type,
      'camera',   new.camera,
      'severity', new.severity
    )
  );
  return new;
end $$;

drop trigger if exists events_audit_ack on public.events;
create trigger events_audit_ack
  after update of acknowledged on public.events
  for each row
  when (new.acknowledged is true and old.acknowledged is distinct from true)
  execute function public.audit_ack();

-- Camera and zone edits made from the dashboard. The Pi's regular camera
-- upserts use the service key (no auth.uid()) and are not logged.
create or replace function public.audit_config_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  o jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  n jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  changed jsonb;
begin
  if auth.uid() is null then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(key, value) into changed
    from jsonb_each(n) where o -> key is distinct from value;
  end if;
  insert into public.audit_log (user_id, action, detail)
  values (
    auth.uid(),
    'config_change',
    jsonb_build_object(
      'email',   (select email from public.profiles where id = auth.uid()),
      'change',  tg_table_name,
      'op',      lower(tg_op),
      'id',      coalesce(n ->> 'id', o ->> 'id'),
      'fields',  changed
    )
  );
  return coalesce(new, old);
end $$;

drop trigger if exists cameras_audit on public.cameras;
create trigger cameras_audit
  after insert or update or delete on public.cameras
  for each row execute function public.audit_config_change();

drop trigger if exists zones_audit on public.zones;
create trigger zones_audit
  after insert or update or delete on public.zones
  for each row execute function public.audit_config_change();

-- people.updated_at follows every upsert
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists people_touch on public.people;
create trigger people_touch
  before update on public.people
  for each row execute function public.touch_updated_at();

-- Retention. Called by the Pi with the service key; end users cannot run these.
create or replace function public.prune_telemetry(keep_hours int default 24)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from public.telemetry
  where created_at < now() - make_interval(hours => greatest(keep_hours, 1));
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.prune_events(keep_days int default 30)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from public.events
  where created_at < now() - make_interval(days => greatest(keep_days, 1));
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function public.prune_telemetry(int) from public, anon, authenticated;
revoke execute on function public.prune_events(int)    from public, anon, authenticated;
grant  execute on function public.prune_telemetry(int) to service_role;
grant  execute on function public.prune_events(int)    to service_role;

-- Trigger functions are not meant to be called directly.
revoke execute on function public.handle_new_user()     from public, anon, authenticated;
revoke execute on function public.profiles_guard()      from public, anon, authenticated;
revoke execute on function public.audit_role_change()   from public, anon, authenticated;
revoke execute on function public.events_ack_guard()    from public, anon, authenticated;
revoke execute on function public.audit_ack()           from public, anon, authenticated;
revoke execute on function public.audit_config_change() from public, anon, authenticated;


-- Column privileges
--
-- Users may only write the columns their role needs. RLS decides which rows;
-- these grants decide which columns.
revoke update on public.events from anon, authenticated;
grant  update (acknowledged, acknowledged_by, acknowledged_at) on public.events to authenticated;

revoke update on public.profiles from anon, authenticated;
grant  update (role) on public.profiles to authenticated;

revoke insert, update, delete on public.telemetry from anon, authenticated;
grant  select on public.telemetry to authenticated;


-- Row-level security (this is the RBAC)
alter table public.profiles  enable row level security;
alter table public.cameras   enable row level security;
alter table public.zones     enable row level security;
alter table public.people    enable row level security;
alter table public.events    enable row level security;
alter table public.telemetry enable row level security;
alter table public.audit_log enable row level security;

-- profiles: read your own row, admins read all; only admins update (role only)
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.user_role() = 'admin');
drop policy if exists profiles_admin_write on public.profiles;
create policy profiles_admin_write on public.profiles for update to authenticated
  using (public.user_role() = 'admin') with check (public.user_role() = 'admin');

-- cameras / zones: any signed-in user reads; admins write
drop policy if exists cameras_read on public.cameras;
create policy cameras_read on public.cameras for select to authenticated using (true);
drop policy if exists cameras_admin on public.cameras;
create policy cameras_admin on public.cameras for all to authenticated
  using (public.user_role() = 'admin') with check (public.user_role() = 'admin');

drop policy if exists zones_read on public.zones;
create policy zones_read on public.zones for select to authenticated using (true);
drop policy if exists zones_admin on public.zones;
create policy zones_admin on public.zones for all to authenticated
  using (public.user_role() = 'admin') with check (public.user_role() = 'admin');

-- people, telemetry: read only
drop policy if exists people_read on public.people;
create policy people_read on public.people for select to authenticated using (true);

drop policy if exists telemetry_read on public.telemetry;
create policy telemetry_read on public.telemetry for select to authenticated using (true);

-- events: everyone signed in reads; admins and officers acknowledge
drop policy if exists events_read on public.events;
create policy events_read on public.events for select to authenticated using (true);
drop policy if exists events_ack on public.events;
create policy events_ack on public.events for update to authenticated
  using (public.user_role() in ('admin', 'officer'))
  with check (public.user_role() in ('admin', 'officer'));

-- audit_log: admins read. Clients may only write their own login/logout rows;
-- acks and config changes are written by the triggers above.
drop policy if exists audit_admin_read on public.audit_log;
create policy audit_admin_read on public.audit_log for select to authenticated
  using (public.user_role() = 'admin');
drop policy if exists audit_self_insert on public.audit_log;
create policy audit_self_insert on public.audit_log for insert to authenticated
  with check (user_id = auth.uid() and action in ('login', 'logout'));


-- Realtime
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['events', 'people', 'cameras', 'telemetry'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;


-- Storage
--   best-frames/{node_id}/{camera}/{person_id with ':' as '_'}.jpg
--   snapshots/{node_id}/{camera}.jpg   (overwritten about once a second)
-- Both buckets are private. Signed-in users read them through signed URLs.
-- The Pi uploads with the service key, which bypasses these policies.
insert into storage.buckets (id, name, public)
values ('best-frames', 'best-frames', false)
on conflict (id) do update set public = false;

insert into storage.buckets (id, name, public)
values ('snapshots', 'snapshots', false)
on conflict (id) do update set public = false;

drop policy if exists read_best_frames on storage.objects;
create policy read_best_frames on storage.objects for select to authenticated
  using (bucket_id = 'best-frames');

drop policy if exists read_snapshots on storage.objects;
create policy read_snapshots on storage.objects for select to authenticated
  using (bucket_id = 'snapshots');
