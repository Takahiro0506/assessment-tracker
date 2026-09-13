import {
  emptyWorkspace,
  isId,
  parseWorkspace,
  MAX_BYTES,
} from '../lib/workspace.ts';
import { authenticate, type Settings } from './auth.ts';
type Row = {
  revision: number;
  data: string;
  operation_id: string;
  updated_at: string;
};
const headers = {
  'Cache-Control': 'no-store, private',
  Vary: 'Authorization',
  'X-Content-Type-Options': 'nosniff',
};
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers });
const unpack = (row: Row | null) =>
  row
    ? {
        revision: row.revision,
        token: row.operation_id,
        data: JSON.parse(row.data),
        updatedAt: row.updated_at,
      }
    : { revision: 0, token: null, data: emptyWorkspace(), updatedAt: null };
export async function handleWorkspace(
  request: Request,
  env: Settings,
  development = false,
  history = false,
) {
  let owner: string;
  try {
    owner = await authenticate(request, env, development);
  } catch {
    return json({ error: 'Sign in again to sync your semester.' }, 401);
  }
  if (!env.DB) return json({ error: 'Cloud storage is not configured.' }, 503);
  try {
    // Primary reads avoid replica lag during optimistic concurrency checks.
    const db = env.DB.withSession('first-primary');
    if (history) {
      if (request.method !== 'GET')
        return json({ error: 'Method not allowed.' }, 405);
      const url = new URL(request.url);
      const revision = url.searchParams.get('revision');
      if (revision) {
        if (!/^\d+$/.test(revision))
          return json({ error: 'Invalid revision.' }, 400);
        const row = await db
          .prepare(
            'SELECT revision,data,operation_id,updated_at FROM revisions WHERE owner=? AND revision=?',
          )
          .bind(owner, Number(revision))
          .first<Row>();
        return row
          ? json(unpack(row))
          : json({ error: 'Revision not found.' }, 404);
      }
      const before = Number(
        url.searchParams.get('before') ?? Number.MAX_SAFE_INTEGER,
      );
      if (!Number.isSafeInteger(before) || before < 1)
        return json({ error: 'Invalid cursor.' }, 400);
      const result = await db
        .prepare(
          'SELECT revision,updated_at FROM revisions WHERE owner=? AND revision<? ORDER BY revision DESC LIMIT 30',
        )
        .bind(owner, before)
        .all();
      return json({ items: result.results });
    }
    const read = () =>
      db
        .prepare(
          'SELECT revision,data,operation_id,updated_at FROM workspaces WHERE owner=?',
        )
        .bind(owner)
        .first<Row>();
    if (request.method === 'GET') return json(unpack(await read()));
    if (request.method !== 'PUT')
      return json({ error: 'Method not allowed.' }, 405);
    if (
      request.headers.get('origin') &&
      request.headers.get('origin') !== new URL(request.url).origin
    )
      return json({ error: 'Origin not allowed.' }, 403);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      return json({ error: 'Use JSON.' }, 415);
    // Stream a bounded body so a forged Content-Length cannot exhaust Worker memory.
    const reader = request.body?.getReader();
    if (!reader) return json({ error: 'Missing data.' }, 400);
    const parts: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > MAX_BYTES + 4096) {
        await reader.cancel();
        return json({ error: 'Semester storage limit reached.' }, 413);
      }
      parts.push(value);
    }
    const body = JSON.parse(await new Blob(parts as BlobPart[]).text());
    if (
      !Number.isSafeInteger(body.baseRevision) ||
      body.baseRevision < 0 ||
      !isId(body.operationId) ||
      !(body.baseRevision === 0
        ? body.baseToken === null
        : isId(body.baseToken))
    )
      return json({ error: 'Invalid save request.' }, 400);
    const data = JSON.stringify(parseWorkspace(body.data));
    const duplicate = await db
      .prepare('SELECT data FROM revisions WHERE owner=? AND operation_id=?')
      .bind(owner, body.operationId)
      .first<{ data: string }>();
    if (duplicate)
      return duplicate.data === data
        ? json({ ...unpack(await read()), acknowledged: body.operationId })
        : json(
            { error: 'Save identifier was reused with different content.' },
            409,
          );
    const at = new Date().toISOString();
    let written: Row | null;
    if (body.baseRevision === 0)
      written = await db
        .prepare(
          'INSERT INTO workspaces(owner,revision,data,operation_id,updated_at) VALUES(?,1,?,?,?) ON CONFLICT(owner) DO NOTHING RETURNING revision,data,operation_id,updated_at',
        )
        .bind(owner, data, body.operationId, at)
        .first<Row>();
    else
      written = await db
        .prepare(
          'UPDATE workspaces SET revision=revision+1,data=?,operation_id=?,updated_at=? WHERE owner=? AND revision=? AND operation_id=? RETURNING revision,data,operation_id,updated_at',
        )
        .bind(
          data,
          body.operationId,
          at,
          owner,
          body.baseRevision,
          body.baseToken,
        )
        .first<Row>();
    if (!written) {
      // Concurrent identical retries can pass the first duplicate check together.
      const done = await db
        .prepare('SELECT data FROM revisions WHERE owner=? AND operation_id=?')
        .bind(owner, body.operationId)
        .first<{ data: string }>();
      if (done?.data === data)
        return json({
          ...unpack(await read()),
          acknowledged: body.operationId,
        });
      return json(
        {
          error: 'Another device saved changes. Both versions are available.',
          conflict: unpack(await read()),
        },
        409,
      );
    }
    return json({ ...unpack(written), acknowledged: body.operationId });
  } catch (e) {
    if (
      e instanceof SyntaxError ||
      (e instanceof Error &&
        /Invalid|backup|limit|Semester|assessment|card|units/i.test(e.message))
    )
      return json(
        { error: e instanceof Error ? e.message : 'Invalid data.' },
        400,
      );
    return json(
      {
        error:
          'Cloud save failed. Your unsynced copy is kept on this device. Retry when the service is available.',
      },
      503,
    );
  }
}
