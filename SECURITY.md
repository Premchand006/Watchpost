# Security

## Keys

Watchpost uses two Supabase keys and they must not be mixed up.

The service_role key bypasses Row-Level Security. It belongs only on the Pi, in `edge/.env`
(created with mode 600 by `edge/deploy/install.sh`). Anyone with it can read and change everything
in the project.

The anon key is public by design. The dashboard ships it to every browser, and what a user can do
with it is limited by the RLS policies, column grants and triggers in `cloud/schema.sql`.

Never put the service key in `dashboard/`, in a `VITE_` variable, or in a commit. If it leaks, rotate
it in Supabase (Settings > API) and update `edge/.env` on every Pi.

Access control lives in the database. A change that loosens a policy or grant should come with a
check in `cloud/tests/rls_checks.sql`.

## Reporting a vulnerability

Please do not open a public issue for a security problem. Use GitHub's private vulnerability
reporting on this repository (Security tab, "Report a vulnerability"). Include what you found, how
to reproduce it and what it lets an attacker do. Expect a first reply within a week.

Only the latest code on `main` gets fixes.
