import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { renderHook, act, waitFor, cleanup } from '@testing-library/react';
import type { User } from 'firebase/auth';
import { useCloud } from '../hooks/use-cloud.ts';
import { emptyWorkspace, fromLegacy, type Remote } from '../lib/workspace.ts';
import { createAssessment } from '../lib/assessments.ts';
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost:3001',
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  localStorage: dom.window.localStorage,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, 'navigator', {
  value: dom.window.navigator,
  configurable: true,
});
const user = {
  uid: 'sync-client-test',
  getIdToken: async () => 'test-token',
} as User;
const prefix = `assessment-tracker.pending.${user.uid}.`;
const dataset = () =>
  fromLegacy([createAssessment('Database', 'Assessment 1', null)]);
let server: Remote;
let hold: (() => void) | undefined;
let mode = 'ok';
let writes = 0;
let savedOperation = '';
function setup() {
  localStorage.clear();
  mode = 'ok';
  writes = 0;
  savedOperation = '';
  hold = undefined;
  server = {
    revision: 0,
    token: null,
    data: emptyWorkspace(),
    updatedAt: null,
  };
  Object.defineProperty(navigator, 'onLine', {
    value: true,
    configurable: true,
  });
  globalThis.fetch = async (_url, init) => {
    if (init?.method === 'PUT') {
      writes++;
      const p = JSON.parse(init.body as string);
      if (mode === 'fail') throw Error('Connection lost');
      if (mode === 'hold')
        await new Promise<void>((resolve) => {
          hold = resolve;
        });
      if (mode === 'conflict')
        return Response.json(
          {
            error: 'Another device saved changes.',
            conflict: {
              revision: 2,
              token: 'other-device',
              data: dataset(),
              updatedAt: new Date().toISOString(),
            },
          },
          { status: 409 },
        );
      if (savedOperation !== p.operationId) {
        server = {
          revision: server.revision + 1,
          token: p.operationId,
          data: p.data,
          updatedAt: new Date().toISOString(),
        };
        savedOperation = p.operationId;
      }
      if (mode === 'lost-response') {
        mode = 'ok';
        throw Error('Response lost after commit');
      }
      return Response.json({ ...server, acknowledged: p.operationId });
    }
    return Response.json(server);
  };
}
async function start() {
  const h = renderHook(() => useCloud(user));
  await waitFor(() =>
    assert.ok(['Saved', 'Unsynced'].includes(h.result.current.status), `${h.result.current.status}: ${h.result.current.error}`),
  );
  return h;
}
void test('outbox is durable before request; Saved is shown only after acknowledgement', async () => {
  setup();
  const h = await start();
  mode = 'hold';
  let accepted = false;
  act(() => {
    accepted = h.result.current.commit(dataset());
  });
  assert.equal(accepted, true);
  await waitFor(() => assert.equal(writes, 1));
  assert.equal(h.result.current.status, 'Saving');
  assert.equal(localStorage.length, 1);
  assert.ok(localStorage.key(0)?.startsWith(prefix));
  assert.ok(h.result.current.pending);
  await act(async () => {
    hold!();
  });
  await waitFor(() => assert.equal(h.result.current.status, 'Saved'));
  assert.equal(localStorage.length, 0);
  assert.equal(h.result.current.pending, null);
  cleanup();
});
void test('storage quota failure rejects edits before contacting server', async () => {
  setup();
  const h = await start();
  const original = Object.getOwnPropertyDescriptor(
    dom.window.Storage.prototype,
    'setItem',
  )!;
  dom.window.Storage.prototype.setItem = () => {
    throw Error('Quota exceeded');
  };
  try {
    let accepted = true;
    act(() => {
      accepted = h.result.current.commit(dataset());
    });
    assert.equal(accepted, false);
    assert.equal(writes, 0);
    assert.equal(h.result.current.data.items.length, 0);
    assert.match(h.result.current.error, /Quota/);
  } finally {
    Object.defineProperty(dom.window.Storage.prototype, 'setItem', original);
    cleanup();
  }
});
void test('offline edit stays Unsynced and a second edit cannot overwrite pending recovery', async () => {
  setup();
  const h = await start();
  Object.defineProperty(navigator, 'onLine', {
    value: false,
    configurable: true,
  });
  act(() => {
    assert.equal(h.result.current.commit(dataset()), true);
  });
  assert.equal(h.result.current.status, 'Unsynced');
  assert.equal(writes, 0);
  const original = localStorage.getItem(localStorage.key(0)!);
  act(() => {
    assert.equal(h.result.current.commit(emptyWorkspace()), false);
  });
  assert.equal(localStorage.getItem(localStorage.key(0)!), original);
  cleanup();
});
void test('network failure survives unmount/reload; same account can resume it', async () => {
  setup();
  const h = await start();
  mode = 'fail';
  act(() => {
    h.result.current.commit(dataset());
  });
  await waitFor(() => assert.equal(h.result.current.status, 'Save failed'));
  const op = h.result.current.pending!.operationId;
  h.unmount();
  mode = 'ok';
  const next = await start();
  assert.equal(next.result.current.recoveries.length, 1);
  act(() =>
    next.result.current.resume(next.result.current.recoveries[0].pending),
  );
  await waitFor(() => assert.equal(next.result.current.status, 'Saved'));
  assert.equal(savedOperation, op);
  assert.equal(next.result.current.data.items.length, 1);
  assert.equal(localStorage.length, 0);
  cleanup();
});
void test('lost response retries same operation; newer server data is not replaced by old pending data', async () => {
  setup();
  const h = await start();
  mode = 'lost-response';
  act(() => {
    h.result.current.commit(dataset());
  });
  await waitFor(() => assert.equal(h.result.current.status, 'Save failed'));
  assert.equal(server.revision, 1);
  const newer = fromLegacy([
    createAssessment('Networking', 'Other device', null),
  ]);
  server = {
    revision: 2,
    token: 'other-device',
    data: newer,
    updatedAt: new Date().toISOString(),
  };
  await act(async () => h.result.current.sync());
  assert.equal(h.result.current.status, 'Saved');
  assert.equal(h.result.current.data.items[0].name, 'Other device');
  assert.equal(server.revision, 2);
  cleanup();
});
void test('conflict keeps local branch and does not auto overwrite cloud; resolution keeps recovery', async () => {
  setup();
  const h = await start();
  mode = 'conflict';
  void act(() => h.result.current.commit(dataset()));
  await waitFor(() => assert.equal(h.result.current.status, 'Conflict'));
  assert.equal(localStorage.length, 1);
  await act(async () => h.result.current.sync());
  assert.equal(writes, 1);
  assert.ok(h.result.current.conflict);
  mode = 'ok';
  server=structuredClone(h.result.current.conflict!);
  void act(() => h.result.current.resolve(h.result.current.conflict!.data));
  await waitFor(() => assert.equal(h.result.current.status, 'Saved'));
  assert.ok(
    localStorage.key(0)?.startsWith(`assessment-tracker.branch.${user.uid}.`),
  );
  cleanup();
});
void test('a different signed-in account does not receive another account recovery', async () => {
  setup();
  localStorage.setItem(
    prefix + 'previous',
    JSON.stringify({
      baseRevision: 0,
      baseToken: null,
      operationId: 'previous',
      data: dataset(),
    }),
  );
  const other = { ...user, uid: 'different-account' } as User;
  const h = renderHook(() => useCloud(other));
  await waitFor(() => assert.equal(h.result.current.status, 'Saved'));
  assert.equal(h.result.current.recoveries.length, 0);
  assert.equal(h.result.current.data.items.length, 0);
  assert.equal(localStorage.length, 1);
  cleanup();
});
