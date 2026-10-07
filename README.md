# Backlog

A small, local-first backlog for games, books, and movies. Add a title, choose what comes next, and keep your order between sessions.

## Current version

- Responsive React/TypeScript web interface for desktop and mobile browsers.
- Search books through Open Library; search games through IGDB and movies through TMDB after configuring credentials.
- Manual entry for all three media types, including optional author/platform/director and year.
- Drag ordering, keyboard drag ordering, and accessible move-up/down buttons.
- Filter by media type; ordering within a filter preserves other types' positions.
- Duplicate protection, confirmed removal, server-side persistence, and stale-order conflict detection.
- One local list. No accounts, cloud synchronization, native mobile app, social features, purchases, reviews, or completion tracking in this version.

## Run

Use Node.js 22.13 or newer and npm. From the repository root:

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5173. The Node API runs on port 3001. Both bind to loopback; this application is intended for local use and has no authentication.

In Windows PowerShell, use `npm.cmd` if execution policy blocks `npm.ps1`.

The development command reloads web changes. Restart it for backend changes, or run `npm run dev:api` and `npm run dev:web` in separate terminals for backend watch mode.

## Run with Docker

Start Docker Desktop with Linux containers enabled. From the repository root:

```sh
docker compose up --build -d --wait
```

Open **http://127.0.0.1:8080**. The container serves both the built React frontend and the API; Vite is not required at runtime. Only the local computer can access the published port. The existing non-Docker development server can continue on port 5173.

Compose reads the existing `.env` for optional IGDB/TMDB credentials. Credentials are passed at runtime, never copied into the image or build context. Set `BACKLOG_HTTP_PORT=8081` in `.env` to choose another host port. After changing credentials or the port, run `docker compose up -d --wait` again to recreate the service with the new configuration.

```sh
docker compose ps
docker compose logs --tail=50 backlog
docker compose down
```

Data is stored in the named `backlog-data` volume at `/app/data/backlog.json`. Normal stop, restart, rebuild, and `docker compose down` preserve it. **`docker compose down --volumes` deletes the container's backlog**, so do not use it unless you intend to erase that data. Run one replica per volume.

The Docker backlog starts separately from your existing local `data/backlog.json`; it does not import or modify that file. To make a backup of the Docker backlog after at least one item has been saved:

```sh
docker compose cp backlog:/app/data/backlog.json ./backlog-docker-backup.json
```

Store backups privately. For a standalone image build: `docker build -t backlog:local .`. The image compiles and tests the application during the build, includes only production dependencies at runtime, runs as the `node` user, and checks `/api/backlog` for health. Compose additionally uses a read-only root filesystem with a writable data volume.

After `docker compose build`, run `npm run test:docker` to check the image's static assets, non-root runtime, writes, reordering, graceful shutdown, and persistence across container replacement. This uses a disposable container and volume, which it removes afterward. For a custom image tag, use `npm run test:docker -- backlog:local`. It requires Node on the host; normal Docker usage does not.

## Catalog connections

Copy `.env.example` to `.env` and fill in optional values:

| Variable | Purpose |
| --- | --- |
| `IGDB_CLIENT_ID` | Twitch application client ID for IGDB |
| `IGDB_CLIENT_SECRET` | Twitch application secret; the API obtains and refreshes the app access token |
| `TMDB_ACCESS_TOKEN` | TMDB API Read Access Token (not the short API key) |
| `BACKLOG_DATA_FILE` | Optional path to the JSON data file; defaults to `data/backlog.json` |
| `PORT` | Optional API port; defaults to 3001. Changing this also requires changing the Vite proxy for development. |

Books need no credential. All credentials stay on the server. Restart the API after editing `.env`. See [integration notes](docs/INTEGRATIONS.md) for registration, attribution, and usage restrictions.

## Persistence

The Node backend stores entries in `data/backlog.json`, not browser storage. Back up that file to preserve your list. Clearing browser history does not clear the list. All browser tabs using this server share the same list.

Run only one API process against a given data file. Atomic file replacement and serialized mutations protect one process; this is not a multi-server database. Do not expose this unauthenticated app to the public internet. Firebase/cloud persistence is a future migration, not an implemented feature.

## Verify

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

The browser tests require a built `dist/` directory and use a separate data file under `test-results/`, never your personal `data/` file. They cover desktop and mobile-sized Chromium. External catalog search is mocked in routine browser tests; live provider access is not guaranteed by those tests.

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
apps/api/       Express API, catalog adapters, file-backed repository
shared/        Validated data contracts and ordering logic
scripts/       Development runner
tests/         Domain/API tests and browser workflows
docs/          Product, architecture, data, integration, and implementation notes
```

Start with [PRODUCT.md](docs/PRODUCT.md), [ARCHITECTURE.md](docs/ARCHITECTURE.md), and [PLAN.md](docs/PLAN.md). Existing Rider solution files are preserved; the app runs through npm.
