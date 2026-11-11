# Demo script

A walkthrough that takes 5 to 10 minutes and covers each success metric in
[prd.md](prd.md) section 7. Each step ends with the one-line check that tells you it worked.

## Before the demo

Do this beforehand, not in front of people.

- The Pi is on, cameras connected, and `sudo systemctl status watchpost` says active. The log
  (`journalctl -u watchpost -f`) shows `engine running on N camera(s)`.
- `cam-02` has a restricted zone in `edge/config.yaml`. The shipped config has one,
  `restricted-east`, on the right third of the frame. Know where that is on the floor.
- Two accounts exist: your admin account and one viewer account. Sign up the viewer in a private
  window if needed.
- The dashboard is open on its public URL, signed in as admin, on the Command page.
- A second terminal on the Pi for `vcgencmd measure_temp`.
- If you used `cloud/seed.sql`, delete the seed rows first (the delete statements are at the top
  of that file) so the audience only sees real data.

## 1. Cameras (1 minute)

Stop the service so the cameras are free, run the camera test, then start the service again:

```bash
sudo systemctl stop watchpost
cd ~/watchpost/edge && .venv/bin/python tools/camera_test.py --seconds 20
sudo systemctl start watchpost
```

Check: one window per camera at the same time, each labelled with its id, device and FPS.

Over SSH without a monitor, use `--save` instead and show the JPEGs in `edge/captures/`.

## 2. Live wall (1 minute)

Open the Live wall page. Point out that these are annotated stills uploaded about once a second
and that the video itself never leaves the Pi.

Check: each tile says LIVE and its timestamp keeps moving.

## 3. Enter event (1 minute)

Walk into view of `cam-02`, outside the restricted zone.

Check: walk in front of `cam-02` and an `enter` event appears in the event stream within 2 s,
without a refresh.

## 4. One photo per person (2 minutes)

Stay in view for 10 to 20 seconds, move around a little, then leave the frame. Open the People
page.

Check: there is exactly one card for that walk-through, with one clear photo, first and last seen
times and a dwell time.

If you want to show the de-duplication, open Storage > `best-frames` in Supabase: there is one
object for that person, not a series.

## 5. Intrusion alert (1 minute)

Walk into the restricted zone on the right side of `cam-02`'s view.

Check: step into `restricted-east` and a critical `intrusion` alert shows on the Alerts page and in
the event stream.

Stay in the zone past `loiter_seconds` (10 s for `cam-02`) to also get a `loiter` warning.

## 6. Viewer cannot acknowledge (2 minutes)

Sign in as the viewer in a private window and open Alerts. The ACK button is disabled, but that is
only the UI. To show the server refuses the update, send it directly with the viewer's token. In
the viewer window open DevTools > Application > Local Storage, find the `sb-<project-ref>-auth-token`
entry and copy its `access_token`. Then, with the intrusion event's id from step 5:

```bash
curl -s -X PATCH "https://YOUR-PROJECT.supabase.co/rest/v1/events?id=eq.123" \
  -H "apikey: YOUR-ANON-KEY" \
  -H "Authorization: Bearer VIEWER-ACCESS-TOKEN" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"acknowledged": true}'
```

The RLS policy matches no rows for a viewer, so the response is `[]` and the alert stays open.
Running `cloud/tests/rls_checks.sql` in the SQL editor checks the same thing for all three roles;
it ends with the notice `rls_checks: all passed`.

Then, in the admin window, acknowledge the alert and open the Audit log.

Check: the viewer's acknowledgement is rejected by the server; the admin's goes through and shows
in the audit log with the admin's email.

## 7. Network outage (1 minute, optional)

Unplug the Pi's network cable (or `sudo ip link set eth0 down` from a local console, not over
SSH). Walk in and out of view. Plug it back in.

Check: within a few seconds of the network returning, the events from the outage appear in the
stream. Their times are when they happened, not when they were uploaded: the edge sets
`created_at` itself. A page refresh puts them in time order.

## 8. Telemetry and heat (1 minute)

Open Analytics, then on the Pi:

```bash
vcgencmd measure_temp
vcgencmd get_throttled
```

Check: inference latency and FPS per camera are charted, the temperature on the Command page
matches `measure_temp`, and `get_throttled` prints `throttled=0x0`.

## After the demo

The 30-minute soak test (build plan M6) is the same setup left running: note the temperature and
`get_throttled` at the start and end, and check `journalctl -u watchpost` for restarts.
