import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { createUserWithEmailAndPassword, GoogleAuthProvider, onIdTokenChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup, signOut, type Auth, type User } from 'firebase/auth';
import { Layers3, LoaderCircle, LogOut, Mail } from 'lucide-react';
import { firebaseAuth } from './firebase';

const Account = createContext<{ auth: Auth; user: User } | null>(null);
function authMessage(error: unknown): string {
  const code = (error as { code?: string }).code;
  switch (code) {
    case 'auth/invalid-credential': case 'auth/wrong-password': case 'auth/user-not-found': return 'The email or password is incorrect. Please try again.';
    case 'auth/email-already-in-use': return 'Could not create this account. Try signing in or resetting your password.';
    case 'auth/invalid-email': return 'Please enter a valid email address.';
    case 'auth/weak-password': case 'auth/password-does-not-meet-requirements': return 'Choose a stronger password that meets the project’s password policy.';
    case 'auth/popup-closed-by-user': case 'auth/cancelled-popup-request': return 'Google sign-in was closed. You can try again.';
    case 'auth/popup-blocked': return 'Allow pop-ups for this page, then try Google sign-in again.';
    case 'auth/too-many-requests': return 'Too many attempts. Please wait a little before trying again.';
    case 'auth/network-request-failed': return 'Could not reach sign-in. Check your connection and try again.';
    case 'auth/unauthorized-domain': return 'Sign-in is not enabled for this website address yet.';
    case 'auth/operation-not-allowed': return 'This sign-in method is not enabled yet.';
    case 'auth/account-exists-with-different-credential': return 'Use the sign-in method you originally used for this email.';
    default: return 'Sign-in could not be completed. Please try again.';
  }
}

export function AccountControls({ disabled }: { disabled: boolean }) {
  const account = useContext(Account)!;
  const [error, setError] = useState('');
  const [leaving, setLeaving] = useState(false);
  async function leave() {
    setLeaving(true); setError('');
    try { await signOut(account.auth); }
    catch { setError('Could not sign out. Please try again.'); setLeaving(false); }
  }
  return <div className="account-controls"><span title={account.user.email ?? 'Signed in'}>{account.user.email ?? account.user.displayName ?? 'Your account'}</span><button className="icon-button" aria-label="Sign out" title="Sign out" disabled={disabled || leaving} onClick={() => void leave()}><LogOut size={17} /></button>{error && <span role="alert">{error}</span>}</div>;
}

function AuthShell({ children }: { children: ReactNode }) {
  return <div className="auth-page"><div className="auth-brand brand"><span className="brand-mark"><Layers3 size={23} /></span>backlog<span className="brand-dot">.</span></div><main className="auth-card">{children}</main><p className="auth-footnote">A little space for your next favorite.</p></div>;
}

function SignIn({ auth }: { auth: Auth }) {
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  function changeMode(next: typeof mode) { setMode(next); setError(''); setNotice(''); setPassword(''); setConfirm(''); }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(''); setNotice('');
    if (mode === 'signup' && password !== confirm) { setError('The passwords don’t match.'); return; }
    setBusy(true);
    try {
      if (mode === 'signup') await createUserWithEmailAndPassword(auth, email.trim(), password);
      else if (mode === 'signin') await signInWithEmailAndPassword(auth, email.trim(), password);
      else {
        try { await sendPasswordResetEmail(auth, email.trim()); }
        catch (error) { if ((error as { code?: string }).code !== 'auth/user-not-found') throw error; }
        setNotice('If an account exists for that email, you’ll receive a password reset link.');
      }
    } catch (error) { setError(authMessage(error)); }
    finally { setBusy(false); }
  }
  async function google() {
    setBusy(true); setError(''); setNotice('');
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
    } catch (error) { setError(authMessage(error)); }
    finally { setBusy(false); }
  }
  return <AuthShell>
    <span className="eyebrow">GOOD THINGS AHEAD</span>
    <h1>{mode === 'signup' ? 'Make yourself at home.' : mode === 'reset' ? 'A fresh start.' : 'Welcome back.'}</h1>
    <p className="auth-description">{mode === 'signup' ? 'Create an account for a backlog that’s just yours.' : mode === 'reset' ? 'Enter your email and we’ll help you reset your password.' : 'Sign in to your personal collection of things to look forward to.'}</p>
    {error && <p role="alert" className="error-banner">{error}</p>}
    {notice && <p role="status" className="auth-notice">{notice}</p>}
    {mode !== 'reset' && <><button className="secondary-button google-button" disabled={busy} onClick={() => void google()}><span aria-hidden="true" className="google-letter">G</span>Continue with Google</button><div className="auth-divider"><span>or with email</span></div></>}
    <form className="manual-form auth-form" onSubmit={submit}>
      <label>Email<input required type="email" autoComplete="email" value={email} maxLength={254} disabled={busy} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" /></label>
      {mode !== 'reset' && <label>Password<input required type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={mode === 'signup' ? 8 : undefined} maxLength={128} value={password} disabled={busy} onChange={event => setPassword(event.target.value)} placeholder={mode === 'signup' ? 'At least 8 characters' : 'Your password'} /></label>}
      {mode === 'signup' && <label>Confirm password<input required type="password" autoComplete="new-password" value={confirm} disabled={busy} onChange={event => setConfirm(event.target.value)} /></label>}
      {mode === 'signin' && <button type="button" className="text-button forgot-button" disabled={busy} onClick={() => changeMode('reset')}>Forgot password?</button>}
      <button type="submit" className="primary-button wide" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : <Mail size={17} />}{mode === 'signup' ? 'Create account' : mode === 'reset' ? 'Send reset link' : 'Sign in'}</button>
    </form>
    <div className="auth-switch">{mode === 'signin' ? <>New here? <button className="text-button" disabled={busy} onClick={() => changeMode('signup')}>Create an account</button></> : <button className="text-button" disabled={busy} onClick={() => changeMode('signin')}>Back to sign in</button>}</div>
  </AuthShell>;
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<Auth | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};
    setLoading(true); setError('');
    firebaseAuth().then(auth => {
      if (!active) return;
      setAuth(auth);
      if (!auth) { setLoading(false); return; }
      unsubscribe = onIdTokenChanged(auth, user => { if (active) { setUser(user); setLoading(false); } });
    }).catch(() => { if (active) { setError('Could not connect to sign-in. Please try again.'); setLoading(false); } });
    return () => { active = false; unsubscribe(); };
  }, [attempt]);
  if (loading) return <AuthShell><LoaderCircle className="spin" size={25} /><p className="auth-description" role="status">Opening your space…</p></AuthShell>;
  if (error) return <AuthShell><h1>Let’s try again.</h1><p className="error-banner" role="alert">{error}</p><button className="primary-button" onClick={() => setAttempt(value => value + 1)}>Retry connection</button></AuthShell>;
  if (!auth) return <AuthShell><span className="eyebrow">ALMOST THERE</span><h1>Your space is getting ready.</h1><p className="auth-description">Sign-in hasn’t been connected yet. Once setup is complete, your personal backlog will be ready here.</p><button className="secondary-button" onClick={() => window.location.reload()}>Check again</button></AuthShell>;
  if (!user) return <SignIn auth={auth} />;
  return <Account.Provider key={user.uid} value={{ auth, user }}>{children}</Account.Provider>;
}
