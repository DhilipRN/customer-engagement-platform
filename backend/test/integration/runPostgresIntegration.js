import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const directory = path.dirname(fileURLToPath(import.meta.url));
const migrationDirectory = path.resolve(directory, '../../../supabase/migrations');
const migrationFiles = [
  '20261014000002_create_activity_events.sql',
  '20261015000000_create_business_memberships.sql',
  '20261016000000_add_business_membership_atomic_operations.sql',
  '20261017000000_make_business_membership_audit_atomic.sql',
  '20261018000000_revalidate_business_membership_actor.sql',
  '20261019000000_add_feature_permissions.sql',
  '20261020000000_backfill_owner_feature_permissions.sql',
  '20261021000000_revoke_legacy_assignment_on_last_membership_delete.sql',
  '20261022000000_assign_profile_business_atomically.sql',
  '20261023000000_revoke_unaudited_membership_update.sql',
  '20261024000000_reconcile_profile_assignment_membership.sql',
];
const preFeatureFixture = path.join(directory, 'pre-feature-owner.sql');
const legacyMembershipDeletionAssertions = path.join(directory, 'legacy-membership-deletion-assertions.sql');
const profileAssignmentMembershipAssertions = path.join(directory, 'profile-assignment-membership-assertions.sql');

const requiredLocalTestSettings = [
  'PSQL_PATH',
  'PGHOST',
  'PGHOSTADDR',
  'PGPORT',
  'PGDATABASE',
  'CONNECTLY_EXPECTED_PGDATA',
];
const missingLocalTestSettings = requiredLocalTestSettings.filter((name) => !process.env[name]);
if (process.env.CONNECTLY_LOCAL_PG_TEST !== '1' || missingLocalTestSettings.length > 0) {
  console.error(
    'Refusing PostgreSQL integration tests: explicit local-test settings and CONNECTLY_LOCAL_PG_TEST=1 are required.',
  );
  process.exit(2);
}

const host = process.env.PGHOST;
const hostAddress = process.env.PGHOSTADDR;
if (host !== '127.0.0.1' || hostAddress !== '127.0.0.1') {
  console.error(`Refusing integration tests for non-loopback PostgreSQL target: ${host}/${hostAddress}`);
  process.exit(2);
}
if (process.env.PGDATABASE !== 'postgres') {
  console.error('Refusing integration tests: PGDATABASE must be postgres.');
  process.exit(2);
}

const psqlEnvironment = { ...process.env, PGHOST: host, PGHOSTADDR: hostAddress };
delete psqlEnvironment.PGSERVICE;
delete psqlEnvironment.PGSERVICEFILE;
delete psqlEnvironment.DATABASE_URL;
const psqlExecutable = process.env.PSQL_PATH;
const gateCloseTimeoutMs = 1000;
const expectedGateShutdownErrors = new Set(['EPIPE', 'ERR_STREAM_DESTROYED', 'ERR_STREAM_WRITE_AFTER_END']);

function normalizeDataDirectory(value) {
  const normalized = path.normalize(value.trim()).replace(/[\\/]+$/, '');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function runPsql(args, { expectedExitCodes = [] } = {}) {
  return new Promise((resolve, reject) => {
    const stdio = ['ignore', 'pipe', 'pipe'];
    const child = spawn(psqlExecutable, ['-X', ...args], { env: psqlEnvironment, stdio });
    let stdout = '';
    let stderr = '';
    if (child.stdout) child.stdout.on('data', (chunk) => { stdout += chunk; });
    if (child.stderr) child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => reject(error));
    child.on('close', (code) => {
      const result = { code: code ?? 1, stdout, stderr };
      if (result.code !== 0 && !expectedExitCodes.includes(result.code)) {
        reject(new Error(`psql failed (${result.code}): ${stderr || stdout}`));
      }
      else resolve(result);
    });
  });
}

async function verifyLocalCluster(adminDatabase) {
  const result = await runPsql([
    '-d', adminDatabase,
    '-At',
    '-v', 'ON_ERROR_STOP=1',
    '-c', `select json_build_object(
      'database', current_database(),
      'data_directory', current_setting('data_directory', true),
      'port', current_setting('port', true),
      'roles_ready', (
        select count(*) = 3
          from pg_roles
         where rolname in ('service_role', 'authenticated', 'anon')
           and rolsuper = false
           and rolcanlogin = false
           and rolinherit = false
      )
    );`,
  ]);

  let identity;
  try {
    identity = JSON.parse(result.stdout.trim());
  } catch {
    throw new Error('Refusing PostgreSQL integration tests: local cluster preflight returned invalid metadata.');
  }

  const expectedDataDirectory = normalizeDataDirectory(process.env.CONNECTLY_EXPECTED_PGDATA);
  const actualDataDirectory = normalizeDataDirectory(identity.data_directory || '');
  if (
    identity.database !== adminDatabase
    || actualDataDirectory !== expectedDataDirectory
    || String(identity.port) !== process.env.PGPORT
    || identity.roles_ready !== true
  ) {
    throw new Error('Refusing PostgreSQL integration tests: PostgreSQL cluster preflight did not match the explicit local target.');
  }
}

