# Backlog

A personal backlog for games, books, and movies. Sign in with Firebase, add a title, and keep your order between sessions.

## Current version

- Responsive React/TypeScript web interface for desktop and mobile browsers.
- Search books through Open Library; search games through IGDB and movies through TMDB after configuring credentials.
- Manual entry for all three media types, including optional author/platform/director and year.
- Drag ordering, keyboard drag ordering, and accessible move-up/down buttons.
- Filter by media type; ordering within a filter preserves other types' positions.
- Duplicate protection, confirmed removal, server-side persistence, and stale-order conflict detection.
- Firebase email/password and Google sign-in, registration, password reset, and sign-out.
- Private per-account backlogs in Cloud Firestore, with explicit local-file mode and safe opt-in imports. No native mobile app, social features, purchases, reviews, or completion tracking in this version.

## Run

Use Node.js 22.13 or newer and npm. From the repository root:

```sh
npm install
npm run dev
```

Configure Firebase Authentication following [docs/AUTH.md](docs/AUTH.md) and cloud persistence following [docs/FIRESTORE.md](docs/FIRESTORE.md), then open http://127.0.0.1:5173. The Node API runs on port 3001. Both bind to loopback. Missing Firebase configuration shows a setup screen and blocks access to data; there is no anonymous fallback.

In Windows PowerShell, use `npm.cmd` if execution policy blocks `npm.ps1`.

The development command reloads web changes. Restart it for backend changes, or run `npm run dev:api` and `npm run dev:web` in separate terminals for backend watch mode.

## Run with Docker

Start Docker Desktop with Linux containers enabled. First create the Firestore database and save a server credential at `.secrets/firebase-service-account.json` as described in [docs/FIRESTORE.md](docs/FIRESTORE.md). From the repository root:

```sh
docker compose -f compose.yaml -f compose.firestore.yaml up --build -d --wait
```

Open **http://127.0.0.1:8080**. The container serves both the built React frontend and the API; Vite is not required at runtime. Only the local computer can access the published port. The existing non-Docker development server can continue on port 5173.

Compose reads the existing `.env` for Firebase configuration and optional IGDB/TMDB credentials. The override mounts the service-account key read-only at runtime; it is excluded from the image/build context. Set `BACKLOG_HTTP_PORT=8081` in `.env` to choose another host port. After changing configuration, run the command above again (you can omit `--build`), retaining both `-f` arguments. Explicit file mode (`BACKLOG_STORAGE=file`) can use base `compose.yaml` without the credential override.

```sh
docker compose ps
docker compose logs --tail=50 backlog
docker compose down
```

New data is stored in Firestore by default. The named `backlog-data` volume still preserves existing local files under `/app/data/users/` for explicit migration or file mode. Normal stop, rebuild, and `docker compose down` preserve it. **`docker compose down --volumes` deletes those local files**, so do not use it unless you intend to erase them. Firestore data is independent of this volume. File mode supports only one writer per volume.

