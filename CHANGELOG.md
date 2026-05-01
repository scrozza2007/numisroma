# Changelog

All notable changes to this project will be documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Added
- **End-to-end encrypted messaging (E2EE)** — all messages are encrypted client-side with X25519 + XSalsa20-Poly1305 (TweetNaCl `box`) before being sent to the server; the server stores only ciphertext and a nonce, never plaintext
- **E2EE key generation** — on first login a fresh X25519 keypair is generated; the private key is encrypted with PBKDF2-SHA256 (200 000 iterations) + AES-GCM-256 using the user's password and stored in `localStorage`
- **Cloud key backup (WhatsApp-style)** — the PBKDF2+AES-GCM encrypted private key blob is uploaded to the server (`PUT /api/users/me/e2ee-keys`); logging in on a new device fetches and decrypts the blob using the password — same keypair, no key rotation
- **Session key cache** — the raw private key is cached in `sessionStorage` for the browser session lifetime so page reloads don't require re-entering the password
- **Write-once public key** — once a public key is registered on the server it is never overwritten; this prevents silent key rotation that would make previously encrypted messages unreadable
- **Password-change re-encryption** — changing password re-encrypts the private key blob under the new password and re-uploads it, keeping the cloud backup in sync
- **E2EE lock icon in chat header** — a small amber lock icon appears next to the contact name when E2EE is active for the conversation
- **Coin placeholder image** — added `public/images/coin-placeholder.svg` as a clean image-icon fallback; all coin image references updated from the broken `.jpg` path
- **Conversation unread dot** — an amber dot appears on unread conversations in the sidebar and clears immediately when the conversation is opened
- **Profile link from chat header** — the contact name and avatar in the chat header are now clickable links to their profile page
- **Notification → conversation redirect** — clicking a `new_message` notification now opens the messages page with the specific conversation pre-selected

### Fixed
- **Messages page crash** — `fetchMessages` referenced `getRecipientPublicKey` and `decryptOne` before they were defined; reordered hooks to fix the forward-reference crash
- **E2EE CSRF 403 on login** — `initE2EE` now invalidates the cached CSRF token and fetches a fresh one (with the auth cookie in place) before calling `PUT /api/users/me/e2ee-keys`
- **Silent keypair rotation** — fixed a bug where `unlockKeypair` failure would silently fall through to generating a new keypair, invalidating all previously encrypted messages
- **Plaintext fallback removed** — `sendMessage` now blocks with an error instead of silently sending plaintext when E2EE is not ready or the recipient has no public key
- **Decryption errors hidden** — undecryptable messages (from key rotation before the fix) are silently filtered out rather than showing "Could not decrypt" to the user
- **Sent messages readable after reload** — plaintext of sent messages is cached in `sessionStorage` by message ID so they remain readable within the same browser session
- **Conversation list ciphertext** — last-message preview now shows nothing (rather than raw base64 ciphertext) for encrypted conversations
- **Notification redirect looping** — fixed `router.replace` causing `routeChangeComplete` to re-render the page and reset `selectedConversation`; the target conversation ID is now captured once from `window.location.search` on mount
- **429 rate limit storm** — polling loops now back off for 60 seconds on a `429` response; SSE reconnects with exponential backoff (2 s → 4 s → … → 30 s max) instead of reconnecting immediately on error
- **Private profile messaging error** — attempting to message a private profile now shows a clear human-readable error ("This account is private. You need to follow them first") instead of a silent failure
- **`new_message` notification redirect** — notification click now pushes `/messages?conversationId=<id>` using the populated `relatedConversation._id` from the backend

### Changed
- **Message max length** — raised from 5 000 to 8 000 characters to accommodate base64-encoded ciphertext overhead
- **`GET /api/notifications`** — response now includes populated `relatedConversation: { _id }` for `new_message` notifications
- **`GET /api/messages/conversations`** — `lastMessage` projection now includes `isEncrypted` field


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