function startAdvisoryGate(databaseName, gateName, signalId) {
  const child = spawn(
    psqlExecutable,
    ['-X', '-d', databaseName, '-v', 'ON_ERROR_STOP=1'],
    { env: psqlEnvironment, stdio: ['pipe', 'inherit', 'inherit'] },
  );
  let settleCompletion;
  const completion = new Promise((resolve) => {
    settleCompletion = resolve;
  });
  const gate = { child, completion, error: null, released: false };
  const settle = (result) => {
    if (settleCompletion) {
      const resolve = settleCompletion;
      settleCompletion = null;
      resolve(result);
    }
  };
  const recordGateError = (error, { settleCompletion = false } = {}) => {
    if (gate.released && expectedGateShutdownErrors.has(error.code)) return;
    gate.error ??= error;
    if (settleCompletion) settle({ code: 1, error });
  };

  child.once('error', (error) => {
    recordGateError(error, { settleCompletion: true });
  });
  child.once('close', (code) => {
    settle({ code: code ?? 1, error: gate.error });
  });
  child.stdin.on('error', (error) => {
    recordGateError(error);
  });

  try {
    child.stdin.write(
      `select pg_advisory_lock(hashtextextended('${gateName}'::text, 0));\n` +
      `insert into public.integration_profile_assignment_race_signals (id, pid) ` +
      `values ('${signalId}', pg_backend_pid());\n`,
    );
  } catch (error) {
    recordGateError(error);
  }

  return gate;
}

async function releaseAdvisoryGate(gate) {
  if (!gate || gate.released) return;
  gate.released = true;
  if (gate.child.exitCode === null && gate.child.stdin) gate.child.stdin.end();
  const completed = await Promise.race([
    gate.completion.then(() => true),
    new Promise((resolve) => setTimeout(resolve, gateCloseTimeoutMs)),
  ]);

  if (completed || gate.child.exitCode !== null) {
    if (gate.error && !expectedGateShutdownErrors.has(gate.error.code)) throw gate.error;
    return;
  }

  let killResult = false;
  try {
    killResult = gate.child.kill();
  } catch (error) {
    throw new Error(`Unable to terminate integration race gate: ${error.message}`);
  }
  const forcedTerminationCompleted = await Promise.race([
    gate.completion.then(() => true),
    new Promise((resolve) => setTimeout(resolve, gateCloseTimeoutMs)),
  ]);
  if (!forcedTerminationCompleted && gate.child.exitCode === null && !killResult) {
    throw new Error('Integration race gate could not be terminated after graceful cleanup timed out.');
  }
  if (!forcedTerminationCompleted && gate.child.exitCode === null) {
    throw new Error('Integration race gate did not terminate within the cleanup timeout.');
  }
  if (gate.error && !expectedGateShutdownErrors.has(gate.error.code)) throw gate.error;
}

async function awaitWorkers(workers) {
  const results = await Promise.allSettled(workers);
  const failure = results.find((result) => result.status === 'rejected');

  if (failure) {
    throw failure.reason;
  }

  return results.map((result) => result.value);
}

async function waitForRaceSignal(databaseName, signalId, gate = null) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (gate?.error) throw gate.error;
    if (gate && gate.child.exitCode !== null && !gate.released) {
      throw new Error(`Integration race gate exited before signal ${signalId} was recorded.`);
    }
    const result = await runPsql([
      '-d', databaseName,
      '-tAc',
      `select exists (
         select 1
           from public.integration_profile_assignment_race_signals
          where id = '${signalId}'
       );`,
    ]);
    if (result.stdout.trim() === 't') return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  if (gate?.error) throw gate.error;
  throw new Error(`Timed out waiting for integration race signal ${signalId}.`);
}

async function waitForBusinessLock(databaseName, businessId) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const result = await runPsql([
      '-d', databaseName,
      '-tAc',
      `select pg_try_advisory_lock(hashtextextended('${businessId}'::text, 0));`,
    ]);
    if (result.stdout.trim() === 'f') return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error(`Timed out waiting for the business advisory lock ${businessId}.`);
}

