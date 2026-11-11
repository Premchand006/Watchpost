# Contributing

Bug reports, fixes and small features are welcome. For anything large, open an issue first so we
can agree on the approach.

## Setup

Follow the quick start in [README.md](README.md). For edge work you do not need a Pi to run the
tests:

```bash
cd edge
python -m venv .venv
.venv/bin/pip install -r requirements.txt pytest ruff   # on Windows: .venv\Scripts\pip
```

For the dashboard:

```bash
cd dashboard
npm install
cp .env.example .env.local
npm run dev
```

## Checks

Run these before opening a PR. CI runs the same ones.

```bash
python -m pytest edge/tests -q
ruff check edge
cd dashboard && npm run lint && npm test -- --run && npm run build
```

Database changes: update `cloud/schema.sql`, add a numbered migration in `cloud/migrations/`, and
run `cloud/tests/rls_checks.sql` in the Supabase SQL editor.

Read [docs/engineering-rules.md](docs/engineering-rules.md) before changing the edge pipeline. Its golden rules (no YOLO on every
frame, service key only on the Pi, networking off the vision loop, RLS for access control, raw video
stays on the Pi) apply to every change.

## Commits and PRs

Small commits with conventional prefixes: `feat:`, `fix:`, `chore:`, `docs:`, `test:`. One topic per
PR. The PR description needs a one-line manual test, for example "walk in front of CAM-02, an
`enter` event appears".
