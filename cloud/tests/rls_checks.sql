-- Watchpost: cloud/tests/rls_checks.sql
--
-- Checks the role matrix against the live database. Paste into the Supabase
-- SQL editor and run the whole file. It creates three throwaway users, acts
-- as each one, and raises an exception on the first check that fails.
-- Everything runs in one transaction that is rolled back at the end, so no
-- rows are left behind (including the test users and their audit rows).
--
-- Success: the last notice reads "rls_checks: all passed" and the editor
-- reports no error.

begin;

-- Setup (as postgres)

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-4000-8000-00000000a001', 'rls-admin@watchpost.test',   'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000a002', 'rls-officer@watchpost.test', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000a003', 'rls-viewer@watchpost.test',  'authenticated', 'authenticated');

-- The signup trigger creates the profiles. Set the roles explicitly.
update public.profiles set role = 'admin'   where id = '00000000-0000-4000-8000-00000000a001';
update public.profiles set role = 'officer' where id = '00000000-0000-4000-8000-00000000a002';
update public.profiles set role = 'viewer'  where id = '00000000-0000-4000-8000-00000000a003';

do $$
begin
  if (select count(*) from public.profiles where email like 'rls-%@watchpost.test') <> 3 then
    raise exception 'setup: signup trigger did not create the three profiles';
  end if;
end $$;

insert into public.cameras (id, node_id, name, role, status)
values ('rls-cam', 'rls-test', 'RLS test camera', 'detect', 'online')
on conflict (id) do nothing;

insert into public.events (node_id, type, camera, track_id, severity, meta)
values ('rls-test', 'intrusion', 'rls-cam', 7, 'critical', '{"zone": "Test"}');

insert into public.telemetry (node_id, cpu, mem, temp, latency_ms, fps)
values ('rls-test', 10, 20, 50, 80, '{"rls-cam": 9.5}');

insert into public.audit_log (user_id, action, detail)
values ('00000000-0000-4000-8000-00000000a001', 'login', '{"email": "rls-admin@watchpost.test"}');


-- Anonymous (no session)

set local role anon;
set local request.jwt.claims = '{"role": "anon"}';

do $$
begin
  if exists (select 1 from public.events where node_id = 'rls-test') then
    raise exception 'anon: can read events';
  end if;
  if exists (select 1 from public.telemetry where node_id = 'rls-test') then
    raise exception 'anon: can read telemetry';
  end if;
  if exists (select 1 from public.cameras where id = 'rls-cam') then
    raise exception 'anon: can read cameras';
  end if;
  raise notice 'anon: ok';
end $$;

reset role;


-- Viewer

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-4000-8000-00000000a003", "role": "authenticated"}';

do $$
declare n int;
begin
  if not exists (select 1 from public.events where node_id = 'rls-test') then
    raise exception 'viewer: cannot read events';
  end if;
  if not exists (select 1 from public.telemetry where node_id = 'rls-test') then
    raise exception 'viewer: cannot read telemetry';
  end if;

  -- ack is filtered out by RLS: no error, zero rows
  update public.events set acknowledged = true where node_id = 'rls-test';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'viewer: acknowledged an event';
  end if;

  if exists (select 1 from public.audit_log) then
    raise exception 'viewer: can read audit_log';
  end if;

  -- other profiles are hidden, own profile is visible
  if (select count(*) from public.profiles) <> 1 then
    raise exception 'viewer: sees other profiles';
  end if;

  update public.profiles set role = 'admin' where id = auth.uid();
  get diagnostics n = row_count;
  if n <> 0 or public.user_role() <> 'viewer' then
    raise exception 'viewer: changed own role';
  end if;

  begin
    insert into public.events (node_id, type, severity) values ('rls-test', 'enter', 'info');
    raise exception 'viewer: inserted an event';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.audit_log (user_id, action, detail)
    values (auth.uid(), 'ack_alert', '{"forged": true}');
    raise exception 'viewer: wrote a forged ack_alert audit row';
  exception when insufficient_privilege then null;
  end;

  -- own login row is allowed
  insert into public.audit_log (user_id, action, detail)
  values (auth.uid(), 'login', '{"email": "rls-viewer@watchpost.test"}');

  update public.cameras set name = 'hacked' where id = 'rls-cam';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'viewer: edited a camera';
  end if;

  raise notice 'viewer: ok';
end $$;

reset role;


-- Officer

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-4000-8000-00000000a002", "role": "authenticated"}';

