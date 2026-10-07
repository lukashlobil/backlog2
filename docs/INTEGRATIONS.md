# Catalog integrations

Last reviewed: 2026-10-07. Verify provider terms again before public or monetized use.

## Open Library — books

- Search: https://openlibrary.org/dev/docs/api/search
- Covers: https://openlibrary.org/dev/docs/api/covers
- Requests use work-level IDs, title, authors, first publication year, and cover ID.
- No credential required. Edition selection is deferred.
- Attribution links to Open Library appear in the search dialog.

## IGDB — games

- Documentation and commercial FAQ: https://api-docs.igdb.com/
- Register a Twitch application: https://dev.twitch.tv/console/apps
- Configure IGDB_CLIENT_ID and IGDB_CLIENT_SECRET. The server obtains app access tokens and refreshes them before expiry.
- Search fields: name, cover image ID, release date, and platforms.
- Attribution links to IGDB appear in the search dialog.
- Commercial usage requires following IGDB's partnership process; the FAQ describes the API as free for commercial and noncommercial projects.

## TMDB — movies

- Search: https://developer.themoviedb.org/reference/search-movie
- Token: https://www.themoviedb.org/settings/api
- Terms/attribution: https://developer.themoviedb.org/docs/faq
- Configure TMDB_ACCESS_TOKEN with the API Read Access Token.
- Search excludes adult results. Stored metadata includes title, year, original title when different, and poster URL.
- Free access is for noncommercial use with attribution. Commercial licensing must be arranged before monetization.
- Before public release, verify approved TMDB logo placement and full credit requirements against the current brand guidelines. The prototype includes source links and the endorsement disclaimer.

## Failure handling

Unconfigured providers are shown as unavailable; there are no fake search results. Manual entry is always available. Upstream timeouts and error responses become recoverable messages. Search uses a 400 ms debounce, canceled stale requests, a 10-second upstream timeout, and a local 30-requests/minute ceiling. The cache holds at most 100 queries for 60 seconds.

## Verification boundary

Routine tests mock catalog responses. Live game/movie verification requires valid credentials; none are included in the repository. Preserve secrets in `.env` only. Revisit caching, image usage, quotas, and attribution before deployment.
