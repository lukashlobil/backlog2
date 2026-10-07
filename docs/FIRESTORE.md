# Firestore persistence

The Node API now uses Cloud Firestore by default. The React app still calls the same authenticated API; it never receives server credentials. Explicit `BACKLOG_STORAGE=file` retains the previous local-only mode. There is no automatic fallback to files if Firestore fails.

## One-time Firebase setup

1. In the same Firebase project used for Authentication, open Build > Firestore Database and create a **Standard edition, `(default)` database in production mode**. Choose a region appropriate for your users/server; the database location cannot simply be changed later.
2. Publish the contents of `firestore.rules` in the Firestore Rules tab. These rules deny all direct browser/mobile access. Alternatively, use `npx firebase deploy --only firestore:rules --project YOUR_PROJECT_ID` after authenticating the CLI. Do not deploy these database-wide deny rules over another application's shared database without reviewing its access needs.
3. For local Docker, create a dedicated Google Cloud service account with the **Cloud Datastore User** role (`roles/datastore.user`) in this project. Create/download a JSON key and save it at `.secrets/firebase-service-account.json`. Prefer a dedicated account rather than an Owner/Editor key. Do not paste or commit the key. `.secrets/` is excluded from both Git and Docker build context.
4. Keep the existing four `FIREBASE_*` web settings in `.env`. `BACKLOG_STORAGE=firestore` is optional because it is the default.
5. Start/recreate the service:

```sh
docker compose -f compose.yaml -f compose.firestore.yaml up --build -d --wait
```

The second Compose file mounts the JSON read-only as `/run/secrets/firebase_service_account` and sets `GOOGLE_APPLICATION_CREDENTIALS` inside the container. It never copies the key into the image. Use both `-f` arguments on later `up`/recreate commands, too; omitting the override removes the credential mount. Keep the key private on the host and readable by the container's non-root user.

For npm development, add this to `.env`, then restart `npm run dev`:

```dotenv
GOOGLE_APPLICATION_CREDENTIALS=.secrets/firebase-service-account.json
```

Alternatively, use Application Default Credentials from a local `gcloud auth application-default login`. On a future Google Cloud deployment, use an attached workload/service identity with the necessary IAM role instead of a downloaded long-lived key.

The web API key is not a database administrator credential. Authentication can succeed while database access fails if the database, IAM role, or server credentials are missing. `/api/health` checks process liveness, not database readiness. Test actual access by signing in, adding a title, refreshing, and confirming it remains.

## Existing data: opt-in, non-overwriting import

Local files and the existing Docker data volume are preserved. They are not automatically uploaded or attached to a different user. Back them up before migration. The Docker volume and host `data/` are separate sources; use the runtime that holds the desired source.

1. Find your exact UID in Firebase Authentication > Users.
2. Before saving new cloud items, set `FIRESTORE_IMPORT_UID=your_exact_uid` in `.env`.
3. For a pre-auth shared `backlog.json` only, also set `LEGACY_BACKLOG_OWNER_UID` to that same UID. For an existing authenticated per-user file, this second setting is unnecessary.
4. Recreate/restart the backend and open your backlog while signed into that account. Its first read or mutation imports the snapshot only if no Firestore root document exists for that account. IDs, timestamps, order and revision are preserved.
5. Verify the cloud list, then remove the import settings and recreate/restart again.

The import is transactional, idempotent, and never overwrites a cloud list, including an empty list created by deleting all items. Local source files are retained. Missing local files import an empty snapshot; unreadable or corrupt files fail without replacing cloud data. If both stores already contain items, stop and plan an explicit merge rather than deleting data to force an import. Turning file mode back on does not copy newer cloud changes back to disk.

## Storage and security

- Root: `backlogs/<sha256(JSON.stringify([projectId, verifiedUid]))>`.
- Root fields: `schemaVersion: 1`, `revision`, `count`, `chunks`.
- Child documents: `chunks/0` through `chunks/19`, each containing an ordered `entries` array of at most 50 items. This keeps the 1,000-item capacity without exceeding the per-document size limit for large metadata.
- All root/chunk reads and mutations use Firestore transactions. Concurrent changes retry; stale reorder/removal revisions return HTTP 409. Duplicate additions do not advance the revision.
- Transactions validate stored schemas and chunk completeness before writing. A corrupt snapshot is reported, never silently reset. Mutations write the root and current chunks, deleting obsolete trailing chunks atomically.
- Firebase Admin bypasses security rules, so the Node API verifies ID tokens and selects the owner exclusively from the verified UID. IAM controls the server's access; deny-all rules block direct client access.
- No Firestore realtime listeners/offline editing are added. Lists load through the API; saves are confirmed before updating the UI.
- A load reads one root plus up to 20 chunks. Changes write those documents; retries can add reads. This small-list design favors atomic consistency over minimum write count. Monitor usage and configure billing alerts as appropriate. Consider a per-entry model for a larger product.
- Firestore data is independent of the Docker volume, but this is not a backup system. Configure appropriate managed backups/export before relying on it for important data.

## Verification

`npm test` covers domain/API behavior and storage configuration guards. `npm run test:firestore` uses only the Firestore emulator on `127.0.0.1:8085` with `demo-backlog-storage`, never live credentials. It covers concurrent additions/reordering, duplicate protection, persistence across repository instances, account isolation, rules denial, opt-in imports, large snapshots, and corrupt chunks.

`npm run test:e2e` uses Auth (9099) and Firestore (8085) emulators together, a demo project and the test API on 3002. Install Java 21+ for Firestore emulation and Chromium for Playwright. Do not run both emulator suites at once. Emulator data is disposable and never uses the production project or local backlog files.

Official references: [server setup and credentials](https://firebase.google.com/docs/firestore/quickstart-server), [transactions](https://firebase.google.com/docs/firestore/manage-data/transactions), [server-only rules](https://firebase.google.com/docs/firestore/security/insecure-rules).
