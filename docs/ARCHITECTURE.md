# Architecture

## Current implementation

React + Firebase browser SDK -> same-origin `/api` requests carrying Firebase ID tokens -> Express with Firebase Admin verification -> per-user Firestore repository.

Catalog requests go from Express to Open Library, IGDB, or TMDB. Provider credentials never enter the web bundle. Vite proxies `/api` to port 3001 during development. The Node process serves `dist/` for the local production build.

## Boundaries

- `shared/domain.ts`: Zod contracts, identity, and filtered ordering behavior.
- `apps/api/store.ts`: validated snapshots, serialized writes, atomic replacement, revision conflicts.
- `apps/api/firestore.ts`: cloud repository, transactional snapshot chunks, storage selection and opt-in local import; reuses the same domain mutations.
- `apps/api/auth.ts`: public runtime Firebase configuration, Admin ID-token verification, and test-only emulator restrictions.
- `apps/web/src/AuthGate.tsx`: registration, login, password reset, Google popup, sign-out, and per-session UI lifetime.
- `apps/api/providers.ts`: provider status, search normalization, timeout, bounded one-minute in-memory cache, Twitch token refresh.
- `apps/api/app.ts`: HTTP validation, local-origin restrictions, errors, and bounded search request rate.
- `apps/web/src`: rendering, dialog/search state, filters, drag-and-drop, mutation requests.

## Storage decision

Firestore is the default. Backlog root documents are keyed by a SHA-256 hash of the Firebase project ID and verified UID. Ordered entries are split into chunks of at most 50 items. Root and chunk reads/writes share a transaction, supporting concurrent server processes without lost updates. Reorder/removal still require the current revision. See FIRESTORE.md for the schema, credential setup, costs and tests.

Explicit BACKLOG_STORAGE=file retains the previous JSON store, with one writer process, validated reads and serialized atomic replacements. Corruption in either storage mode is reported, not silently reset. There is no file fallback when Firestore fails.

## Cloud data migration

FIRESTORE_IMPORT_UID opts one exact account into a transactionally guarded, non-overwriting import from its local snapshot. Source files remain intact. Firestore schemaVersion is 1; existing IDs, order, timestamps and revision survive import. Reconsider query/index requirements before social functionality. Firebase Admin bypasses Firestore rules, so authorization remains enforced in the API; direct browser access is denied by firestore.rules.

The responsive web interface is mobile-browser support. A React Native/Expo app remains future work.

## Docker runtime

`Dockerfile` uses Node 22 Debian slim stages to install locked dependencies, run tests, build React, and compile backend TypeScript. `tsconfig.server.json` rewrites relative `.ts` imports into emitted `.js` imports. The final image runs compiled JavaScript directly with Node and excludes development dependencies, source credentials, and local data.

`HOST` defaults to loopback for direct npm usage. Docker sets `HOST=0.0.0.0` inside the container; Compose publishes container port 3001 only on host `127.0.0.1:8080`. Existing API host/origin checks stay in place. SIGTERM/SIGINT close the HTTP server gracefully.

Compose injects catalog credentials, public Firebase configuration, storage mode and optional migration UIDs from `.env`. The compose.firestore.yaml override mounts server credentials read-only as a Docker secret. A named volume at `/app/data` preserves old account files for opt-in migration/file mode; normal Firestore writes are remote. The application runs as UID 1000 (`node`) with a read-only root filesystem and ephemeral `/tmp`. File mode/imports still require a single writer per local volume.

Build and start with `docker compose -f compose.yaml -f compose.firestore.yaml up --build -d --wait`; see FIRESTORE.md. `/api/health` checks process liveness and `/api/auth/config` reports public auth configuration; neither proves live database access. Docker remains bound to localhost, not a public hosting configuration.
