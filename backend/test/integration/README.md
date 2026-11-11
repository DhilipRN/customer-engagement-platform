# PostgreSQL membership integration tests

These tests use a temporary local PostgreSQL database. They never use
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, or a configured
remote Supabase project.

## Prerequisites

- PostgreSQL server listening on `127.0.0.1`.
- An explicit `PSQL_PATH` pointing to the local `psql` executable.
- `CONNECTLY_LOCAL_PG_TEST=1` as an explicit opt-in.
- Explicit `PGHOST=127.0.0.1`, `PGHOSTADDR=127.0.0.1`, `PGPORT`, and
  `PGDATABASE=postgres`.
- `CONNECTLY_EXPECTED_PGDATA` matching the local server's expected data
  directory.
- A local PostgreSQL role permitted to create and drop databases.
- Existing `service_role`, `authenticated`, and `anon` roles with the expected
  non-login, non-superuser, non-inheriting attributes. The bootstrap validates
  these roles and does not create or modify them.

The integration suite must use an explicitly configured local PostgreSQL
installation; it does not discover or select a database service automatically.

### Windows prerequisite check

Run these commands before the test suite:

```powershell
$env:PSQL_PATH = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
Test-Path $env:PSQL_PATH
Get-Service postgresql* -ErrorAction SilentlyContinue
Test-NetConnection 127.0.0.1 -Port 5432
```

If PostgreSQL is installed but stopped, start the matching local service shown
by `Get-Service` (for example, `Start-Service postgresql-x64-17` with an
elevated PowerShell prompt). If it is not installed, install PostgreSQL using
your approved local software process. Docker Desktop and the Supabase CLI are
not accepted substitutes unless their connection reports the explicitly
expected local data directory.

## Run

From `backend/`:

```powershell
$env:CONNECTLY_LOCAL_PG_TEST = '1'
$env:PSQL_PATH = '<absolute-local-psql-path>'
$env:PGHOST = '127.0.0.1'
$env:PGHOSTADDR = '127.0.0.1'
$env:PGPORT = '<local-postgres-port>'
$env:PGDATABASE = 'postgres'
$env:CONNECTLY_EXPECTED_PGDATA = '<absolute-local-data-directory>'
$env:PGUSER = '<local-admin-role>'       # optional
$env:PGPASSWORD = '<local-only-password>' # optional
npm run test:integration
```

These `$env:` assignments apply only to the current PowerShell session and do not persist system or user environment changes.

The exact next action in an environment without PostgreSQL is to install or
start a local PostgreSQL server, set `PSQL_PATH` to its `psql.exe`, set the
required target variables above, rerun the three checks above, and then run
`npm run test:integration`.

The runner fails closed unless the explicit local-test settings are present and
the connected server reports the expected administrative database, data
directory, port, and pre-existing application roles. It creates a uniquely
named database only after that read-only preflight succeeds, applies the test
bootstrap and migrations in order, runs the assertions and concurrent workers,
then drops only the exact database created by the current run in a `finally`
block. It does not modify an existing database or any cluster-level role.
The bootstrap role step is validation-only and fails if a required role is
missing or has unexpected attributes.

The bootstrap schema is intentionally minimal and test-only because this
repository does not contain the pre-membership migrations that define the
referenced `businesses`, `profiles`, and `customers` tables.

## Coverage

The suite verifies permission-row rollback, audit rollback for create/update/
delete, duplicate membership uniqueness across independent connections,
last-owner protection under concurrent demotion/deletion, and function
execution privileges. The existing fast mocked tests remain under `npm test`;
this suite is deliberately separate.
