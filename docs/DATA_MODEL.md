# Data model and HTTP contracts

Executable schemas in `shared/domain.ts` are authoritative.

## Snapshot

`revision`: nonnegative integer, incremented for changes.

`entries`: ordered array of up to 1,000 entries. Array position is priority; there is no separate rank field or category table.

## Entry

- `id`: generated UUID.
- `type`: game, book, or movie.
- `title`: required trimmed text, 1–200 characters.
- `subtitle`: optional author, platform list, director, or original title; at most 200 characters.
- `year`: optional four-digit string.
- `coverUrl`: optional HTTPS URL supplied by the catalog adapter.
- `source`: manual, openlibrary, igdb, or tmdb.
- `sourceId`: provider ID, or a client UUID for manual entry.
- `addedAt`: server-generated ISO timestamp.

This prototype stores normalized metadata directly on the entry. Shared catalog records and per-user entries are a future split when accounts are implemented.

## API

- `GET /api/backlog`: current snapshot.
- `POST /api/backlog`: validated media -> updated snapshot. Existing identity returns unchanged snapshot.
- `PUT /api/backlog/order`: `{ revision, ids }` -> updated snapshot. IDs must be an exact permutation of the existing entries.
- `DELETE /api/backlog/:id`: `{ revision }` -> updated snapshot.
- `GET /api/providers`: provider names and availability, never secrets.
- `GET /api/search?type=book&q=...`: normalized results; minimum 2, maximum 100 query characters.

Validation errors use 400; missing entries use 404; stale revisions use 409; search rate limits use 429; upstream failures use 502; unconfigured providers use 503. Error responses contain an `error` message.

## Concurrency

Add operations merge against the latest file contents under a serialized mutation queue. Reordering and removal require the current revision. No operation may overwrite a corrupt snapshot. Multi-process access is unsupported.
