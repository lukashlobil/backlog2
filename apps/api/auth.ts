import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import type { AuthConfig } from '../../shared/auth.ts';

type Env = Record<string, string | undefined>;
export type TokenVerifier = (token: string) => Promise<{ uid: string }>;

export function authConfig(env: Env): AuthConfig {
  const firebase = {
    apiKey: env.FIREBASE_API_KEY?.trim() ?? '',
    authDomain: env.FIREBASE_AUTH_DOMAIN?.trim() ?? '',
    projectId: env.FIREBASE_PROJECT_ID?.trim() ?? '',
    appId: env.FIREBASE_APP_ID?.trim() ?? '',
  };
  const emulator = env.FIREBASE_AUTH_EMULATOR_HOST;
  if (emulator && (env.NODE_ENV !== 'test' || !firebase.projectId.startsWith('demo-'))) {
    throw new Error('The Auth emulator is restricted to tests using a demo- Firebase project.');
  }
  const configured = Object.values(firebase).every(Boolean);
  return { configured, firebase: configured ? firebase : null, ...(emulator ? { emulatorUrl: `http://${emulator}` } : {}) };
}

export function createTokenVerifier(env: Env): TokenVerifier | undefined {
  const config = authConfig(env);
  if (!config.firebase) return undefined;
  const projectId = config.firebase.projectId;
  const name = `backlog-${projectId}`;
  const app = getApps().find(app => app.name === name) ?? initializeApp({ projectId }, name);
  // Verification uses Firebase's public signing certificates; no private key is
  // required for this operation. It checks signature, issuer, audience and expiry.
  return async token => {
    const claims = await getAuth(app).verifyIdToken(token);
    return { uid: claims.uid };
  };
}