async function waitForCompetingBusinessLock(databaseName, holderSignalId, waiterSignalId, businessId, gate = null) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (gate?.error) throw gate.error;
    if (gate && gate.child.exitCode !== null && !gate.released) {
      throw new Error('Integration race gate exited before the competing lock wait was observed.');
    }
    const result = await runPsql([
      '-d', databaseName,
      '-tAc',
      `select exists (
         select 1
           from pg_locks held
           join public.integration_profile_assignment_race_signals holder
             on holder.id = '${holderSignalId}'
            and holder.pid = held.pid
           join pg_locks waiting
             on waiting.locktype = 'advisory'
            and not waiting.granted
           join public.integration_profile_assignment_race_signals waiter
             on waiter.id = '${waiterSignalId}'
            and waiter.pid = waiting.pid
          where held.locktype = 'advisory'
            and held.granted
            and held.database = waiting.database
            and held.classid = waiting.classid
            and held.objid = waiting.objid
            and held.objsubid = waiting.objsubid
            and held.mode = waiting.mode
            and held.classid::bigint =
              ((hashtextextended('${businessId}'::text, 0) >> 32) & 4294967295)
            and held.objid::bigint =
              (hashtextextended('${businessId}'::text, 0) & 4294967295)
            and held.objsubid = 1
       );`,
    ]);
    if (result.stdout.trim() === 't') return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  if (gate?.error) throw gate.error;
  throw new Error(`Timed out waiting for ${waiterSignalId} to wait on the business advisory lock ${businessId}.`);
}

async function ensureFile(file) {
  await access(file);
}

