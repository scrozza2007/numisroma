# Changelog

All notable changes to this project will be documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Fixed
- **Following/Followers modal** — modal was always empty because the frontend stored the full paginated response object (`{ users, pagination }`) instead of extracting the `users` array
- **Community user search** — same response-shape mismatch caused search results to never render
- **Direct messaging — conversation creation** — `findOneAndUpdate` upsert with `$all`/`$size` array operators on the same field it tried to `$setOnInsert` caused a MongoDB error ("path 'participants' is matched twice"); replaced with explicit `findOne` → `create` pattern in both `messageController.js` and `users.js`
- **Activity feed wording** — "started following you" was hardcoded; when viewing another user's profile it now reads "started following \<username\>" instead of the misleading "you"

### Changed
- **Multi-tab session handling** — logging into a different account in another same-origin tab now immediately redirects the displaced tab to `/login` with a clear message, instead of leaving it in a broken CSRF/auth-error loop
- **Message polling intervals** — reduced from 3 s → 8 s (messages) and 5 s → 15 s (conversations); polling pauses when the tab is hidden (`document.hidden`), cutting per-tab request rate by ~65%
- **General rate limit** — raised from 100 to 300 requests per 15-minute window to accommodate real-time messaging usage patterns with multiple concurrent users
