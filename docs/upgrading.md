# Upgrading a v1 deployment

This is for a Supabase project, dashboard and Pi that are running the v1 code (the project was
called SentinelEdge then, and the Pi ran `edge/vision_engine.py`). A new install does not need
any of this; run `cloud/schema.sql` instead.

`cloud/migrations/002_watchpost.sql` changes the database contract, and both the old dashboard and
the old edge build stop working properly once it has run. Do the steps below in order, close
together. Budget about 30 minutes.

## What 002 changes

- `people` gets a text primary key `id` (`node_id:camera:session:track_id`) instead of
  `(node_id, track_id)`. Existing rows get `node_id:camera:legacy:track_id`.
- `events` gets `person_id` and `acknowledged_at`, and a check constraint on `type` that does not
  allow `telemetry`. It is added `NOT VALID`, so old rows are left alone and only new writes are
  checked.
- Telemetry moves to its own `telemetry` table.
- `cameras` gets `fps`, `resolution` and `snapshot_path`.
- Acknowledgements are limited to the ack columns, stamped by the server and audited by a trigger.
  Role changes are admin-only, nobody can change their own role, and the last admin cannot be
  demoted.
- The `snapshots` bucket becomes private. The dashboard has to use signed URLs.
- `prune_telemetry` and `prune_events` are added for the service key.

The migration keeps existing rows and is safe to run more than once.

## Steps

### 1. Run the migration

Optional but tidy: stop the old edge process on the Pi first, so it does not buffer writes that
the new schema will reject (see step 4).

In the Supabase SQL editor, paste `cloud/migrations/002_watchpost.sql` and run it. It should finish
without an error.

### 2. Run the RLS checks

Paste `cloud/tests/rls_checks.sql` into the SQL editor and run it. The last notice must be
`rls_checks: all passed`. The script creates three test users inside a transaction and rolls it
back, so nothing is left behind. If it raises an exception, the message names the check that
failed; fix that before going on.

### 3. Deploy the new dashboard right away

The old dashboard loads snapshot tiles from public URLs. The bucket is private now, so the old
dashboard's live tiles go blank as soon as step 1 runs. Deploy the current `dashboard/` (push to
the branch Vercel or Netlify builds from, or redeploy from their UI). The env vars stay the same:
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

Check: sign in, the Command page loads, and the Users page is visible to your admin account.

### 4. Deploy the new edge

The old edge build breaks after step 1:

- its `people` upsert uses `on_conflict=node_id,track_id`, and that unique key no longer exists,
  so every people write fails
- it writes telemetry as `events` rows with `type='telemetry'`, which the new check constraint
  rejects
- it buffers the failed writes locally and retries them, so its buffer keeps growing

So stop the old process (however it was started: a terminal, `nohup`, or your own service unit)
and install the new one:

```bash
cd ~/watchpost            # older setups used ~/sentineledge
git pull
mv edge/buffer.db edge/buffer.v1.db 2>/dev/null || true   # old buffer holds rows the new schema rejects
bash edge/deploy/install.sh
```

Keep your existing `edge/.env` as long as it sets `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`; those
are the two names the new edge reads. Compare your old
`edge/config.yaml` with the new one: zones are now named objects under `zones:` (the old
`restricted_zones:` list of polygons is still accepted), each camera has a `backend`, and there are
new `health`, `telemetry` and `publisher` sections.

Then:

```bash
cd edge
.venv/bin/python -m watchpost --dry-run     # check the config and cameras, nothing is sent
sudo systemctl start watchpost
journalctl -u watchpost -f
```

Check: walk in front of `cam-02` and an `enter` event appears in the dashboard within 2 s, and the
Command page shows telemetry updating every 5 s.

Once it runs cleanly you can delete `edge/buffer.v1.db`.

### 5. Optional cleanup

The dashboard no longer reads the old `type='telemetry'` rows in `events`. Near the top of
`002_watchpost.sql` there are two commented lines that remove them and then validate the type
constraint against all rows:

```sql
delete from public.events where type = 'telemetry';
alter table public.events validate constraint events_type_check;
```

Run them in the SQL editor when you no longer need the old telemetry. The `validate` fails if any
other old row has a type outside the allowed list.

## Rolling back

There is no down migration. If you need to go back, restore the database from a Supabase backup
taken before step 1, and redeploy the v1 dashboard and edge code from git history.
