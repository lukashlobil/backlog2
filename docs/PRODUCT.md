# Product — v0.1

## Purpose

One personal list of games, books, and movies to enjoy next. The user's requested first release is adding and reordering items. Social and purchasing features are explicitly excluded.

## Implemented scope

- Responsive web application, React frontend and Node backend.
- Add from a supported online catalog or enter a title manually.
- Optional identifying metadata and catalog covers with graceful image fallback.
- An ordered list with All items, Games, Books, and Movies views.
- Drag, keyboard, and move-button ordering; save immediately on the server.
- Remove with confirmation to correct an accidental addition.
- Empty, loading, provider-unavailable, request-failure, and stale-write states.

## Rules

- One list per local server, with no user accounts.
- New entries append to the end. Repeated additions of the same provider identity are idempotent.
- Manual duplicates use media type, case-insensitive trimmed title, and year. Manual and provider entries are not automatically merged.
- The visible type filters are not user-defined categories.
- Ordering within a filter rearranges only slots belonging to that filter. Other types remain in their existing slots.
- Each save must succeed before the UI shows the new list; a failed save retains the previous list or entry form.
- A stale reorder returns a conflict and the UI reloads the current list.

## Deferred

Authentication, Firebase, cross-device synchronization, native mobile applications, custom categories, statuses, reviews, friends, recommendations, importing external libraries, and purchases.

## Assumption to revisit

The first slice uses local single-user storage so it can run without cloud accounts or deployment credentials. The user was offered an account/cloud-sync choice while implementation proceeded; local storage is the stated initial default, not a claim that accounts were implemented.
