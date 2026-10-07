# Product — v0.2

## Purpose

One private list per account of games, books, and movies to enjoy next. Adding and reordering remain the core workflow. Firebase Authentication has been added at the user's request. Social and purchasing features are explicitly excluded.

## Implemented scope

- Responsive web application, React frontend and Node backend.
- Firebase email/password registration, sign-in, Google sign-in, password reset, and sign-out.
- Verified user identity on the API and separate persistent data for each account.
- Add from a supported online catalog or enter a title manually.
- Optional identifying metadata and catalog covers with graceful image fallback.
- An ordered list with All items, Games, Books, and Movies views.
- Drag, keyboard, and move-button ordering; save immediately on the server.
- Remove with confirmation to correct an accidental addition.
- Empty, loading, provider-unavailable, request-failure, and stale-write states.

## Rules

- One list per Firebase project/UID in Firestore. Authentication and cloud persistence use Firebase; explicit file mode remains available for local-only operation.
- New entries append to the end. Repeated additions of the same provider identity are idempotent.
- Manual duplicates use media type, case-insensitive trimmed title, and year. Manual and provider entries are not automatically merged.
- The visible type filters are not user-defined categories.
- Ordering within a filter rearranges only slots belonging to that filter. Other types remain in their existing slots.
- Each save must succeed before the UI shows the new list; a failed save retains the previous list or entry form.
- A stale reorder returns a conflict and the UI reloads the current list.

## Deferred

Native mobile applications, custom categories, statuses, reviews, friends, recommendations, importing external libraries, and purchases.

## Existing local data

Existing local data is retained and not automatically uploaded. FIRESTORE_IMPORT_UID explicitly imports one account into an absent cloud snapshot, preserving IDs and order. LEGACY_BACKLOG_OWNER_UID additionally selects an owner for pre-auth shared files. Neither existing cloud snapshots nor local files are overwritten. See FIRESTORE.md.
