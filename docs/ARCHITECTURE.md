# Architecture

## Current implementation

React + Vite -> same-origin `/api` requests -> Express -> file-backed BacklogStore.

Catalog requests go from Express to Open Library, IGDB, or TMDB. Provider credentials never enter the web bundle. Vite proxies `/api` to port 3001 during development. The Node process serves `dist/` for the local production build.

## Boundaries

- `shared/domain.ts`: Zod contracts, identity, and filtered ordering behavior.
- `apps/api/store.ts`: validated snapshots, serialized writes, atomic replacement, revision conflicts.
- `apps/api/providers.ts`: provider status, search normalization, timeout, bounded one-minute in-memory cache, Twitch token refresh.
- `apps/api/app.ts`: HTTP validation, local-origin restrictions, errors, and bounded search request rate.
- `apps/web/src`: rendering, dialog/search state, filters, drag-and-drop, mutation requests.

## Storage decision

The current slice uses a JSON file because it needs no cloud credentials and supports the user's narrow add/reorder workflow. It is a prototype persistence adapter, not a scalable multi-user database.

Only one process may write a data file. File contents are validated on read. Corrupt files produce errors; they are not silently reset. Writes serialize within the process and replace the file atomically. No durability guarantee beyond the operating system's normal filesystem behavior is claimed.

## Future account/cloud migration

Introduce authentication, per-owner repositories and authorization checks, then migrate snapshots into Firestore or another selected database. Version the migration and preserve existing IDs. Reconsider query/index requirements before social functionality. Firebase Admin bypasses Firestore rules, so authorization must also be implemented in the API.

The responsive web interface is mobile-browser support. A React Native/Expo app remains future work.
