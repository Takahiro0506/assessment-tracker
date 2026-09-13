'use client';
import { useEffect, useRef, useState } from 'react';
import { type Assessment, STORAGE_KEY, demoData } from '@/lib/assessments';
import {
  readStored,
  writeStored,
  writeSample,
  StorageConflict,
} from '@/lib/storage';
export function useAssessments() {
  const [personal, setPersonal] = useState<Assessment[]>([]);
  const [sample, setSample] = useState<Assessment[] | null>(null);
  const [ready, setReady] = useState(false);
  const [unsafe, setUnsafe] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const original = useRef<string | null>(null);
  const blocked = useRef(false);
  useEffect(() => {
    try {
      const saved = readStored(localStorage);
      original.current = saved.raw;
      // Read browser-only storage after hydration; the server renders an empty loading state.
      // oxlint-disable-next-line react/react-compiler
      setPersonal(saved.items);
    } catch {
      blocked.current = true;
      setUnsafe(true);
      setError(
        'Saved data could not be read. It has not been overwritten. Export the stored data before restoring a valid backup.',
      );
    }
    setReady(true);
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY || e.key === null) {
        blocked.current = true;
        setUnsafe(true);
        setError(
          'Data changed in another tab. Reload this page before making changes.',
        );
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  function commit(next: Assessment[], message: string, replace = false) {
    try {
      if (blocked.current) {
        if (!replace || sample !== null)
          throw new Error('Resolve the storage warning before making changes.');
      }
      if (sample !== null) setSample(writeSample(next));
      else {
        original.current = writeStored(
          localStorage,
          original.current,
          next,
          replace,
        );
        setPersonal(next);
        blocked.current = false;
        setUnsafe(false);
      }
      setError('');
      setNotice(message);
      return true;
    } catch (e) {
      if (e instanceof StorageConflict) {
        blocked.current = true;
        setUnsafe(true);
      }
      setError(
        e instanceof Error
          ? e.message
          : 'Could not save. Changes were not applied.',
      );
      return false;
    }
  }
  function startSample(mode: 'normal' | 'busy') {
    setSample(demoData(mode));
    setNotice('Sample week opened. Your own assessments are unchanged.');
  }
  function exitSample() {
    setSample(null);
    setNotice('Back to your assessments. Practice changes were discarded.');
  }
  return {
    items: sample ?? personal,
    personalCount: personal.length,
    isSample: sample !== null,
    ready,
    unsafe,
    error,
    notice,
    setError,
    setNotice,
    commit,
    startSample,
    exitSample,
  };
}
