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

- Configure real game/movie credentials and verify searches against live providers.
- Confirm the desired account and cloud-sync scope before adding Firebase.
- Complete public-release provider attribution review, including approved TMDB artwork.
- Consider native mobile and custom categories after validating the core flow.
- Social features and purchasing remain explicitly excluded.