let databaseName;
let databaseCreated = false;
const raceGates = [];
try {
  await runPsql(['--version']);
  for (const file of [
    'bootstrap.sql',
    'assertions.sql',
    'final-assertions.sql',
    'create-duplicate-worker.sql',
    'owner-update-worker.sql',
    'owner-delete-worker.sql',
    'revoke-owner-update-worker.sql',
    'revoke-owner-delete-worker.sql',
    'stale-owner-create-update-worker.sql',
    'stale-owner-create-delete-worker.sql',
    'restore-owner-race-state.sql',
    'cleanup-owner-race-state.sql',
    'pre-feature-owner.sql',
    'legacy-membership-deletion-assertions.sql',
    'profile-assignment-race-setup.sql',
    'profile-assignment-audit-rollback.sql',
    'profile-assignment-membership-assertions.sql',
    'profile-assignment-first-worker.sql',
    'profile-deletion-first-worker.sql',
    'profile-assignment-conflict-worker.sql',
    'profile-deletion-holds-worker.sql',
    'profile-assignment-race-assertions.sql',
    'profile-deletion-first-race-assertions.sql',
  ]) {
    await ensureFile(path.join(directory, file));
  }
  for (const file of migrationFiles) await ensureFile(path.join(migrationDirectory, file));

  const adminDatabase = process.env.PGDATABASE;
  await verifyLocalCluster(adminDatabase);
  databaseName = `connectly_membership_it_${process.pid}_${Date.now()}`;
  await runPsql(['-d', adminDatabase, '-v', 'ON_ERROR_STOP=1', '-c', `create database "${databaseName}"`]);
  databaseCreated = true;

  await runPsql(['-d', databaseName, '-v', 'ON_ERROR_STOP=1', '-f', path.join(directory, 'bootstrap.sql')]);
  for (const file of migrationFiles) {
    if (file === '20261019000000_add_feature_permissions.sql') {
      await runPsql(['-d', databaseName, '-v', 'ON_ERROR_STOP=1', '-f', preFeatureFixture]);
    }
    await runPsql(['-d', databaseName, '-v', 'ON_ERROR_STOP=1', '-f', path.join(migrationDirectory, file)]);
  }
  const privilegeDiagnostic = await runPsql([
  '-d', databaseName,
  '-c',
  `SELECT
     p.oid::regprocedure AS function_signature,
     r.rolname AS owner,
     p.proacl AS privileges,
     has_function_privilege(
       'service_role',
       p.oid,
       'EXECUTE'
     ) AS service_role_can_execute
   FROM pg_proc p
   JOIN pg_roles r ON r.oid = p.proowner
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname = 'create_business_membership'
   ORDER BY p.oid::regprocedure::text;`,
]);
console.log(privilegeDiagnostic.stdout);
  await runPsql(['-d', databaseName, '-v', 'ON_ERROR_STOP=1', '-f', path.join(directory, 'assertions.sql')]);
  await runPsql(['-d', databaseName, '-v', 'ON_ERROR_STOP=1', '-f', legacyMembershipDeletionAssertions]);
  await runPsql(['-d', databaseName, '-v', 'ON_ERROR_STOP=1', '-f', profileAssignmentMembershipAssertions]);
  await runPsql(['-d', databaseName, '-v', 'ON_ERROR_STOP=1', '-f', path.join(directory, 'profile-assignment-race-setup.sql')]);
  await runPsql(['-d', databaseName, '-v', 'ON_ERROR_STOP=1', '-f', path.join(directory, 'profile-assignment-audit-rollback.sql')]);

  const assignmentFirstGate = startAdvisoryGate(
    databaseName,
    'connectly.profile_assignment_first.gate',
    'assignment_first_gate_ready',
  );
  raceGates.push(assignmentFirstGate);
  await waitForRaceSignal(databaseName, 'assignment_first_gate_ready', assignmentFirstGate);

  const assignmentFirstWorker = runPsql([
    '-d', databaseName,
    '-v', 'ON_ERROR_STOP=1',
    '-f', path.join(directory, 'profile-assignment-first-worker.sql'),
  ]);
  await waitForRaceSignal(databaseName, 'assignment_first_assignment_started');
  await waitForBusinessLock(databaseName, '10000000-0000-4000-8000-000000000001');
  const assignmentFirstDeletionWorker = runPsql([
    '-d', databaseName,
    '-v', 'ON_ERROR_STOP=1',
    '-f', path.join(directory, 'profile-deletion-first-worker.sql'),
  ]);
  await waitForCompetingBusinessLock(
    databaseName,
    'assignment_first_assignment_started',
    'assignment_first_deletion_ready',
    '10000000-0000-4000-8000-000000000001',
    assignmentFirstGate,
  );
  await releaseAdvisoryGate(assignmentFirstGate);
  const assignmentFirst = await awaitWorkers([assignmentFirstWorker, assignmentFirstDeletionWorker]);
  if (assignmentFirst.some(({ code }) => code !== 0)) {
    throw new Error('Profile-assignment-first concurrency workers failed.');
  }

  await runPsql(['-d', databaseName, '-v', 'ON_ERROR_STOP=1', '-f', path.join(directory, 'profile-assignment-race-assertions.sql')]);

  const deletionFirstGate = startAdvisoryGate(
    databaseName,
    'connectly.profile_deletion_first.gate',
    'deletion_first_gate_ready',
  );
  raceGates.push(deletionFirstGate);
  await waitForRaceSignal(databaseName, 'deletion_first_gate_ready', deletionFirstGate);

  const deletionFirstWorker = runPsql([
    '-d', databaseName,
    '-v', 'ON_ERROR_STOP=1',
    '-f', path.join(directory, 'profile-deletion-holds-worker.sql'),
  ]);
  await waitForRaceSignal(databaseName, 'deletion_first_deletion_started');
  await waitForBusinessLock(databaseName, '10000000-0000-4000-8000-000000000001');
  const deletionFirstAssignmentWorker = runPsql([
    '-d', databaseName,
    '-v', 'ON_ERROR_STOP=1',
    '-f', path.join(directory, 'profile-assignment-conflict-worker.sql'),
  ], { expectedExitCodes: [3] });
  await waitForCompetingBusinessLock(
    databaseName,
    'deletion_first_deletion_started',
    'deletion_first_assignment_ready',
    '10000000-0000-4000-8000-000000000001',
    deletionFirstGate,
  );
  await releaseAdvisoryGate(deletionFirstGate);
  const deletionFirst = await awaitWorkers([deletionFirstWorker, deletionFirstAssignmentWorker]);
  if (deletionFirst[0].code !== 0 || deletionFirst[1].code === 0) {
    throw new Error('Deletion-first profile assignment race did not fail with a conflict.');
  }

  await runPsql(['-d', databaseName, '-v', 'ON_ERROR_STOP=1', '-f', path.join(directory, 'profile-deletion-first-race-assertions.sql')]);

  const duplicateWorkers = await awaitWorkers([
    runPsql(['-d', databaseName, '-v', 'ON_ERROR_STOP=1', '-f', path.join(directory, 'create-duplicate-worker.sql')], { expectedExitCodes: [3] }),
    runPsql(['-d', databaseName, '-v', 'ON_ERROR_STOP=1', '-f', path.join(directory, 'create-duplicate-worker.sql')], { expectedExitCodes: [3] }),
  ]);
  if (duplicateWorkers.filter(({ code }) => code === 0).length !== 1 || duplicateWorkers.filter(({ code }) => code !== 0).length !== 1) {
    throw new Error('Concurrent duplicate creation did not produce exactly one success and one unique-constraint failure.');
  }

  const updateRevocation = runPsql(
    ['-d', databaseName, '-v', 'ON_ERROR_STOP=1', '-f', path.join(directory, 'revoke-owner-update-worker.sql')],
    { expectedExitCodes: [3] },
  );
  await new Promise((resolve) => setTimeout(resolve, 200));
  const staleUpdate = runPsql(
    ['-d', databaseName, '-v', 'ON_ERROR_STOP=1', '-f', path.join(directory, 'stale-owner-create-update-worker.sql')],
    { expectedExitCodes: [3] },
  );
  const updateRevocationResults = await awaitWorkers([updateRevocation, staleUpdate]);
  if (updateRevocationResults[0].code !== 0 || updateRevocationResults[1].code === 0) {
    throw new Error('A demoted owner was able to complete a concurrent membership mutation.');
  }
const ownerState = await runPsql([
  '-d', databaseName,
  '-c',
  `SELECT user_id, role
   FROM public.business_memberships
   WHERE business_id = '10000000-0000-4000-8000-000000000001'
     AND user_id = '20000000-0000-4000-8000-000000000011';`,
]);
console.log('Owner membership before restore:\n' + ownerState.stdout);
  await runPsql(['-d', databaseName, '-v', 'ON_ERROR_STOP=1', '-f', path.join(directory, 'restore-owner-race-state.sql')]);

  const deleteRevocation = runPsql(
    ['-d', databaseName, '-v', 'ON_ERROR_STOP=1', '-f', path.join(directory, 'revoke-owner-delete-worker.sql')],
    { expectedExitCodes: [3] },
  );
  await new Promise((resolve) => setTimeout(resolve, 200));
  const staleDelete = runPsql(
    ['-d', databaseName, '-v', 'ON_ERROR_STOP=1', '-f', path.join(directory, 'stale-owner-create-delete-worker.sql')],
    { expectedExitCodes: [3] },
  );
  const deleteRevocationResults = await awaitWorkers([deleteRevocation, staleDelete]);
  if (deleteRevocationResults[0].code !== 0 || deleteRevocationResults[1].code === 0) {
    throw new Error('A removed owner was able to complete a concurrent membership mutation.');
  }

  await runPsql(['-d', databaseName, '-v', 'ON_ERROR_STOP=1', '-f', path.join(directory, 'cleanup-owner-race-state.sql')]);

  const ownerWorkers = await awaitWorkers([
    runPsql(['-d', databaseName, '-v', 'ON_ERROR_STOP=1', '-f', path.join(directory, 'owner-update-worker.sql')], { expectedExitCodes: [3] }),
    runPsql(['-d', databaseName, '-v', 'ON_ERROR_STOP=1', '-f', path.join(directory, 'owner-delete-worker.sql')], { expectedExitCodes: [3] }),
  ]);
console.log('Owner worker results:', ownerWorkers.map(({ code, stdout, stderr }) => ({ code, stdout, stderr })));
if (ownerWorkers.some(({ code }) => code === 0)) {
  throw Error('A concurrent last-owner operation unexpectedly succeeded.');
}
  await runPsql(['-d', databaseName, '-v', 'ON_ERROR_STOP=1', '-f', path.join(directory, 'final-assertions.sql')]);
  console.log(`PostgreSQL integration tests passed in isolated database ${databaseName}.`);
} catch (error) {
  if (error.code === 'ENOENT' || error.code === 'EPERM') {
    console.error('PostgreSQL integration tests require an executable local psql; no database was created.');
    process.exitCode = 2;
  } else {
    console.error(error.message);
    process.exitCode = 1;
  }
} finally {
  for (const gate of raceGates.reverse()) {
    try {
      await releaseAdvisoryGate(gate);
    } catch (error) {
      console.error(`Unable to release integration race gate: ${error.message}`);
      process.exitCode = 1;
    }
  }
  if (databaseCreated) {
    try {
      const adminDatabase = process.env.PGDATABASE;
      await runPsql(['-d', adminDatabase, '-v', 'ON_ERROR_STOP=1', '-c', `drop database if exists "${databaseName}"`]);
    } catch (error) {
      console.error(`Unable to clean up isolated database ${databaseName}: ${error.message}`);
      process.exitCode = 1;
    }
  }
}
