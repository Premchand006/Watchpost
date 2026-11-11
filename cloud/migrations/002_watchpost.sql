-- 002_watchpost.sql
--
-- Upgrades a v1 database (001_initial.sql, the old schema.sql) to the Watchpost
-- contract. Safe to run more than once. Existing rows are kept.
--
-- What changes:
--   * events: acknowledged_at, person_id, type CHECK (NOT VALID, so old
--     'telemetry' rows stay), acks restricted to the ack columns and stamped
--     server-side, acks audited by trigger
--   * people: new text primary key `id`, plus dwell_s. Existing rows get
--     id = node_id:camera:legacy:track_id
--   * cameras: fps, resolution, snapshot_path
--   * telemetry: new table (the Pi stops writing type='telemetry' events)
--   * profiles: admins change roles, nobody changes their own, the last admin
--     cannot be demoted, role changes are audited
--   * snapshots bucket becomes private (dashboard uses signed URLs)
--   * retention functions prune_telemetry / prune_events for the service key
--
-- Order of rollout: run this file, deploy the new dashboard, then start the new
-- edge build. The old edge build's people upsert (on node_id,track_id) and its
-- 'telemetry' events are rejected once this has run.

-- cameras
alter table public.cameras add column if not exists fps           real;
alter table public.cameras add column if not exists resolution    text;
alter table public.cameras add column if not exists snapshot_path text;
alter table public.cameras alter column status set default 'offline';

-- events
alter table public.events add column if not exists person_id       text;
alter table public.events add column if not exists acknowledged_at timestamptz;

-- Backfill ack times from the audit log where the v1 dashboard recorded them.
update public.events e
set acknowledged_at = a.created_at
from (
  select (detail ->> 'event_id')::bigint as event_id, min(created_at) as created_at
  from public.audit_log
  where action = 'ack_alert' and detail ->> 'event_id' ~ '^[0-9]+$'
  group by 1
) a
where e.id = a.event_id and e.acknowledged and e.acknowledged_at is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'events_type_check' and conrelid = 'public.events'::regclass
  ) then
    -- NOT VALID: existing rows (including old 'telemetry' rows) are not checked,
    -- new inserts and updates are.
    alter table public.events add constraint events_type_check
      check (type in ('enter', 'exit', 'intrusion', 'loiter', 'offline', 'online', 'tamper'))
      not valid;
  end if;
end $$;

-- Optional: old telemetry rows are no longer read by the dashboard. Uncomment
-- to remove them, then you can also validate the type constraint.
-- delete from public.events where type = 'telemetry';
-- alter table public.events validate constraint events_type_check;

-- Deleting a user from Auth should not fail because they acked an alert or
-- have audit rows.
alter table public.events drop constraint if exists events_acknowledged_by_fkey;
alter table public.events add constraint events_acknowledged_by_fkey
  foreign key (acknowledged_by) references auth.users(id) on delete set null;

alter table public.audit_log drop constraint if exists audit_log_user_id_fkey;
alter table public.audit_log add constraint audit_log_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

-- people: switch the primary key from (node_id, track_id) to id
alter table public.people add column if not exists id      text;
alter table public.people add column if not exists dwell_s real;

update public.people
set id = node_id || ':' || coalesce(camera, '?') || ':legacy:' || track_id
where id is null;

update public.people
set dwell_s = extract(epoch from (last_seen - first_seen))
where dwell_s is null and first_seen is not null and last_seen is not null;

alter table public.people alter column id set not null;

do $$
declare
  pk_name text;
  pk_cols text[];
begin
  select c.conname,
         array(select a.attname::text
               from unnest(c.conkey) k join pg_attribute a
                 on a.attrelid = c.conrelid and a.attnum = k
               order by a.attname)
  into pk_name, pk_cols
  from pg_constraint c
  where c.conrelid = 'public.people'::regclass and c.contype = 'p';

  if pk_cols is distinct from array['id'] then
    if pk_name is not null then
      execute format('alter table public.people drop constraint %I', pk_name);
    end if;
    alter table public.people add constraint people_pkey primary key (id);
  end if;
end $$;

-- telemetry
create table if not exists public.telemetry (
  id         bigint generated always as identity primary key,
  node_id    text not null default 'pi-01',
  cpu        real,
  mem        real,
  temp       real,
  latency_ms real,
  fps        jsonb,
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
