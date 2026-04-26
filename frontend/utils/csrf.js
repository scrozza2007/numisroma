/**
 * CSRF token lifecycle for the frontend.
 *
 * The backend uses the double-submit-cookie pattern: it sets an httpOnly
 * `x-csrf-token` cookie AND returns a token in the body of `/api/csrf-token`.
 * For any mutating request (POST/PUT/PATCH/DELETE) that travels with the
 * auth cookie, the frontend must echo the token in the `X-CSRF-Token` header.
 *
 * Token is cached in memory (NOT localStorage — that would re-introduce XSS
 * exfiltration risk). On CSRF_INVALID errors, callers should invalidate the
 * cache and retry once.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

let _csrfToken = null;
let _inflight = null;

const fetchCsrfToken = async () => {
  const res = await fetch(`${API_BASE}/api/csrf-token`, {
    method: 'GET',
    credentials: 'include'
  });
  if (!res.ok) {
    throw new Error(`Failed to obtain CSRF token (status ${res.status})`);
  }
  const data = await res.json();
  _csrfToken = data.csrfToken;
  return _csrfToken;
};

export const ensureCsrfToken = async () => {
  if (_csrfToken) return _csrfToken;
  if (!_inflight) {
    _inflight = fetchCsrfToken().finally(() => { _inflight = null; });
  }
  return _inflight;
};

export const invalidateCsrfToken = () => {
  _csrfToken = null;
};

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Build a headers object to include on a fetch. For safe methods this is a
 * no-op; for mutating methods it fetches (and caches) the CSRF token.
 */
export const getCsrfHeader = async (method = 'GET') => {
  if (!MUTATING.has(method.toUpperCase())) return {};
  try {
    const token = await ensureCsrfToken();
    return { 'X-CSRF-Token': token };
  } catch (err) {
    // Non-fatal: proceed without. Server will 403 if truly required.
    if (typeof console !== 'undefined') {
      console.warn('Failed to obtain CSRF token:', err.message);
    }
    return {};
  }
};
