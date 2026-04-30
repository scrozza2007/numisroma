# Changelog

All notable changes to this project will be documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Added
- **Notifications system** — new `Notification` model, controller, and routes (`GET /api/notifications`, `GET /api/notifications/unread-count`, `PUT /api/notifications/:id/read`, `PUT /api/notifications/read-all`, `GET /api/notifications/stream`)
- **Server-Sent Events (SSE)** — real-time push for notification and message counts via `GET /api/notifications/stream`; single connection per user enforced via `activeConnections` Map; 30 s keepalive; `BroadcastChannel('numisroma:notifications')` used to fan out to other open pages without a second SSE stream
- **Private profiles** — `User.isPrivate` field (default `false`); private profiles hide their collection from non-followers; `PUT /api/users/me/privacy` toggles the setting and auto-accepts all pending requests when switching to public
- **Follow request flow** — `Follow.status` field (`pending` | `accepted`, default `accepted`); following a private account creates a pending request and sends a `follow_request` notification instead of immediately accepting
- **Follow request management** — `POST /api/users/:id/follow-request/accept` and `POST /api/users/:id/follow-request/decline`; `GET /api/users/:id/follow-requests` lists pending requests for own profile
- **Inline Accept/Decline** — follow request notifications show Accept/Decline buttons directly in the Navbar bell dropdown, the `/notifications` page, and a banner on the requester's profile page
- **Incoming request banner on profile** — `GET /api/users/:id/profile` now returns `hasPendingRequestFromThem`; if the profile owner sent you a pending request, a banner with Accept/Decline appears on their profile
- **Private profile messaging gate** — `GET /api/messages/conversations/:otherUserId` and `GET /api/users/:id/chat` both return `403 PRIVATE_PROFILE` if the target is private and the caller is not an accepted follower; Message button is hidden on the profile page when gated
- **Notifications page** (`/notifications`) — paginated full list with load-more, mark-all-read, real-time refresh via `BroadcastChannel`
- **Follow requests page** (`/follow-requests`) — dedicated page listing all pending incoming follow requests
- **Bell badge** — Navbar bell icon shows unread notification count, driven by SSE with 30 s polling fallback
- **Privacy toggle in Settings** — new toggle card in the Privacy panel to switch between public/private profile
- **Unit tests for notifications** — 11 tests covering model validation, unread counts, mark-all-read, follow flows (public/private), accept/decline, and access control

### Fixed
- **Following/Followers modal** — modal was always empty because the frontend stored the full paginated response object (`{ users, pagination }`) instead of extracting the `users` array
- **Community user search** — same response-shape mismatch caused search results to never render
- **Direct messaging — conversation creation** — `findOneAndUpdate` upsert with `$all`/`$size` array operators on the same field it tried to `$setOnInsert` caused a MongoDB error ("path 'participants' is matched twice"); replaced with explicit `findOne` → `create` pattern in both `messageController.js` and `users.js`
- **Activity feed wording** — "started following you" was hardcoded; when viewing another user's profile it now reads "started following \<username\>" instead of the misleading "you"
- **Activity tab on other profiles** — follower events are no longer shown when viewing someone else's profile; only their collection creation events are displayed
- **Stale follow_request notifications** — accepting or declining a request now deletes the `follow_request` notification from the DB; it no longer lingers after being actioned
- **Unfollow removes notification** — unfollowing deletes the corresponding `new_follower` or `follow_request` notification, matching the Instagram behaviour of removing the notification when the action is reversed
- **Bell badge not clearing after accept/decline** — backend now calls `pushCountsToUser` for the acceptor/decliner so the SSE stream immediately reflects the correct count
- **Profile page stale after accepting request** — profile page now listens on `BroadcastChannel` and silently re-fetches on any SSE push, so `followStatus`, `followersCount`, and `hasPendingRequestFromThem` update without a page reload
- **Follow button follower count** — `followersCount` is now updated optimistically on follow/unfollow

### Changed
- **Multi-tab session handling** — logging into a different account in another same-origin tab now immediately redirects the displaced tab to `/login` with a clear message, instead of leaving it in a broken CSRF/auth-error loop
- **Message polling intervals** — reduced from 3 s → 8 s (messages) and 5 s → 15 s (conversations); polling pauses when the tab is hidden (`document.hidden`), cutting per-tab request rate by ~65%
- **General rate limit** — raised from 100 to 300 requests per 15-minute window to accommodate real-time messaging usage patterns with multiple concurrent users
- **Messages SSE** — messages page now subscribes to `BroadcastChannel` instead of a separate SSE stream, avoiding the one-connection-per-user limit
- **Navbar** — removed standalone messages icon; unread message count badge removed from the desktop nav; messages remain accessible via the user dropdown and bell notifications
- **Follower/following counts** — only `status: 'accepted'` follow documents are counted; pending requests are excluded
