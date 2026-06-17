# Watchpost product requirements

Version 1.1. Build plan and status: [build-plan.md](build-plan.md). Engineering rules:
[engineering-rules.md](engineering-rules.md).

## 1. Summary

Watchpost is a person detection and tracking system built around a single Raspberry Pi 5. The Pi
reads up to three cameras (USB or CSI) and does all of the computer vision on the device: motion
gating, YOLO26 detection, multi-object tracking, zone rules and best-frame capture. It pushes
structured events and small images to Supabase. A dashboard hosted on Vercel or Netlify shows
them in real time behind a login with three roles.

Three properties matter. Raw video never leaves the device. Detection happens at the source, so
response does not depend on a server. More Pis can feed the same cloud project and dashboard.

## 2. Goals and non-goals

### 2.1 Goals (V1)

- Detection and tracking on three cameras on a Pi 5 without overheating or saturating the CPU.
- A de-duplicated person table with one good photo per tracked person.
- Events for zone entry, zone exit, intrusion, loitering, camera offline and online, and camera
  tampering.
- A dashboard with signup and login and three roles (admin, officer, viewer).
- Events reach the dashboard live, under 2 s in the typical case.
- The dashboard is public on Vercel or Netlify and nothing on the LAN is exposed.
- No running cost beyond owned hardware (free tiers only).

### 2.2 Non-goals for V1

- Cross-camera re-identification (V2).
- Full-motion video in the dashboard. V1 uses annotated snapshots about once a second (V2).
- Face recognition or named identification (V2).
- Native mobile apps. The web app works on phones.
- Video recording or NVR features.

## 3. Users and roles

| Role | Who | Can | Cannot |
| --- | --- | --- | --- |
| admin | System owner | Everything: manage user roles, configure cameras and zones, read the audit log, acknowledge alerts | Change their own role, demote the last admin |
| officer | Operator on shift | View cameras and alerts, acknowledge alerts, browse people | Manage users, change camera or zone config |
| viewer | Stakeholder or guest | View cameras and dashboards | Acknowledge alerts, change anything |

Roles are enforced in Postgres with Row-Level Security, column grants and triggers. Hiding a button
in the UI is a convenience, not the control.

## 4. Functional requirements

### 4.1 Edge (Raspberry Pi)

- FR-E1 Capture from up to three cameras at once: USB through V4L2 and OpenCV, CSI through
  picamera2. Each is identified by a stable device path or libcamera index.
- FR-E2 Per-camera motion gate (MOG2 background subtraction) to skip empty frames.
- FR-E3 YOLO26n inference in NCNN format at 640x640, person class.
- FR-E4 Strided, staggered detection schedule from config: every Nth frame per camera, with cameras
  offset so they do not infer in the same pass.
- FR-E5 ByteTrack tracking with stable `track_id`s across detection ticks.
- FR-E6 Zone engine: polygon zones per camera, enter and exit per zone, intrusion for restricted
  zones, loitering when dwell passes a threshold.
- FR-E7 Camera health: offline when frames stop, online when they return, tamper on a blackout or a
  sudden lasting scene change.
- FR-E8 Best-frame scorer per track (Laplacian sharpness, box area, centredness). Keep one good
  crop per track and re-upload only when a clearly better one appears.
- FR-E9 Background publisher: insert events, upsert people and cameras, insert telemetry, upload
  best-frames and annotated snapshots. Networking never blocks the vision loop.
- FR-E10 When the network drops, buffer rows in SQLite and best-frames on disk, and flush them when
  it comes back.

### 4.2 Cloud (Supabase)

- FR-C1 Tables: `profiles` (role per user), `cameras`, `zones`, `people`, `events`, `telemetry`,
  `audit_log`.
- FR-C2 Email and password auth with JWT sessions. The first account becomes admin, later ones
  viewers.
- FR-C3 RLS policies and column grants implementing the role matrix in section 3.
- FR-C4 Realtime on `events`, `people`, `cameras` and `telemetry`.
- FR-C5 Private storage buckets `best-frames` and `snapshots`; the dashboard reads them through
  signed URLs.
- FR-C6 Every privileged action writes an `audit_log` row: login and logout from the client;
  acknowledgements, role changes and camera or zone edits from database triggers.

### 4.3 Web dashboard (Vercel or Netlify)

- FR-W1 Login and signup backed by Supabase Auth.
- FR-W2 Command page: people present, alerts in the last 24 h, inference latency, Pi temperature
  and load, status per camera.
