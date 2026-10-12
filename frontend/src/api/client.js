import axios from "axios";

/**
 * Every API call goes through this app's own origin under `/api`, which a
 * reverse proxy strips and forwards to the backend:
 *
 *   /api/requests    → <backend>/requests
 *   /api/auth/login  → <backend>/auth/login
 *
 * In development that proxy is `server.proxy` in vite.config.js; in production
 * it is the nginx `location /api/` block (see deploy/nginx/). Both do the same
 * single thing: strip the `/api` prefix.
 *
 * Same-origin is deliberate, and buys three things at once:
 *
 *  - The `jwt` refresh cookie stays first-party. It is `SameSite=Lax`, so a
 *    cross-site request would not carry it and /auth/refresh would see nothing
 *    on reload — signing the user out on every page load.
 *  - No CORS. The browser never makes a cross-origin request, so the API's
 *    origin allowlist never has to know this app's hostname.
 *  - No hostname baked into the bundle. `dist/` is portable across every
 *    environment, because the backend address lives in the proxy config rather
 *    than in the build.
 *
 * VITE_API_URL remains an escape hatch for a deployment that really does want
 * to talk to the API cross-origin. Setting it opts back into needing CORS and
 * a `SameSite=None` cookie.
 */
const API_URL = import.meta.env.VITE_API_URL || "/api";
const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

/**
 * Login / refresh / logout — the only three calls that depend on the `jwt`
 * refresh cookie.
 *
 * Always same-origin, even when VITE_API_URL points elsewhere: the cookie is
 * first-party or it does not arrive at all.
 *
 * No response interceptor here on purpose: this instance *is* the refresh path,
 * so a 401 from it must surface rather than trigger another refresh.
 */
export const sessionApi = axios.create({
  baseURL: "/api/auth",
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

// Request interceptor to set Content-Type dynamically
api.interceptors.request.use((config) => {
  // Don't set Content-Type for FormData - let the browser set it with the boundary
  if (!(config.data instanceof FormData)) {
    config.headers['Content-Type'] = 'application/json';
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

/**
 * Attach the access token to every request when available.
 * Call setAuthToken(token) after login / refresh, setAuthToken(null) on logout.
 *
 * The token is held here in memory only — never in localStorage — so it is not
 * readable by injected script.
 */
const tokenSubscribers = new Set();
let currentToken = null;

export const setAuthToken = (token) => {
  const next = token || null;
  if (next) {
    api.defaults.headers.common["Authorization"] = `Bearer ${next}`;
  } else {
    delete api.defaults.headers.common["Authorization"];
  }

  // Only announce real changes. Subscribers react by clearing their own state,
  // which calls back in here — without this guard that would recurse.
  //
  // NOTE (security scanners): this is an identity/"did it change?" check on
  // client-side state to break a notify recursion — NOT an authentication or
  // secret-verification step. Both operands are the same in-memory access token
  // this tab already holds, the comparison runs in the browser, and its result
  // gates only a re-render, never access. A constant-time compare would add no
  // security here, so a plain === is intentional.
  if (next === currentToken) return;
  currentToken = next;

  // A refresh can be triggered by any failed request, not just by AuthContext.
  // Without this, a background renewal updates the header but leaves the React
  // state (and therefore the UI) holding a stale token.
  for (const subscriber of tokenSubscribers) subscriber(next);
};

/** Observe token changes, including refreshes triggered by the interceptor. */
export const subscribeToAuthToken = (subscriber) => {
  tokenSubscribers.add(subscriber);
  return () => tokenSubscribers.delete(subscriber);
};

/**
 * Transparently renew an expired access token.
 *
 * Access tokens are short-lived (30m) and do not survive a page load, so a long
 * session would otherwise start failing mid-use. On a 401 we exchange the
 * httpOnly refresh cookie for a new access token and replay the request once.
 * Concurrent failures share a single refresh.
 */
let refreshPromise = null;

/**
 * Exchange the refresh cookie for a new access token.
 *
 * Exported so session restore on page load goes through the same single
 * in-flight promise as interceptor-driven renewals. Previously AuthContext ran
 * its own call, so every page load issued two /auth/refresh requests — the
 * restore, plus one for the first component request that raced it and 401'd.
 */
export const refreshAccessToken = async () => {
  if (!refreshPromise) {
    refreshPromise = sessionApi
      .get("/refresh")
      .then(({ data }) => {
        setAuthToken(data.accessToken);
        return data.accessToken;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
};

/** True when a request failed before any HTTP response arrived. */
export const isNetworkError = (error) => !error?.response;

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const status = error.response?.status;

    // 413 can come from nginx (an HTML body) or the API (JSON). Normalise it so
    // every upload form shows the same readable message instead of a raw
    // "Request failed with status code 413".
    if (status === 413) {
      const message =
        "The files you are uploading are too large. Please remove or compress some files and try again.";
      error.message = message;
      error.response.data = { message };
      return Promise.reject(error);
    }

    // Only 401 means "your token is missing/expired". 403 is a genuine
    // permission denial and must not trigger a refresh. The refresh call itself
    // runs on `sessionApi`, which has no interceptor, so it cannot recurse here.
    const shouldRetry = status === 401 && original && !original._retried;

    if (!shouldRetry) {
      return Promise.reject(error);
    }

    original._retried = true;

    try {
      const token = await refreshAccessToken();
      original.headers = { ...original.headers, Authorization: `Bearer ${token}` };
      return api(original);
    } catch (refreshError) {
      // The server rejected the refresh cookie: the session is genuinely over,
      // so drop the token and let subscribers redirect to login rather than
      // leaving a signed-in-looking UI whose every request fails. A network
      // failure is not proof of that, so it leaves the session alone.
      if (!isNetworkError(refreshError)) {
        setAuthToken(null);
      }
      return Promise.reject(error);
    }
  }
);

export default api;
