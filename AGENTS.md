# Backlog agent instructions

## Context

Read docs/PRODUCT.md and docs/ARCHITECTURE.md before changing behavior. Read docs/DATA_MODEL.md for persistence or HTTP changes and docs/INTEGRATIONS.md for provider work. docs/PLAN.md tracks scope. README.md contains real commands.

## Scope

This version is a React + Node app for adding and reordering games, books, and movies, with Firebase Authentication and private per-user Firestore backlogs. Explicit file mode remains for local operation/imports. Native mobile, social features, reviews, and purchasing are not implemented. Read docs/AUTH.md for authentication changes and docs/FIRESTORE.md for cloud persistence.

## Boundaries

- Use TypeScript. Shared schemas and ordering rules live in shared/domain.ts.
- Keep provider credentials and calls on the backend.
- Validate HTTP payloads and preserve existing data on failures.
- Preserve media identity, duplicate protection, and exact-permutation ordering checks.
- Filtered reordering must not move entries outside that filter.
- Keep list mutations serialized and reject stale reorder/removal revisions.
- Require a verified Firebase ID token for backlog and catalog API operations; derive the owner from its UID, never client-supplied identifiers.
- Missing Firebase configuration must fail closed. Emulator access is restricted to NODE_ENV=test with demo- project IDs.
- Never automatically assign the legacy shared backlog to the first signed-in account. Migration requires an explicit owner UID.
- Keep Docker ports local until public deployment is explicitly requested.
- Do not commit .env, user data, browser binaries, or test output.
- Never commit or build-copy .secrets/ or service-account keys. Firestore Admin access is server-only; keep client rules deny-all and owner selection derived from verified tokens.
- Run npm run test:firestore for persistence changes. Emulator tests must use demo projects only, never live credentials or user data.
- Preserve unrelated changes, including the existing Rider files.

## Verification

Run npm test and npm run build for relevant code changes. Run npm run test:e2e for add/reorder UI changes. On PowerShell, use npm.cmd if npm.ps1 is blocked. Browser tests use isolated test data, never data/backlog.json. Document tests that could not run. Mock providers in routine tests and distinguish those from live integration checks.

## Done

Acceptance criteria work, relevant checks pass, loading/error/empty states are handled, and documentation reflects implemented behavior. Explain remaining limitations clearly.