- FR-W3 Live wall: a grid of annotated snapshots that refresh about once a second, with boxes,
  track ids, FPS and resolution per tile.
- FR-W4 People: cards with `person_id`, best photo, first seen, last seen, current zone and dwell
  time; search and filter.
- FR-W5 Alerts: severity-coloured list; officers and admins can acknowledge.
- FR-W6 Analytics: inference latency over time, FPS per camera, zone occupancy, events per hour.
- FR-W7 Audit log (admins only).
- FR-W8 New events and people appear without a page refresh.
- FR-W9 Works down to phone width, visible keyboard focus, respects reduced-motion.

## 5. Non-functional requirements

| # | Requirement | Target |
| --- | --- | --- |
| NFR-1 | Event latency, Pi to dashboard | Under 2 s typical |
| NFR-2 | Edge headroom | Pi 5 under about 85% CPU sustained, under about 80 °C |
| NFR-3 | Detection rate with motion present | 3 to 8 FPS per camera on the CPU; 30+ with a Hailo HAT |
| NFR-4 | Privacy | Raw video never leaves the Pi; only events, crops and small snapshots do |
| NFR-5 | Security | Passwords handled by Supabase Auth, roles enforced by RLS, no service key in the browser |
| NFR-6 | Cost | Free tiers only (Supabase, Vercel or Netlify) |
| NFR-7 | Resilience | The edge buffers through network outages and catches up |
| NFR-8 | Setup time | Under an hour for a new operator following [hardware-setup.md](hardware-setup.md) |

## 6. Design decisions and trade-offs

1. Edge to cloud to web, not browser to Pi. This is what allows public hosting and several Pis.
   The cost is a cloud dependency for the data path, softened by local buffering and on-device
   inference that keeps working offline.
2. Supabase instead of a custom API server, Postgres and JWT code. Less code to get wrong and a
   faster route to a working demo. The cost is a dependency on one hosted service.
3. YOLO26n with NCNN, the fastest detector and runtime pairing we found for the Pi's ARM CPU.
   YOLO26 tooling is newer than YOLOv8, so [engineering-rules.md](engineering-rules.md) documents a fallback to
   `yolo11n` or `yolov8n`.
4. Snapshots in V1, WebRTC video in V2. Annotated stills once a second fit the free tiers easily.
   It is not full-motion video until V2.
5. Motion-gated, strided inference. Three cameras do not fit on the CPU otherwise. Detection does
   not run on every frame; ByteTrack keeps identities across the gaps.

## 7. Success metrics

- Every camera visible at once in `edge/tools/camera_test.py`.
- Walking into frame creates an `enter` event in Supabase within 2 s.
- Each tracked person gets exactly one good best-frame photo, without duplicate uploads.
- Crossing into a restricted zone shows an `intrusion` alert on the dashboard.
- A viewer cannot acknowledge alerts; the server rejects the update.
- The dashboard is live on a public URL and updates without a refresh.
- The Pi runs the full pipeline for 30 minutes without throttling or crashing.

## 8. Milestones

Details and current status in [build-plan.md](build-plan.md).

| Milestone | Outcome |
| --- | --- |
| M0 Hardware bring-up | All cameras working on the Pi |
| M1 Cloud foundation | Supabase project with schema, auth and RLS |
| M2 Single-camera vision | YOLO26 and ByteTrack on one camera, events to the cloud |
| M3 Three-camera engine | Motion gate, strided schedule, best-frame capture on every camera |
| M4 Dashboard shell | Auth, layout and live event feed, deployed |
| M5 Full dashboard | Every page on live data |
| M6 Hardening and demo | Audit log, polish, 30-minute soak test, demo script |
| V2 | Re-identification, WebRTC video, heatmaps, several Pis, Hailo accelerator |

## 9. Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| The CPU cannot keep up with three cameras | High if YOLO runs on every frame | Motion gate, strided YOLO, ByteTrack; optional Hailo HAT |
| NCNN export fails on the device | Medium | Works on a Pi 5; on a Pi 4 export on a laptop or in Docker; fallback to `yolo11n` |
| USB bandwidth saturation | Medium | Cap resolution and FPS per camera; spread cameras over both USB controllers |
| Network outage loses events | Medium | SQLite buffer and disk spool, flushed on reconnect |
| Free-tier limits exceeded | Low | Only crops and small snapshots are uploaded; telemetry is pruned to 24 h, `prune_events` trims old events |
