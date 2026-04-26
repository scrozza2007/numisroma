# Testing

---

## Backend unit tests

Tests run against `mongodb-memory-server` — no real MongoDB or Redis required.

```bash
cd backend
npm test                  # run all tests
npm run test:watch        # watch mode
npm run test:coverage     # run with coverage report
npx jest tests/unit/coinController.test.js   # run a single file
```

### Test suites

| File | Covers |
|------|--------|
| `authController.test.js` | register, login, logout, changePassword, changeUsername, updateProfile, checkSession |
| `collectionController.test.js` | CRUD, public/private access control, addCoin, removeCoin |
| `sessionController.test.js` | createSession, getActiveSessions, terminateSession, terminateAll, updateSessionActivity |
| `tokenManager.test.js` | hashToken, generateTokenPair, refreshAccessToken, revokeRefreshToken, revokeAllRefreshTokens |
| `infraMiddleware.test.js` | requestId, requestTimeout (including 503 path), metrics, errorHandler |
| `coinController.test.js` | coin catalog endpoints |
| `userController.test.js` | user profile endpoints |

### Coverage thresholds

Enforced in `backend/package.json` — `npm run test:coverage` exits non-zero if any metric falls below:

| Metric | Threshold |
|--------|-----------|
| Statements | 54% |
| Branches | 52% |
| Functions | 45% |
| Lines | 54% |

Current baseline: ~55% statements / ~53% branches / ~46% functions.

---

## Frontend

```bash
cd frontend
npm run build     # Next.js build — also acts as lint (type errors fail the build)
npx cypress open  # interactive E2E tests
```

---

## Load tests (k6)

Install k6: https://grafana.com/docs/k6/latest/set-up/install-k6/

All scripts accept a `BASE_URL` env var (default `http://localhost:4000`).

### Smoke test

Sanity check — 1 VU, 30 s, p(95) < 500 ms threshold.

```bash
k6 run k6/smoke.js
```

Hits: `GET /health`, `GET /api/coins?limit=10`, `GET /api/collections/public`

### Load test

Read-heavy browse endpoints — ramps to 50 VUs, p(95) < 1 s.

```bash
k6 run k6/load.js
# Against a remote server:
BASE_URL=https://numisroma.example.com k6 run k6/load.js
```

Stages: 0→20 VUs (1 min) → 50 VUs (2 min) → hold (1 min) → ramp down (30 s)

Hits: `GET /api/coins?emperor=<random>`, `/api/coins/filter-options`, `/api/coins/random`

### Auth-flow stress test

Full register → profile → browse → logout per VU — ramps to 10 VUs.

```bash
k6 run k6/auth-flow.js
```

Thresholds: error rate < 5%, p(95) < 2 s.

---

## CI

All tests run automatically on push and PR via `.github/workflows/ci.yml`.

Additional automated checks:
- **gitleaks** — secret scanning on every push/PR and weekly
- **Trivy** — filesystem vulnerability scan on every push/PR; Docker image scan on push to main
