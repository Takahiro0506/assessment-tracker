'use client';
import { useState } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail,
  type Auth,
} from 'firebase/auth';
import { BookOpen, ArrowRight, Cloud } from 'lucide-react';
export function AuthScreen({
  auth,
  emulator,
  onSample,
}: {
  auth: Auth | null;
  emulator: boolean;
  onSample: () => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signup, setSignup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function run(fn: () => Promise<unknown>, success = '') {
    setBusy(true);
    setMessage('');
    try {
      await fn();
      setMessage(success);
    } catch (e) {
      const code = (e as { code?: string }).code;
      setMessage(
        code === 'auth/invalid-credential'
          ? 'Email or password was not recognised. Try again or reset your password.'
          : code === 'auth/email-already-in-use'
            ? 'This email already has an account. Sign in instead.'
            : code === 'auth/weak-password'
              ? 'Choose a stronger password (at least 6 characters).'
              : code === 'auth/popup-closed-by-user'
                ? 'Sign-in window closed. You can try again.'
                : 'Could not sign in. Check your connection and try again.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="welcome">
      <section>
        <p className="eyebrow">
          <BookOpen size={18} /> A little clarity for your semester
        </p>
        <h1>
          Your units.
          <br />
          Your assessments.
          <br />
          <em>A semester that makes sense.</em>
        </h1>
        <p className="intro">
          Start with one assessment. Add dates when you know them, see what is
          due next, and keep track of what you have submitted.
        </p>
        <div className="welcome-cards" aria-hidden="true">
          <div className="mini-card color-0">
            <span>Database</span>
            <h3>Assessment 1</h3>
            <span>18 Sept · Ready when you are</span>
          </div>
          <div className="mini-card color-1">
            <span>Web Development</span>
            <h3>Website review</h3>
            <span>No date yet</span>
          </div>
        </div>
      </section>
      <section className="auth-panel">
        <Cloud size={28} />
        <h2>{signup ? 'Make room for your semester' : 'Welcome back'}</h2>
        <p>Your semester, together on your phone and computer.</p>
        {emulator && (
          <p className="notice">
            Local test service · Use a test email and password. This does not
            create a real cloud account.
          </p>
        )}
        {!auth ? (
          <p className="notice">
            Cloud sign-in needs setup. You can explore a sample while the
            service is connected.
          </p>
        ) : (
          <>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(() =>
                  signup
                    ? createUserWithEmailAndPassword(auth, email, password)
                    : signInWithEmailAndPassword(auth, email, password),
                );
              }}
            >
              <label>
                Email
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  required
                  minLength={6}
                  autoComplete={signup ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <button className="primary" disabled={busy}>
                {busy ? 'Please wait…' : signup ? 'Create account' : 'Sign in'}
                <ArrowRight size={18} />
              </button>
            </form>
            <div className="auth-links">
              <button
                className="text-button"
                disabled={busy}
                onClick={() => setSignup(!signup)}
              >
                {signup
                  ? 'Already have an account? Sign in'
                  : 'New here? Create an account'}
              </button>
              <button
                className="text-button"
                disabled={busy || !email}
                onClick={() =>
                  void run(
                    () => sendPasswordResetEmail(auth, email),
                    'If this address has an account, a reset email will arrive shortly.',
                  )
                }
              >
                Reset password
              </button>
            </div>
            {!emulator && (
              <button
                className="wide"
                disabled={busy}
                onClick={() =>
                  void run(() =>
                    signInWithPopup(auth, new GoogleAuthProvider()),
                  )
                }
              >
                Continue with Google
              </button>
            )}
          </>
        )}
        {message && (
          <p role="alert" className="notice">
            {message}
          </p>
        )}
        <div className="sample-invite">
          <span>Want to get a feel for it?</span>
          <button className="text-button" onClick={onSample}>
            Explore a sample semester <ArrowRight size={16} />
          </button>
        </div>
      </section>
    </main>
  );
}
