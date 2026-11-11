## What this changes

## Manual test

One line someone can repeat, for example: walk in front of CAM-02, an `enter` event appears in the
dashboard within 2 s.

-

## Checklist

- [ ] `python -m pytest edge/tests -q` and `ruff check edge` pass (if `edge/` changed)
- [ ] `npm run lint`, `npm test -- --run` and `npm run build` pass in `dashboard/` (if it changed)
- [ ] Schema changes come with a migration in `cloud/migrations/` and `cloud/tests/rls_checks.sql` still passes
- [ ] Tried on a Pi or a deployed dashboard, not only locally (say which)
- [ ] No keys or `.env` files committed; the service key is not used in `dashboard/`
