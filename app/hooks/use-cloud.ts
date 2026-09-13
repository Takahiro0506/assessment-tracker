'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  emptyWorkspace,
  parseWorkspace,
  type Pending,
  type Remote,
  type Workspace,
} from '@/lib/workspace';
export type SyncStatus =
  | 'Loading'
  | 'Saved'
  | 'Saving'
  | 'Unsynced'
  | 'Save failed'
  | 'Conflict';
export function useCloud(user: User) {
  const [remote, setRemote] = useState<Remote>({
    revision: 0,
    token: null,
    data: emptyWorkspace(),
    updatedAt: null,
  });
  const [status, setStatus] = useState<SyncStatus>('Loading');
  const [error, setError] = useState('');
  const [localError, setLocalError] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const [conflict, setConflict] = useState<Remote | null>(null);
  const [recoveries, setRecoveries] = useState<
    { key: string; pending: Pending }[]
  >([]);
  const remoteRef = useRef(remote);
  const pendingRef = useRef<Pending | null>(null);
  const busy = useRef(false);
  const alive = useRef(true);
  const conflictRef = useRef(false);
  const prefix = `assessment-tracker.pending.${user.uid}.`;
  const accept = useCallback((r: Remote) => {
    parseWorkspace(r.data);
    if (r.revision >= remoteRef.current.revision) {
      remoteRef.current = r;
      setRemote(r);
    }
  }, []);
  const request = useCallback(
    async (path: string, init?: RequestInit) => {
      const token = await user.getIdToken();
      const response = await fetch(path, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(12000),
        cache: 'no-store',
      });
      const value = (await response.json()) as Remote & {
        error: string;
        conflict?: Remote;
        acknowledged?: string;
        items: { revision: number; updated_at: string }[];
      };
      return { response, value };
    },
    [user],
  );
  const findRecoveries = useCallback(() => {
    const entries = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)!;
      if (!key.startsWith(prefix)) continue;
      try {
        const p = JSON.parse(localStorage.getItem(key)!);
        parseWorkspace(p.data);
        if (
          !Number.isSafeInteger(p.baseRevision) ||
          typeof p.operationId !== 'string'
        )
          throw Error();
        entries.push({ key, pending: p as Pending });
      } catch {
        setLocalError(
          'A local recovery copy could not be read. It was not overwritten. Download local recovery files from Backup & recovery.',
        );
      }
    }
    setRecoveries(entries);
  }, [prefix]);
  const sync = useCallback(async () => {
    if (busy.current || !alive.current || conflictRef.current) return;
    busy.current = true;
    const p = pendingRef.current;
    if (!navigator.onLine) {
      setStatus('Unsynced');
      busy.current = false;
      return;
    }
    if (p) setStatus('Saving');
    try {
      const { response, value } = await request(
        '/api/workspace',
        p ? { method: 'PUT', body: JSON.stringify(p) } : undefined,
      );
      if (!alive.current) return;
      if (response.status === 409 && value.conflict) {
        setConflict(value.conflict);
        conflictRef.current = true;
        setStatus('Conflict');
        setError(value.error);
        return;
      }
      if (!response.ok) throw new Error(value.error ?? 'Sync failed.');
      if (value.revision < remoteRef.current.revision)
        throw new Error(
          'Cloud history was restored. Download your local copy, then reload before continuing.',
        );
      accept(value);
      if (p) {
        if (value.acknowledged !== p.operationId)
          throw new Error(
            'Save acknowledgement is missing. Your recovery copy is kept.',
          );
        localStorage.removeItem(prefix + p.operationId);
        pendingRef.current = null;
        setPending(null);
        findRecoveries();
      }
      setStatus('Saved');
      setError('');
    } catch (e) {
      if (alive.current) {
        setStatus(navigator.onLine ? 'Save failed' : 'Unsynced');
        setError(
          e instanceof Error
            ? e.message
            : 'Could not sync. Your local recovery copy is kept.',
        );
      }
    } finally {
      busy.current = false;
    }
  }, [request, accept, prefix, findRecoveries]);
  useEffect(() => {
    alive.current = true;
    try {
      // Read account recovery files after hydration.
      // oxlint-disable-next-line react/react-compiler
      findRecoveries();
    } catch {
      setLocalError(
        'Browser storage is unavailable. Editing requires a local recovery copy.',
      );
    }
    void sync();
    const refresh = () => {
      if (document.visibilityState === 'visible') void sync();
    };
    const timer = setInterval(refresh, 30000);
    const offline = () => setStatus('Unsynced');
    const before = (e: BeforeUnloadEvent) => {
      if (pendingRef.current) {
        e.preventDefault();
      }
    };
    window.addEventListener('online', refresh);
    window.addEventListener('offline', offline);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('beforeunload', before);
    window.addEventListener('storage', findRecoveries);
    return () => {
      alive.current = false;
      clearInterval(timer);
      window.removeEventListener('online', refresh);
      window.removeEventListener('offline', offline);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('beforeunload', before);
      window.removeEventListener('storage', findRecoveries);
    };
  }, [sync, findRecoveries]);
  function commit(data: Workspace, baseRevision = remote.revision) {
    try {
      if (
        pendingRef.current ||
        busy.current ||
        (remoteRef.current.updatedAt === null && status === 'Loading')
      )
        throw new Error(
          'Wait for the current sync, or retry it before saving another change.',
        );
      const p: Pending = {
        baseRevision,
        baseToken: remote.token,
        operationId: crypto.randomUUID(),
        data: parseWorkspace(data),
      };
      localStorage.setItem(prefix + p.operationId, JSON.stringify(p)); // Durable outbox BEFORE showing success or sending.
      pendingRef.current = p;
      setPending(p);
      setStatus('Unsynced');
      setError('');
      void sync();
      return true;
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Could not keep a recovery copy. Changes were not applied.',
      );
      return false;
    }
  }
  function resume(p: Pending) {
    if (pendingRef.current || busy.current) return;
    pendingRef.current = p;
    setPending(p);
    conflictRef.current = false;
    setConflict(null);
    void sync();
  }
  function resolve(data: Workspace) {
    if (!conflict || !pendingRef.current) return false;
    const old = pendingRef.current;
    const p: Pending = {
      baseRevision: conflict.revision,
      baseToken: conflict.token,
      operationId: crypto.randomUUID(),
      data: parseWorkspace(data),
    };
    try {
      // Keep the original branch as a separate recovery file until explicitly removed.
      localStorage.setItem(prefix + p.operationId, JSON.stringify(p));
      localStorage.setItem(
        `assessment-tracker.branch.${user.uid}.${old.operationId}`,
        JSON.stringify(old),
      );
      localStorage.removeItem(prefix + old.operationId);
      accept(conflict);
      pendingRef.current = p;
      setPending(p);
      conflictRef.current = false;
      setConflict(null);
      void sync();
      return true;
    } catch {
      setError(
        'Could not preserve both versions locally. Export them and free browser storage before retrying.',
      );
      return false;
    }
  }
  return {
    data: pending?.data ?? remote.data,
    remote,
    status:
      status === 'Saved' && recoveries.length > 0
        ? ('Unsynced' as const)
        : status,
    error: [localError, error].filter(Boolean).join(' '),
    setError,
    pending,
    conflict,
    recoveries,
    commit,
    sync,
    resume,
    resolve,
    request,
  };
}
