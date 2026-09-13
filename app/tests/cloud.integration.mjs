import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { handleWorkspace } from '../server/workspace-api.ts';
import { localEmulator, authenticate } from '../server/auth.ts';
import {
  createAssessment,
  submit,
  resubmit,
  updateAssessment,
  serialize,
} from '../lib/assessments.ts';
import {
  fromLegacy,
  mergeBackup,
  readBackup,
  backup,
  parseWorkspace,
  emptyWorkspace,
} from '../lib/workspace.ts';
let mf, DB;
const project = 'demo-assessment-tracker';
const settings = () => ({
  DB,
  FIREBASE_PROJECT_ID: project,
  AUTH_EMULATOR: 'true',
});
const jwt = (uid, patch = {}) =>
  `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: uid, aud: project, iss: `https://securetoken.google.com/${project}`, iat: Math.floor(Date.now() / 1000) - 5, exp: Math.floor(Date.now() / 1000) + 3600, auth_time: Math.floor(Date.now() / 1000) - 5, ...patch })).toString('base64url')}.`;
async function call(uid, body, history = false, query = '') {
  if (body && body.baseToken === undefined)
    body = {
      ...body,
      baseToken:
        body.baseRevision === 0
          ? null
          : await DB.prepare(
              'SELECT operation_id FROM revisions WHERE owner=? AND revision=?',
            )
              .bind(uid, body.baseRevision)
              .first('operation_id'),
    };
  const req = new Request(
    `http://localhost/api/${history ? 'history' : 'workspace'}${query}`,
    {
      method: body ? 'PUT' : 'GET',
      headers: {
        Authorization: `Bearer ${jwt(uid)}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    },
  );
  const r = await handleWorkspace(req, settings(), true, history);
  return { status: r.status, body: await r.json() };
}
const pending = (
  data,
  baseRevision = 0,
  operationId = crypto.randomUUID(),
) => ({ data, baseRevision, operationId });
const card = (name = 'Assessment 1') =>
  fromLegacy([createAssessment('Database', name, '2026-09-18')]);
before(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      workers: [
        {
          name: 'test',
          modules: true,
          script: 'export default {fetch(){return new Response("test")}}',
          compatibilityDate: '2026-09-08',
          d1Databases: ['DB'],
        },
      ],
    }),
  );
  DB = await mf.getD1Database('DB');
  const sql = await readFile(
    new URL('../migrations/0001_workspace.sql', import.meta.url),
    'utf8',
  );
  for (const statement of sql.match(
    /CREATE TABLE[\s\S]*?;|CREATE TRIGGER[\s\S]*?END;/g,
  ))
    await DB.prepare(statement).run();
});
after(async () => mf?.dispose());
void test('two clients share account state; another account cannot read current or history, even with an owner query', async () => {
  const p = pending(card());
  assert.equal((await call('alice', p)).status, 200);
  assert.equal((await call('alice')).body.data.items[0].name, 'Assessment 1');
  assert.equal(
    (await call('bob', null, false, '?owner=alice')).body.revision,
    0,
  );
  assert.equal(
    (await call('bob', null, true, '?revision=1&owner=alice')).status,
    404,
  );
  assert.equal((await call('bob', pending(card('Bob')))).status, 200);
  assert.equal((await call('alice')).body.data.items[0].name, 'Assessment 1');
});
void test('atomic CAS admits one concurrent writer and retains both clients via explicit conflict', async () => {
  const original = card();
  const a = await call('race', pending(original));
  const left = structuredClone(original),
    right = structuredClone(original);
  left.items[0] = {
    ...updateAssessment(left.items[0], { name: 'Left' }, 'Edited'),
    unitId: left.items[0].unitId,
    deletedAt: null,
  };
  right.items[0] = {
    ...updateAssessment(right.items[0], { name: 'Right' }, 'Edited'),
    unitId: right.items[0].unitId,
    deletedAt: null,
  };
  const result = await Promise.all([
    call('race', pending(left, a.body.revision)),
    call('race', pending(right, a.body.revision)),
  ]);
  assert.deepEqual(
    result.map((r) => r.status).sort((a, b) => a - b),
    [200, 409],
  );
  const loser = result[0].status === 409 ? left : right;
  const conflict = result.find((r) => r.status === 409).body.conflict;
  const merged = await mergeBackup(conflict.data, loser);
  assert.equal(merged.copies, 1);
  assert.equal(
    (await call('race', pending(merged.data, conflict.revision))).status,
    200,
  );
  const history = await call('race', null, true);
  assert.equal(history.body.items.length, 3);
  assert.equal(
    (await call('race', null, true, '?revision=1')).body.data.items[0].name,
    'Assessment 1',
  );
});
void test('lost responses and simultaneous retries do not duplicate writes or versions', async () => {
  const p = pending(card());
  const rs = await Promise.all([call('retry', p), call('retry', p)]);
  assert.ok(rs.every((r) => r.status === 200));
  assert.equal((await call('retry', p)).body.acknowledged, p.operationId);
  assert.equal((await call('retry', null, true)).body.items.length, 1);
  const changed = pending(card('Different'), 1, p.operationId);
  assert.equal((await call('retry', changed)).status, 409);
});
void test('resubmission, trash, JSON restore and version restore retain prior submissions and dates', async () => {
  let a = createAssessment('Networking', 'Practical', '2026-09-18');
  a = submit(a, '2026-09-17T10:00:00Z');
  a = resubmit(a, null, '2026-09-19T10:00:00Z');
  let data = fromLegacy([a]);
  data.items[0].deletedAt = '2026-09-20T10:00:00Z';
  assert.deepEqual(readBackup(backup(data)), data);
  const first = await call('restore', pending(data));
  data = structuredClone(data);
  data.items[0].deletedAt = null;
  assert.equal(
    (await call('restore', pending(data, first.body.revision))).status,
    200,
  );
  const old = (await call('restore', null, true, '?revision=1')).body.data;
  assert.equal(
    old.items[0].history[1].snapshot.submittedAt,
    '2026-09-17T10:00:00Z',
  );
  assert.equal(old.items[0].history[1].snapshot.due, '2026-09-18');
  assert.equal(old.items[0].due, null);
  const recovered = await mergeBackup(data, old);
  assert.equal(recovered.copies, 1);
  assert.equal((await call('restore', pending(recovered.data, 2))).status, 200);
});
void test('legacy migration is additive, validated, repeatable and does not mutate original data', async () => {
  const legacy = serialize([createAssessment('Database', 'Old', '2026-09-18')]);
  const original = JSON.parse(legacy);
  const incoming = readBackup(legacy);
  const initial = await mergeBackup(emptyWorkspace(), incoming);
  assert.equal(initial.added, 1);
  const repeated = await mergeBackup(initial.data, incoming);
  assert.equal(repeated.added, 0);
  const changed = structuredClone(initial.data);
  const c = changed.items[0];
  changed.items[0] = {
    ...updateAssessment(c, { name: 'New' }, 'Edited'),
    unitId: c.unitId,
    deletedAt: null,
  };
  const collision = await mergeBackup(changed, incoming);
  assert.equal(collision.copies, 1);
  assert.equal(collision.data.items[0].name, 'New');
  assert.equal((await mergeBackup(collision.data, incoming)).added, 0);
  assert.deepEqual(JSON.parse(legacy), original);
  assert.throws(() => readBackup('{oops'));
  assert.throws(() =>
    parseWorkspace({
      ...incoming,
      items: [...incoming.items, ...incoming.items],
    }),
  );
});
void test('auth fails closed outside local development, and malformed tokens never access storage', async () => {
  for (const req of [
    new Request('http://localhost/api/workspace'),
    new Request('http://localhost/api/workspace', {
      headers: { Authorization: 'Bearer invalid' },
    }),
    new Request('http://localhost/api/workspace', {
      headers: { Authorization: `Bearer ${jwt('alice', { exp: 1 })}` },
    }),
    new Request('http://localhost/api/workspace', {
      headers: {
        Authorization: `Bearer ${jwt('alice', { aud: 'other-project' })}`,
      },
    }),
  ])
    assert.equal((await handleWorkspace(req, settings(), true)).status, 401);
  assert.equal(
    localEmulator(
      new Request('https://public.example/api/workspace'),
      settings(),
      true,
    ),
    false,
  );
  assert.equal(
    localEmulator(
      new Request('http://localhost/api/workspace'),
      settings(),
      false,
    ),
    false,
  );
  await assert.rejects(() =>
    authenticate(
      new Request('http://localhost/api/workspace', {
        headers: { Authorization: `Bearer ${jwt('alice')}` },
      }),
      settings(),
      false,
    ),
  );
});
void test('bad and oversized writes do not change saved data, and database failures return explicit errors', async () => {
  assert.equal((await call('bad', pending(card()))).status, 200);
  const malformed = card();
  malformed.items[0].due = '2026-02-30';
  assert.equal((await call('bad', pending(malformed, 1))).status, 400);
  assert.equal((await call('bad')).body.revision, 1);
  const req = new Request('http://localhost/api/workspace', {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${jwt('bad')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ padding: 'x'.repeat(410000) }),
  });
  assert.equal((await handleWorkspace(req, settings(), true)).status, 413);
  const fail = {
    ...settings(),
    DB: {
      withSession() {
        throw Error('Database unavailable');
      },
    },
  };
  assert.equal(
    (
      await handleWorkspace(
        new Request('http://localhost/api/workspace', {
          headers: { Authorization: `Bearer ${jwt('bad')}` },
        }),
        fail,
        true,
      )
    ).status,
    503,
  );
});
void test('SQL export and import into an independent database recovers all current data and revisions', async () => {
  const tables = ['workspaces', 'revisions'];
  const snapshot = {};
  for (const t of tables)
    snapshot[t] = (
      await DB.prepare(`SELECT * FROM ${t} ORDER BY owner,revision`).all()
    ).results;
  const other = new Miniflare(
    convertV4MiniflareOptions({
      workers: [
        {
          name: 'test',
          modules: true,
          script: 'export default {fetch(){return new Response("restore")}}',
          compatibilityDate: '2026-09-08',
          d1Databases: ['COPY'],
        },
      ],
    }),
  );
  try {
    const copy = await other.getD1Database('COPY');
    for (const t of tables) {
      const schema = await DB.prepare(
        'SELECT sql FROM sqlite_master WHERE type=? AND name=?',
      )
        .bind('table', t)
        .first('sql');
      await copy.prepare(schema).run();
      for (const r of snapshot[t])
        await copy
          .prepare(
            `INSERT INTO ${t}(owner,revision,data,operation_id,updated_at) VALUES(?,?,?,?,?)`,
          )
          .bind(r.owner, r.revision, r.data, r.operation_id, r.updated_at)
          .run();
      assert.deepEqual(
        (await copy.prepare(`SELECT * FROM ${t} ORDER BY owner,revision`).all())
          .results,
        snapshot[t],
      );
    }
  } finally {
    await other.dispose();
  }
});

void test('legacy unit casing and spaces migrate without changing any historical snapshots or duplicating repeated imports', async () => {
  const a = createAssessment('Database', 'A', null);
  const b = createAssessment('database', 'B', null);
  const old = serialize([a, b]);
  const migrated = readBackup(old);
  assert.equal(migrated.units.length, 1);
  assert.deepEqual(migrated.items[1].history, b.history);
  const into = fromLegacy([createAssessment('DATABASE', 'Existing', null)]);
  const first = await mergeBackup(into, migrated);
  const repeat = await mergeBackup(first.data, migrated);
  assert.equal(repeat.added, 0);
  assert.deepEqual(
    repeat.data.items.find((c) => c.id === b.id).history,
    b.history,
  );
});

void test('restored or replaced cloud state with the same revision rejects stale version tokens', async () => {
  const first = await call('epoch', pending(card()));
  const token = first.body.token;
  await DB.prepare('DROP TRIGGER workspace_update_history').run();
  await DB.prepare('UPDATE workspaces SET operation_id=? WHERE owner=?')
    .bind('restored-identity', 'epoch')
    .run();
  const result = await call('epoch', {
    ...pending(card('Stale edit'), 1),
    baseToken: token,
  });
  assert.equal(result.status, 409);
  assert.equal((await call('epoch')).body.data.items[0].name, 'Assessment 1');
});