Docker file storage is separate from host `data/`. Existing files are preserved, not automatically uploaded; see [Firestore import](docs/FIRESTORE.md#existing-data-opt-in-non-overwriting-import). To back up all Docker account files to a new directory (this is not a Firestore backup):

```sh
docker compose cp backlog:/app/data ./backlog-docker-backup
```

Store backups privately. For a standalone image build: `docker build -t backlog:local .`. The image compiles and tests the application during the build, includes only production dependencies at runtime, runs as the `node` user, and checks `/api/health` for process health. A healthy container may still need Firebase configuration; it does not expose data until configured and authenticated. Compose additionally uses a read-only root filesystem with a writable data volume.

After `docker compose build`, run `npm run test:docker` to check static assets, non-root runtime, the closed authentication gate without configuration, graceful shutdown, and container replacement. This uses a disposable container and volume, which it removes afterward. Authenticated writes and persistence are verified by API and emulator tests. For a custom image tag, use `npm run test:docker -- backlog:local`. It requires Node on the host; normal Docker usage does not.

## Firebase setup

Follow [docs/AUTH.md](docs/AUTH.md) to register a Firebase web app, enable Email/Password and Google providers, and authorize localhost addresses. Fill the four Firebase entries already prepared in `.env`:

```dotenv
FIREBASE_API_KEY=...
FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
FIREBASE_PROJECT_ID=your-project
FIREBASE_APP_ID=...
```

These are public web configuration values. Token verification alone needs no private key, but Firestore requires separate server credentials. Follow [docs/FIRESTORE.md](docs/FIRESTORE.md), then recreate the Docker service or restart the dev server. Never put the private service-account key into React variables or commit it.

## Catalog connections

If `.env` does not exist, copy `.env.example` to it. Otherwise edit the existing file without overwriting your settings. Optional values:

| Variable | Purpose |
| --- | --- |
| `IGDB_CLIENT_ID` | Twitch application client ID for IGDB |
| `IGDB_CLIENT_SECRET` | Twitch application secret; the API obtains and refreshes the app access token |
| `TMDB_ACCESS_TOKEN` | TMDB API Read Access Token (not the short API key) |
| `BACKLOG_DATA_FILE` | Local-file/import source base path; defaults to `data/backlog.json` |
| `BACKLOG_STORAGE` | Defaults to `firestore`; set `file` only for deliberate local-only operation |
| `GOOGLE_APPLICATION_CREDENTIALS` | Server credential file path for npm usage; Docker override supplies its own mounted path |
| `FIRESTORE_IMPORT_UID` | Optional exact owner UID for a non-overwriting import from local files |
| `PORT` | Optional API port; defaults to 3001. Changing this also requires changing the Vite proxy for development. |

Books need no credential. All credentials stay on the server. Restart the API after editing `.env`. See [integration notes](docs/INTEGRATIONS.md) for registration, attribution, and usage restrictions.

## Persistence

The Node backend stores entries in Firestore, keyed by verified Firebase project/UID. Clearing browser history signs you out but does not delete your backlog. Signing in again to the same account against the same Firebase project restores it, independently of Docker rebuilds or host data files.

Firestore transactions protect concurrent mutations across API processes. Up to 1,000 entries are split across bounded-size documents, with atomic snapshot reads/writes and revision conflicts. Explicit file mode still permits only one API process per data directory. No automatic fallback or upload occurs; see [storage, migration and backup notes](docs/FIRESTORE.md). Public deployment remains future work.

## Verify

```sh
npm test
npm run test:firestore
npm run build
npx playwright install chromium
npm run test:e2e
```

The browser tests require built `dist/`, Java 21+ and Chromium. They start official Auth (9099) and Firestore (8085) emulators with a demo project and never touch live accounts or personal files. They cover desktop/mobile sign-in and backlog flows. `test:firestore` separately tests persistence and rules against an isolated Firestore emulator; do not run both emulator suites simultaneously. External catalog search is mocked; real OAuth/email delivery and live cloud credentials need separate verification.

For workspace-local browser downloads on PowerShell:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD/.browsers"
npx.cmd playwright install chromium
npm.cmd run test:e2e
```

For the production build served locally:

```sh
npm run build
npm start
```

Then open http://127.0.0.1:3001. `npm run typecheck` checks all TypeScript sources without building.

## Repository map

```text
apps/web/       React UI, styles, API client
apps/api/       Express API, catalog adapters, Firestore and file repositories
shared/        Validated data contracts and ordering logic
scripts/       Development runner
tests/         Domain/API tests and browser workflows
docs/          Product, architecture, data, integration, and implementation notes
```

Start with [PRODUCT.md](docs/PRODUCT.md), [ARCHITECTURE.md](docs/ARCHITECTURE.md), and [PLAN.md](docs/PLAN.md). Existing Rider solution files are preserved; the app runs through npm.
