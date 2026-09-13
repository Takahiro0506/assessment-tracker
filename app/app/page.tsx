'use client';
import { useEffect, useState } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  connectAuthEmulator,
  onAuthStateChanged,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth';
import { AuthScreen } from '@/components/auth-screen';
import { Semester } from '@/components/semester';
import { useCloud } from '@/hooks/use-cloud';
import { fromLegacy, parseWorkspace, type Workspace } from '@/lib/workspace';
import {
  createAssessment,
  demoData,
  shiftDate,
  localDate,
} from '@/lib/assessments';
let authPromise: Promise<{ auth: Auth | null; emulator: boolean }> | undefined;
async function loadAuth() {
  const response = await fetch('/api/config');
  if (!response.ok) throw Error('Sign-in configuration could not be loaded.');
  const config = (await response.json()) as {
    configured: boolean;
    emulator: boolean;
    firebase: { apiKey: string; projectId: string; authDomain: string };
  };
  if (!config.configured) return { auth: null, emulator: false };
  const app = getApps()[0] ?? initializeApp(config.firebase);
  const auth = getAuth(app);
  if (config.emulator && !auth.emulatorConfig)
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', {
      disableWarnings: true,
    });
  return { auth, emulator: config.emulator };
}
function CloudSession({
  user,
  onExit,
  emulator,
}: {
  user: User;
  onExit: () => void;
  emulator: boolean;
}) {
  const cloud = useCloud(user);
  const [sample, setSample] = useState(false);
  if (sample) return <Sample onExit={() => setSample(false)} />;
  return (
    <Semester
      data={cloud.data}
      commit={cloud.commit}
      scope={user.uid}
      onSample={() => setSample(true)}
      cloud={cloud}
      emulator={emulator}
      onExit={onExit}
    />
  );
}
function Sample({ onExit }: { onExit: () => void }) {
  const [data, setData] = useState<Workspace>(() => {
    const day = localDate();
    return fromLegacy([
      ...demoData('normal'),
      createAssessment('Networking', 'Network practical', shiftDate(day, -3)),
      createAssessment('Database', 'Assessment 2', shiftDate(day, 36)),
      createAssessment('Web Development', 'Project report', shiftDate(day, 66)),
    ]);
  });
  return (
    <Semester
      data={data}
      commit={(v) => {
        setData(parseWorkspace(v));
        return true;
      }}
      scope="sample"
      onExit={onExit}
      isSample
    />
  );
}
export default function Page() {
  const [auth, setAuth] = useState<Auth | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [emulator, setEmulator] = useState(false);
  const [sample, setSample] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let active = true;
    authPromise ??= loadAuth();
    void authPromise
      .then((config) => {
        if (!active) return;
        setAuth(config.auth);
        setEmulator(config.emulator);
        if (config.auth)
          unsubscribe = onAuthStateChanged(config.auth, (u) => {
            setUser(u);
            setReady(true);
          });
        else setReady(true);
      })
      .catch(() => {
        authPromise = undefined;
        setError(
          'Could not connect to sign-in. Reload to retry, or explore a sample.',
        );
        setReady(true);
      });
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);
  if (sample) return <Sample onExit={() => setSample(false)} />;
  if (!ready)
    return (
      <div className="loading-screen" aria-live="polite">
        Opening your semester…
      </div>
    );
  if (user && auth)
    return (
      <CloudSession
        key={user.uid}
        user={user}
        emulator={emulator}
        onExit={() =>
          void signOut(auth).catch(() =>
            setError('Could not sign out. Please retry.'),
          )
        }
      />
    );
  return (
    <>
      <header className="welcome-header">Assessment tracker</header>
      {error && <p className="notice">{error}</p>}
      <AuthScreen
        auth={auth}
        emulator={emulator}
        onSample={() => setSample(true)}
      />
    </>
  );
}
