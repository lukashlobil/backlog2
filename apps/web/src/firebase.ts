import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import type { AuthConfig } from '../../../shared/auth';

let runtime: Promise<Auth | null> | undefined;
export function firebaseAuth(): Promise<Auth | null> {
  if (!runtime) {
    runtime = (async () => {
      const response = await fetch('/api/auth/config', { cache: 'no-store' });
      if (!response.ok) throw new Error('Could not connect to sign-in. Please try again.');
      const config: AuthConfig = await response.json();
      if (!config.configured || !config.firebase) return null;
      const auth = getAuth(initializeApp(config.firebase));
      if (config.emulatorUrl) connectAuthEmulator(auth, config.emulatorUrl, { disableWarnings: true });
      return auth;
    })().catch(error => { runtime = undefined; throw error; });
  }
  return runtime;
}
