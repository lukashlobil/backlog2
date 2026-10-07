# Implementation plan

## First slice

- [x] Create the React/TypeScript and Node skeleton.
- [x] Define validated media and snapshot contracts.
- [x] Implement local persistence and duplicate protection.
- [x] Implement book, game, and movie search adapters.
- [x] Support manual entry and provider-unavailable states.
- [x] Implement responsive list and media filters.
- [x] Persist drag, keyboard, and button-based ordering.
- [x] Detect stale mutations and protect existing data on errors.
- [x] Add domain, API, and desktop/mobile browser tests.
- [x] Document setup, boundaries, and future migration.

## Release verification

Run `npm test`, `npm run build`, and `npm run test:e2e`. Do not mark verification complete based only on a checkbox here. Record actual results in the handoff.

Verified on 2026-10-07:
- Six domain/API/persistence tests passed.
- TypeScript checking and the production build passed.
- Eight browser scenarios passed across desktop and mobile-sized Chromium. Six passed in the full run; the remaining two keyboard tests passed on targeted rerun after synchronizing with the drag sensor's measurement state.
- Reviewed desktop and mobile screenshots; adjusted the phone filter bar to fit all four views.
- `npm run dev` started successfully; the web page returned HTTP 200.
- Live Open Library search for The Hobbit returned normalized book results.
- npm dependency audit reported zero vulnerabilities after removing the affected development runner dependency.
- IGDB and TMDB live searches were not tested because credentials are not configured.

## Follow-up, outside this version

- IGDB is configured and was verified live; configure movie credentials when needed.
- Firebase web configuration is supplied. Firestore implementation is complete; finish cloud database/IAM credential setup and verify live sign-in and persistence.
- Complete public-release provider attribution review, including approved TMDB artwork.
- Consider native mobile and custom categories after validating the core flow.
- Social features and purchasing remain explicitly excluded.

## Firebase Authentication implementation

- Email/password registration and login, Google sign-in, password reset, logout.
- Server-verified tokens and private per-project/per-UID backlog files.
- Missing configuration fails closed; test emulator mode is forbidden in production.
- Preserved pre-auth data; explicit LEGACY_BACKLOG_OWNER_UID enables non-overwriting import.
- Runtime Firebase configuration works in npm development and Docker.
- Ten backend tests passed, including unauthorized access, account isolation, unsigned-token rejection, and migration behavior.
- Eighteen desktop/mobile emulator browser scenarios passed: sixteen authentication/backlog tests plus two Google popup cases. The mobile Google case passed on targeted rerun after waiting for the official emulator picker to finish loading.
- Production build and Docker compilation/backend tests passed. Real-project OAuth and email delivery still require the user's Firebase configuration.
- Docker smoke checks passed with the new authentication gate. The running Docker service was updated and is healthy; missing Firebase configuration is reported without exposing data. Temporary smoke-test containers and volumes were removed; personal data was not deleted.
- Production dependency audit is clean after compatible gRPC/UUID overrides. The development-only Firebase CLI currently has nine transitive audit findings (two moderate, seven high); it is excluded from the runtime image. Do not apply the audit's proposed major downgrades blindly. Track upstream fixes before exposing any emulator tooling beyond localhost.

## Firestore persistence implementation

- Firestore is the default storage; explicit file mode remains for compatibility and imports, with no silent fallback.
- Per-owner root/revision and bounded 50-entry chunks are read/written in transactions; the 1,000-item capacity is preserved.
- Added deny-all direct-client rules, server-only Application Default Credentials, runtime-only Docker secret mounting and Git/build exclusions.
- Explicit FIRESTORE_IMPORT_UID enables a non-overwriting single-account import; local data remains intact.
- Eleven backend/configuration tests and six Firestore emulator integration tests passed. TypeScript, frontend and compiled-server builds passed.
- Integration coverage includes concurrent changes, duplicate protection, account isolation, direct-client rules denial, 1,000-item import, stale revisions and corrupt chunk protection.
- All eighteen desktop/mobile browser scenarios passed using Auth and Firestore emulators together. An orphaned emulator from the prior test run was identified and stopped before this run; no user services were stopped.
- Docker image build and disposable-container smoke checks passed. The existing running service was not replaced while cloud credentials are pending. Smoke-test resources were removed; existing data was preserved.
- Live Firestore activation requires a database and server credentials; no cloud migration or writes were performed during implementation.
