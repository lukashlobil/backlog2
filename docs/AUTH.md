# Firebase Authentication

## What is implemented

- Email/password account creation and login, Google popup login, password reset, and logout.
- Firebase browser SDK persistence and automatic ID-token refresh.
- Bearer tokens on all application API calls; one forced-refresh retry after a 401.
- Firebase Admin verifies ID-token signature, issuer, audience, expiry, and UID.
- Per-project/per-UID backlogs and authorization on every backlog/catalog route.
- Unmounting the previous account's UI on logout or UID change, and rejecting responses whose account changed while the request was running.
- Missing configuration fails closed with a setup screen rather than anonymous access.

Backlogs now use Firestore by default; see [FIRESTORE.md](FIRESTORE.md) for separate database credentials and setup. Explicit file mode retains local storage. The app is not publicly hosted.

## Configure your Firebase project

1. Open https://console.firebase.google.com/ and create/select a project.
2. In Project settings, add a Web app and copy its Firebase SDK configuration.
3. Under Build > Authentication, enable Email/Password and Google. Choose a support email for Google if prompted.
4. In Authentication > Settings > Authorized domains, add `localhost` and `127.0.0.1` for local usage.
5. Add the four values below to the existing root `.env`. Preserve the IGDB credentials already there.

```dotenv
FIREBASE_API_KEY=the_web_config_apiKey
FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_APP_ID=the_web_config_appId
```

These are public web-app identifiers, not service-account secrets. Do not put a service-account private key in the web config. The backend's current ID-token verification uses Firebase's public certificates and an explicit project ID; it does not perform admin user-management operations or need a private service-account key.

For Docker with Firestore credentials, run `docker compose -f compose.yaml -f compose.firestore.yaml up --build -d --wait`. Later config changes can omit `--build`, but must retain both Compose files. Firebase values are fetched at runtime rather than compiled into JavaScript. For npm development, restart `npm run dev`. Refresh the browser.

The app's default UI includes both sign-in methods. Enable both providers in Firebase, or request a UI/provider restriction. Configure your desired Firebase password policy, email templates, and email enumeration protection in the Firebase console.

## Preserve and assign your previous backlog

The previous `data/backlog.json` or `/app/data/backlog.json` remains untouched and private from all authenticated users by default.

The following procedure describes file mode. For Firestore, also set FIRESTORE_IMPORT_UID before the first cloud save and follow the complete non-overwriting import instructions in [FIRESTORE.md](FIRESTORE.md#existing-data-opt-in-non-overwriting-import).

To assign it to your own account:

1. Register/sign in and find your UID in Firebase Console > Authentication > Users.
2. Set `LEGACY_BACKLOG_OWNER_UID=your_exact_uid` in `.env`.
3. Restart/recreate the backend and sign in again.

On that user's first store access, the original snapshot is copied only if the destination account file does not already exist. It is never assigned to other accounts and never overwrites an existing account file, even if that file is empty. Remove the setting after a successful migration. If you've already saved items under the account, merging the old list is a separate task; do not delete either file to force a merge.

## Security boundaries

- Only Firebase ID tokens are accepted; client UIDs are not trusted.
- Raw tokens, passwords, and private keys are not logged or committed.
- Normal `verifyIdToken` validates a JWT, but does not query revocation or account-disabled status on every request. An already-issued ID token may remain valid until its normal expiry (typically one hour). Immediate server-side revocation checks and admin account-management credentials are not implemented.
- Firebase session persistence is managed by its SDK; logout removes the local session. Never implement a production fake-token or test-user bypass.
- Emulator mode requires both NODE_ENV=test and a project ID beginning `demo-`; a production process refuses to start with FIREBASE_AUTH_EMULATOR_HOST set.
- Docker remains localhost-only. Firestore supports concurrent API storage operations; public deployment and distributed abuse protection remain separate work.

## Testing

`npm test` covers missing/invalid tokens, cross-user read/write/reorder/delete isolation, explicit legacy import, project separation, unsigned-token rejection, and missing-config/emulator guards.

`npm run build` then `npm run test:e2e` starts the official Auth (9099) and Firestore (8085) emulators using `firebase.test.json`, with a demo project. Browser tests cover registration, sign-in, logout, persistence, separate accounts, reset feedback, expired-session handling, and add/reorder flows. Tests never use real accounts or production data. Ports 9099, 8085 and 3002 must be free; Java 21+ is required. Google production OAuth and real email delivery require your configured Firebase project for final live verification.

Official references:
- https://firebase.google.com/docs/auth/web/password-auth
- https://firebase.google.com/docs/auth/web/google-signin
- https://firebase.google.com/docs/auth/admin/verify-id-tokens
- https://firebase.google.com/docs/emulator-suite/connect_auth