do $$
declare
  n int;
  ev record;
begin
  -- other columns are not writable
  begin
    update public.events set severity = 'info' where node_id = 'rls-test';
    raise exception 'officer: changed event severity';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.events set meta = '{}' where node_id = 'rls-test';
    raise exception 'officer: changed event meta';
  exception when insufficient_privilege then null;
  end;

  -- ack works; the server ignores the client's acknowledged_by
  update public.events
  set acknowledged = true,
      acknowledged_by = '00000000-0000-4000-8000-00000000a003'
  where node_id = 'rls-test';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'officer: could not acknowledge (% rows)', n;
  end if;

  select * into ev from public.events where node_id = 'rls-test';
  if ev.acknowledged_by is distinct from auth.uid() then
    raise exception 'officer: acknowledged_by was not forced to the caller';
  end if;
  if ev.acknowledged_at is null then
    raise exception 'officer: acknowledged_at not set';
  end if;
  if ev.severity <> 'critical' or ev.type <> 'intrusion' then
    raise exception 'officer: event columns changed during ack';
  end if;

  begin
    update public.events set acknowledged = false where node_id = 'rls-test';
    raise exception 'officer: undid an acknowledgement';
  exception when insufficient_privilege then null;
  end;

  if exists (select 1 from public.audit_log) then
    raise exception 'officer: can read audit_log';
  end if;

  update public.cameras set name = 'hacked' where id = 'rls-cam';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'officer: edited a camera';
  end if;

  update public.profiles set role = 'viewer' where id = '00000000-0000-4000-8000-00000000a003';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'officer: changed another user''s role';
  end if;

  begin
    perform public.prune_telemetry(0);
    raise exception 'officer: ran prune_telemetry';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.prune_events(0);
    raise exception 'officer: ran prune_events';
  exception when insufficient_privilege then null;
  end;

  raise notice 'officer: ok';
end $$;

reset role;


-- Admin

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-4000-8000-00000000a001", "role": "authenticated"}';

do $$
declare n int;
begin
  if not exists (
    select 1 from public.audit_log
    where action = 'ack_alert'
      and user_id = '00000000-0000-4000-8000-00000000a002'
  ) then
    raise exception 'admin: no server-side audit row for the officer ack';
  end if;

  if (select count(*) from public.profiles where email like 'rls-%@watchpost.test') <> 3 then
    raise exception 'admin: cannot see all profiles';
  end if;

  begin
    update public.profiles set role = 'officer' where id = auth.uid();
    raise exception 'admin: changed own role';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.profiles set email = 'x@y.z' where id = '00000000-0000-4000-8000-00000000a003';
    raise exception 'admin: changed a profile email';
  exception when insufficient_privilege then null;
  end;

  update public.profiles set role = 'officer' where id = '00000000-0000-4000-8000-00000000a003';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'admin: could not promote the viewer';
  end if;

  if not exists (
    select 1 from public.audit_log
    where action = 'config_change' and detail ->> 'change' = 'role'
      and detail ->> 'target' = 'rls-viewer@watchpost.test'
      and detail ->> 'to' = 'officer'
  ) then
    raise exception 'admin: role change was not audited';
  end if;

  update public.cameras set name = 'Renamed by admin' where id = 'rls-cam';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'admin: could not edit a camera';
  end if;

  if not exists (
    select 1 from public.audit_log
    where action = 'config_change' and detail ->> 'change' = 'cameras'
      and detail ->> 'id' = 'rls-cam'
  ) then
    raise exception 'admin: camera edit was not audited';
  end if;

  begin
    update public.events set type = 'enter' where node_id = 'rls-test';
    raise exception 'admin: changed event type';
  exception when insufficient_privilege then null;
  end;

  raise notice 'admin: ok';
end $$;

reset role;
set local request.jwt.claims = '{}';


-- Last admin cannot be demoted (as postgres, after demoting every other admin
-- inside this transaction; rolled back below)

update public.profiles set role = 'viewer'
where role = 'admin' and id <> '00000000-0000-4000-8000-00000000a001';

do $$
begin
  begin
    update public.profiles set role = 'viewer' where id = '00000000-0000-4000-8000-00000000a001';
    raise exception 'last admin: demotion was allowed';
  exception when raise_exception then
    if sqlerrm = 'last admin: demotion was allowed' then raise; end if;
  end;
  raise notice 'last admin: ok';
end $$;

do $$ begin raise notice 'rls_checks: all passed'; end $$;

rollback;
