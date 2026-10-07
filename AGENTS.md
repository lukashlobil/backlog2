# Backlog agent instructions

## Context

Read docs/PRODUCT.md and docs/ARCHITECTURE.md before changing behavior. Read docs/DATA_MODEL.md for persistence or HTTP changes and docs/INTEGRATIONS.md for provider work. docs/PLAN.md tracks scope. README.md contains real commands.

## Scope

This version is a local, single-user React + Node app for adding and reordering games, books, and movies. Do not imply accounts, Firebase, native mobile, social features, reviews, or purchasing exist. Follow the user's latest request when expanding scope.

## Boundaries

- Use TypeScript. Shared schemas and ordering rules live in shared/domain.ts.
- Keep provider credentials and calls on the backend.
- Validate HTTP payloads and preserve existing data on failures.
- Preserve media identity, duplicate protection, and exact-permutation ordering checks.
- Filtered reordering must not move entries outside that filter.
- Keep list mutations serialized and reject stale reorder/removal revisions.
- Do not expose the unauthenticated local server publicly.
- Do not commit .env, user data, browser binaries, or test output.
- Preserve unrelated changes, including the existing Rider files.

## Verification

Run npm test and npm run build for relevant code changes. Run npm run test:e2e for add/reorder UI changes. On PowerShell, use npm.cmd if npm.ps1 is blocked. Browser tests use isolated test data, never data/backlog.json. Document tests that could not run. Mock providers in routine tests and distinguish those from live integration checks.

## Done

Acceptance criteria work, relevant checks pass, loading/error/empty states are handled, and documentation reflects implemented behavior. Explain remaining limitations clearly.
