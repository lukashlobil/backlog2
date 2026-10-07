import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:3002', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: 'firebase emulators:start --only auth,firestore --project demo-backlog --config firebase.test.json',
      url: 'http://127.0.0.1:9099',
      timeout: 120000,
      reuseExistingServer: false,
    },
    {
      command: 'npm run start',
      url: 'http://127.0.0.1:3002/api/health',
      env: {
        PORT: '3002', NODE_ENV: 'test', BACKLOG_STORAGE: 'firestore', BACKLOG_DATA_FILE: resolve('test-results/e2e-backlog.json'),
        FIREBASE_PROJECT_ID: 'demo-backlog', FIREBASE_API_KEY: 'demo-api-key',
        FIREBASE_AUTH_DOMAIN: 'demo-backlog.firebaseapp.com', FIREBASE_APP_ID: 'demo-app',
        FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099', LEGACY_BACKLOG_OWNER_UID: '',
        FIRESTORE_EMULATOR_HOST: '127.0.0.1:8085', FIRESTORE_IMPORT_UID: '', GOOGLE_APPLICATION_CREDENTIALS: '',
      },
      reuseExistingServer: false,
    },
  ],
});
