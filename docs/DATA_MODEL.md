# Data model and HTTP contracts

Executable schemas in `shared/domain.ts` are authoritative.

Each Firebase project/verified UID has a Firestore root at `backlogs/<sha256(JSON.stringify([projectId, uid]))>`, with schemaVersion, revision, count and chunks. Ordered entries live in numbered `chunks` child documents, 50 entries per document and at most 20 chunks. All reads/writes are transactional. The API never selects an owner using URL, query, or body parameters. Explicit file mode uses `data/users/<same-hash>.json` (or the sibling `users/` directory of BACKLOG_DATA_FILE). See FIRESTORE.md for setup and non-overwriting import.

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

This prototype stores normalized metadata directly on each user's entry. A shared catalog table is a future change.

## API

The following routes require `Authorization: Bearer <Firebase ID token>`; the server verifies the signature, issuer, project audience, expiry, and subject before resolving the account's store.

- `GET /api/backlog`: current snapshot.
- `POST /api/backlog`: validated media -> updated snapshot. Existing identity returns unchanged snapshot.
- `PUT /api/backlog/order`: `{ revision, ids }` -> updated snapshot. IDs must be an exact permutation of the existing entries.
- `DELETE /api/backlog/:id`: `{ revision }` -> updated snapshot.
- `GET /api/providers`: provider names and availability, never secrets.
- `GET /api/search?type=book&q=...`: normalized results; minimum 2, maximum 100 query characters.

Validation errors use 400; missing entries use 404; stale revisions use 409; search rate limits use 429; upstream failures use 502; unconfigured providers use 503. Error responses contain an `error` message.

Missing/invalid authentication uses 401; missing Firebase configuration uses 503 and never falls back to anonymous data. `/api/health` and `/api/auth/config` are public; they return no backlog or provider secrets.

## Concurrency

Firestore add operations merge against the current snapshot in a retryable transaction. Reordering and removal require the current revision. Root and chunk reads/writes are atomic across processes. No operation may overwrite a corrupt snapshot. Explicit file mode retains a single-process serialized mutation queue; multi-process file access is unsupported.
