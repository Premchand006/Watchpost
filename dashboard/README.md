# Watchpost dashboard

The web tier of [Watchpost](../README.md). React + Vite + Tailwind, reading live data from
Supabase. It deploys to Vercel or Netlify and never talks to the Pi directly: the Pi pushes to
Supabase, the dashboard reads from Supabase.

## Pages

| PRD ref | Page |
| --- | --- |
| FR-W1 | Sign in and sign up (Supabase Auth). The role comes from `profiles`. |
| FR-W2 | Command: KPIs (people in frame, alerts in 24 h, inference latency, node temperature), cameras, event stream, telemetry, recent people |
| FR-W3 | Live wall: the detect camera large, people in frame, the other cameras. Snapshots refresh about every 1.5 s. |
| FR-W4 | People: best-frame cards (id, photo, first and last seen, zone, dwell) with search and a status filter |
| FR-W5 | Alerts: open / critical / warning / all. Admins and officers can acknowledge. |
| FR-W6 | Analytics: inference latency, FPS per camera, events per hour, zone occupancy |
| FR-W7 | Audit log (admins) |
| PRD §3 | Users (admins): change a user's role |
| FR-W8 | Realtime: events, people, cameras and telemetry update without a refresh |
| FR-W9 | Works on phones, visible keyboard focus, respects `prefers-reduced-motion` |

Access control lives in Postgres (RLS, column grants and triggers in `cloud/schema.sql`). The UI
hides admin pages and disables buttons as a convenience only. When the server refuses an action
(a viewer acknowledging an alert, an admin changing their own role) the dashboard shows the error
in a toast.

## Run locally

```bash
cd dashboard
npm install
cp .env.example .env.local      # fill in your Supabase URL and anon key
npm run dev                     # http://localhost:5173
```

Without the env vars the app shows a setup screen.

| Var | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | Project URL (`https://xxxx.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | The anon key |
| `VITE_NODE_ID` | Optional. Node id shown in the top bar, default `pi-01` |

The service key never goes in this folder. It lives only on the Pi (`edge/.env`).

## Checks

```bash
npm run lint
npm test -- --run
npm run build
```

## Deploy

On Vercel, import the repo, set the root directory to `dashboard/`, framework preset Vite, add
the two env vars. `vercel.json` handles SPA routing and sets security headers.

On Netlify, set the base directory to `dashboard/` and add the two env vars. `netlify.toml` sets the build
command, SPA redirect and the same headers.

The Content-Security-Policy allows `https://*.supabase.co` and `wss://*.supabase.co`. If your
project uses a custom Supabase domain, add it to `connect-src` and `img-src` in both files.

## Data it reads

- `events` (realtime): event stream and Alert Center. Acknowledging sends only
  `{ acknowledged: true }`; the database fills in `acknowledged_by` and `acknowledged_at` and
  writes the audit row.
- `people` (realtime), keyed by `id`. Best-frame photos load from the private `best-frames`
  bucket through signed URLs.
- `cameras` (realtime). A camera whose `last_seen` is older than 30 s shows as stale even if
  its status says online.
- `telemetry` (realtime INSERTs): CPU, memory, temperature, latency, and FPS keyed by camera id.
- `audit_log`: admins only, polled every 15 s.
- `profiles`: the Users page (admins see every row).
- Live tiles read `snapshots/{node_id}/{camera}.jpg` (or the camera's `snapshot_path`, or the v1
  path `{camera}.jpg`). The bucket is private. Each tile signs the path once for an hour, then
  reloads it with a changing `cacheNonce` query parameter. Refreshing pauses while the tab is
  hidden and while the camera is not live.

The data hooks are opened once in `src/context/DataContext.jsx` and shared by every page.

## Layout

```text
dashboard/
├── index.html          fonts, meta tags
├── vite.config.js      build and test config
├── eslint.config.js
├── vercel.json         SPA rewrite, headers
├── netlify.toml        build, SPA redirect, headers
└── src/
    ├── lib/        supabase · constants · format · telemetry · cameras · audit
    ├── context/    AuthContext · DataContext · ToastContext
    ├── hooks/      useEvents · usePeople · useCameras · useTelemetry · useSnapshot
    │               useSignedUrl · useAuditLog · useProfiles
    ├── components/ Shell · ProtectedRoute · CameraTile · EventRow · PersonCard
    │               KPIStrip · TelemetryPanel · Gauge · Sparkline · states
    ├── auth/       Login · Signup · ConfigNeeded
    └── views/      Command · LiveWall · Roster · Alerts · Analytics · Audit · Users
```

## Manual test

1. Sign up the first account: it becomes admin. Sign in.
2. Insert a row into `events` in the Supabase table editor: it shows in the event stream within
   about 2 s without a refresh.
3. Sign up a second account (viewer). The Audit and Users pages are hidden and ACK is disabled.
   As the admin, open Users and make that account an officer: the officer can acknowledge, and the
   audit log shows the role change and the ack.
