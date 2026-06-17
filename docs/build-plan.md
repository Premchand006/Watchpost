# Build plan

The milestones Watchpost was built in, each with an acceptance test, and where each one stands.
Requirements are in [prd.md](prd.md). Engineering rules are in [engineering-rules.md](engineering-rules.md).

Work one milestone at a time and do not start the next until the current acceptance test passes.

## Status

| Milestone | Status |
| --- | --- |
| M0 Hardware bring-up | Done for the two USB cameras of the live deployment. The new `edge/tools/camera_test.py` and the CSI path have not been run on the Pi. |
| M1 Cloud foundation | Done. The v1 schema runs in the live project. `cloud/migrations/002_watchpost.sql` and `cloud/tests/rls_checks.sql` are written; applying them to the live project is part of the upgrade in [upgrading.md](upgrading.md). |
| M2 Single-camera vision | Done with the v1 edge code: events from the Pi reached the dashboard. |
| M3 Three-camera engine | Code done and unit tested (66 tests) in the rewritten `watchpost` package. Not yet run on the Pi, so the CPU and network-pull acceptance checks are open. |
| M4 Dashboard shell | Done. Deployed and receiving live data. |
| M5 Full dashboard | Done. All pages read live Supabase data. |
| M6 Hardening and demo | Audit triggers, empty and error states, `node_id` and the demo script are done. The 30-minute soak test is not. |

"Done" for M0 to M2 refers to the v1 edge code, which the rewritten package replaced. Each of
those acceptance tests has to be repeated once the new package runs on the Pi.

## M0: hardware bring-up

You do this one by hand, following [hardware-setup.md](hardware-setup.md).

1. Flash Raspberry Pi OS (64-bit, Bookworm), boot, update.
2. Connect the cameras: USB across both USB controllers, CSI on the ribbon connectors.
3. Run `bash edge/deploy/install.sh`, then `python edge/tools/camera_test.py`.

Acceptance: one live window per camera at the same time, each labelled with its device and
measured FPS.

## M1: cloud foundation

1. Create a free Supabase project. Note the project URL, anon key and service_role key.
2. Run `cloud/schema.sql` in the SQL editor (tables, roles, RLS, triggers, Realtime, buckets).
3. Enable the Email auth provider. Sign up one user and check that a `profiles` row with role
   `admin` appears.
4. Run `cloud/tests/rls_checks.sql`. The last notice must be `rls_checks: all passed`.

Acceptance: signup creates a profile with a role, an inserted `events` row shows up under
Realtime, the `best-frames` and `snapshots` buckets exist and are private, and `rls_checks` passes.

## M2: single-camera vision to cloud

1. Export the model on the Pi: `yolo export model=yolo26n.pt format=ncnn`.
2. One camera (`cam-02`, the AR0234): capture, YOLO26 NCNN, ByteTrack, log detections with
   `track_id` (`edge/watchpost/detector.py`, `tracker.py`, `engine.py`).
3. `edge/watchpost/publisher.py`: insert an `events` row on `enter` and `exit` from a background
   thread.
4. Fill `edge/.env` from `.env.example` with the URL and the service key.

Acceptance: `python -m watchpost` with one camera configured, walking in front of `cam-02`, logs
stable track ids and creates an `enter` row in Supabase within about 2 s.

## M3: three-camera engine

1. All cameras from `edge/config.yaml` (`cameras.py`, with `v4l2` and `picamera2` backends).
2. Motion gate before inference (`motion.py`, MOG2).
3. Strided, staggered schedule: YOLO on every Nth frame per camera, offset so cameras do not
   infer in the same pass (`engine.py`, `schedule.*` in the config).
4. Polygon zones per camera with `enter`, `exit`, `intrusion` for restricted zones and `loiter`
   past a dwell threshold (`zones.py`).
5. Best-frame scoring per track (Laplacian sharpness, box area, centredness), upload to
   `best-frames`, upsert `people` (`bestframe.py`).
6. Camera health: `offline`, `online`, `tamper` (`health.py`).
7. Local buffering in SQLite plus a disk spool for best-frames (`publisher.py`).
8. Telemetry rows every 5 s (`telemetry.py`).

Acceptance: all cameras process at once; Pi CPU stays under about 85% and the Pi does not
throttle; each tracked person gets exactly one good best-frame photo; stepping into a restricted
zone fires `intrusion`; unplugging the network and plugging it back flushes the buffered events.

## M4: dashboard shell and realtime, deployed

1. Vite, React and Tailwind app in `dashboard/`.
2. `src/lib/supabase.js` using `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
3. Login and signup through Supabase Auth, protected routes, role loaded from `profiles`.
4. App shell based on [design/dashboard-mockup.jsx](design/dashboard-mockup.jsx).
5. Live event feed (`useEvents`, Supabase Realtime on `events`).
6. Deploy to Vercel or Netlify with the two env vars.

Acceptance: the app is live on a public URL; you can sign up and log in; events from the Pi appear
without a refresh.

## M5: full dashboard on live data

Pages from PRD section 4.3:

1. Command: people present, alerts in 24 h, inference latency, node temperature, camera tiles.
2. Live wall: latest annotated snapshot per camera from the private `snapshots` bucket.
3. People: best-frame cards with id, photo, first and last seen, zone, dwell; search and filter.
4. Alerts: severity-coloured list with acknowledge.
5. Analytics: inference latency, FPS per camera, zone occupancy, events per hour.
6. Audit log (admins).
7. Users (admins): change roles.

Acceptance: every page shows real data from the Pi; a viewer trying to acknowledge an alert is
rejected by the server; the layout works on a phone.

## M6: hardening and demo

1. Audit every privileged action. Acks, role changes and camera or zone edits are written by
   triggers; login and logout by the client.
2. Empty, error and loading states on every page.
3. `node_id` on events, cameras, people and telemetry so a second Pi can join.
4. 30-minute soak test with the full pipeline: watch `vcgencmd measure_temp`,
   `vcgencmd get_throttled` and memory. No crash, no throttling.
5. Demo script: [demo-script.md](demo-script.md).

Acceptance: a clean 30-minute run, all success metrics in PRD section 7 pass, and the demo script
can be repeated by someone else.

## V2, after V1 ships

- Cross-camera re-identification (OSNet via `torchreid` or `fast-reid`) on the Pi or a helper
  machine, merging per-camera tracks into one `person_id`.
- Live WebRTC video: MediaMTX on the Pi behind a Cloudflare Tunnel, with a player tile on the Live
  wall.
- Heatmaps and path analytics from track positions per zone.
- Watchlists and face matching.
- Several Pis feeding the same Supabase project and dashboard, filtered by `node_id`.
- Raspberry Pi AI HAT+ (Hailo-8L or the 26 TOPS version) as an inference backend, which would let
  the frame skipping go.

## Branches

`main` stays deployable. One milestone per branch and PR (`feat/m3-three-cam` and so on).
