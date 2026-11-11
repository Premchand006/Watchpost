-- Watchpost: cloud/seed.sql
--
-- Optional demo rows so the dashboard has something to show before the Pi is
-- running. Run after schema.sql (or after 002_watchpost.sql). Safe to run
-- again: cameras and people are upserted, events and telemetry are only added
-- if no seed rows exist yet.
--
-- Remove the demo rows later with:
--   delete from public.events    where meta ->> 'seed' = 'true';
--   delete from public.people    where id like '%:seed:%';
--   delete from public.telemetry where node_id = 'pi-01' and fps ? 'seed';

insert into public.cameras (id, node_id, name, role, status, last_seen, fps, resolution, snapshot_path) values
  ('cam-01', 'pi-01', 'MX Brio 4K',            'identity',  'offline', now(), null, '1920x1080', 'pi-01/cam-01.jpg'),
  ('cam-02', 'pi-01', 'AR0234 Global Shutter', 'detect',    'offline', now(), null, '1280x720',  'pi-01/cam-02.jpg'),
  ('cam-03', 'pi-01', 'IMX678 Low-Light',      'perimeter', 'offline', now(), null, '1280x720',  'pi-01/cam-03.jpg')
on conflict (id) do update set
  node_id       = excluded.node_id,
  resolution    = coalesce(public.cameras.resolution, excluded.resolution),
  snapshot_path = coalesce(public.cameras.snapshot_path, excluded.snapshot_path);

insert into public.people (id, node_id, camera, track_id, best_frame, zone, quality, dwell_s, first_seen, last_seen) values
  ('pi-01:cam-01:seed:1', 'pi-01', 'cam-01', 1, null, 'Entrance', 0.82,  42, now() - interval '3 minutes', now() - interval '2 minutes'),
  ('pi-01:cam-02:seed:2', 'pi-01', 'cam-02', 2, null, 'Lobby',    0.64, 210, now() - interval '9 minutes', now() - interval '5 minutes'),
  ('pi-01:cam-03:seed:3', 'pi-01', 'cam-03', 3, null, 'Loading',  0.71,  95, now() - interval '30 minutes', now() - interval '28 minutes')
on conflict (id) do nothing;

insert into public.events (node_id, type, camera, track_id, person_id, severity, meta, created_at)
select * from (values
  ('pi-01', 'online',    'cam-01', null::int, null,                  'info',     '{"seed": true}'::jsonb,                                       now() - interval '31 minutes'),
  ('pi-01', 'enter',     'cam-03', 3,         'pi-01:cam-03:seed:3', 'info',     '{"seed": true, "conf": 0.88, "zone": "Loading"}'::jsonb,       now() - interval '30 minutes'),
  ('pi-01', 'intrusion', 'cam-03', 3,         'pi-01:cam-03:seed:3', 'critical', '{"seed": true, "zone": "Loading"}'::jsonb,                     now() - interval '29 minutes'),
  ('pi-01', 'exit',      'cam-03', 3,         'pi-01:cam-03:seed:3', 'info',     '{"seed": true, "dwell_s": 95}'::jsonb,                        now() - interval '28 minutes'),
  ('pi-01', 'enter',     'cam-02', 2,         'pi-01:cam-02:seed:2', 'info',     '{"seed": true, "conf": 0.91, "zone": "Lobby"}'::jsonb,         now() - interval '9 minutes'),
  ('pi-01', 'loiter',    'cam-02', 2,         'pi-01:cam-02:seed:2', 'warning',  '{"seed": true, "zone": "Lobby", "dwell_s": 180}'::jsonb,        now() - interval '6 minutes'),
  ('pi-01', 'enter',     'cam-01', 1,         'pi-01:cam-01:seed:1', 'info',     '{"seed": true, "conf": 0.79, "zone": "Entrance"}'::jsonb,      now() - interval '3 minutes'),
  ('pi-01', 'tamper',    'cam-01', null,      null,                  'critical', '{"seed": true, "reason": "blackout", "score": 0.93}'::jsonb,  now() - interval '1 minute')
) as v(node_id, type, camera, track_id, person_id, severity, meta, created_at)
where not exists (select 1 from public.events where meta ->> 'seed' = 'true');

insert into public.telemetry (node_id, cpu, mem, temp, latency_ms, fps, created_at)
select 'pi-01',
       38 + 10 * sin(g / 3.0),
       41 + 2 * cos(g / 5.0),
       55 + 4 * sin(g / 4.0),
       78 + 8 * sin(g / 2.0),
       jsonb_build_object('seed', true, 'cam-01', 9.5, 'cam-02', 11.8, 'cam-03', 7.9),
       now() - make_interval(secs => (24 - g) * 5)
from generate_series(1, 24) as g
where not exists (select 1 from public.telemetry where fps ? 'seed');
