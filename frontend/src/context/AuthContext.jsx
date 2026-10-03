

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import {
  setAuthToken,
  refreshAccessToken,
  isNetworkError,
  subscribeToAuthToken,
} from "../api/client";
import { login as loginApi, logout as logoutApi } from "../api/auth.api";

const AuthContext = createContext(null);

// Decode JWT payload (verification happens server-side)
const decodeToken = (token) => {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.UserInfo || null;
  } catch {
    return null;
  }
};

/**
 * Tokens are deliberately NOT persisted to localStorage.
 *
 * The access token lives in memory for the life of the tab; the refresh token
 * only ever exists as an httpOnly cookie, so script running on the page — and
 * therefore any XSS — cannot read either one. On load we exchange the cookie
 * for a fresh access token via /auth/refresh.
 *
 * The cached `user` below is non-sensitive (name/role/institution, all also
 * present in the JWT) and exists only to avoid a login-screen flash while that
 * refresh call is in flight. It is never trusted for authorization — every
 * protected call is authorized server-side from the token.
 */
const USER_CACHE_KEY = "user";

// A reload that lands while the API is briefly unreachable must not be treated
// as a sign-out — only the server saying "this cookie is no longer valid" is.
const TRANSIENT_RETRY_DELAYS_MS = [400, 1200];

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Paint from the cached profile on the very first render, to avoid a
// redirect flash before the effect below can confirm the session with the
// server. Read once via lazy useState init rather than an effect, since this
// needs to run before anything else, not "after".
const readCachedUser = () => {
  try {
    const savedUser = localStorage.getItem(USER_CACHE_KEY);
    return savedUser ? JSON.parse(savedUser) : null;
  } catch {
    localStorage.removeItem(USER_CACHE_KEY);
    return null;
  }
};

export function AuthProvider({ children }) {
  const [accessToken, setAccessToken] = useState(null);
  const [user, setUser] = useState(readCachedUser);
  const [loading, setLoading] = useState(true);

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setAuthToken(null);
    setUser(null);
    localStorage.removeItem(USER_CACHE_KEY);
  }, []);

  // Returns false if the token carries no usable profile, so callers do not
  // cache a `null` user and leave the UI in a signed-in-but-empty state.
  const adoptToken = useCallback((token) => {
    const decodedUser = decodeToken(token);
    if (!decodedUser) return false;
    setAccessToken(token);
    setUser(decodedUser);
    localStorage.setItem(USER_CACHE_KEY, JSON.stringify(decodedUser));
    return true;
  }, []);

  useEffect(() => {
    // Confirm the cached profile (if any) with the server.
    //
    // Silently restore the session using the httpOnly refresh cookie. Only
    // ever called from here, so it's declared inline rather than as a
    // separate useCallback.
    const restoreSession = async () => {
      for (let attempt = 0; ; attempt += 1) {
        try {
          // Shares the single in-flight refresh in api/client.js, so a component
          // request that races this on mount does not trigger a second one.
          const token = await refreshAccessToken();
          if (!adoptToken(token)) clearSession();
          setLoading(false);
          return;
        } catch (err) {
          const transient = isNetworkError(err);

          if (transient && attempt < TRANSIENT_RETRY_DELAYS_MS.length) {
            await wait(TRANSIENT_RETRY_DELAYS_MS[attempt]);
            continue;
          }

          // Leave a breadcrumb: "logged out on reload" is almost always the
          // refresh cookie failing to reach the API, and the two causes need
          // different fixes.
          if (transient) {
            console.warn(
              "[auth] Could not reach the API to restore the session:",
              err.message
            );
          } else if (err.response?.status === 401) {
            console.info(
              "[auth] No valid refresh cookie was accepted by /auth/refresh — signing out. " +
                "If you were signed in, the browser is not sending the `jwt` cookie: " +
                "check that the page and VITE_API_URL use the same host " +
                "(both `localhost` or both `127.0.0.1`), and that third-party cookies " +
                "are not blocked when the API is on a different site."
            );
          }

          clearSession();
          setLoading(false);
          return;
        }
      }
    };

    restoreSession();
  }, [adoptToken, clearSession]);

  // Keep state in step with renewals driven by the request interceptor, and
  // sign out when it reports the session is gone.
  useEffect(
    () =>
      subscribeToAuthToken((token) => {
        if (token) setAccessToken(token);
        else clearSession();
      }),
    [clearSession]
  );

  const login = async (email, password) => {
    try {
      // Same-origin so the refresh cookie it sets is first-party.
      const { data } = await loginApi(email, password);
      setAuthToken(data.accessToken);
      adoptToken(data.accessToken);
      return data;
    } catch (error) {
      // Extract the error message from the backend response
      const errorMessage = error.response?.data?.message || "Login failed. Please try again.";
      throw new Error(errorMessage, { cause: error });
    }
  };

  const logout = async () => {
    try {
      // Must match the origin that set the cookie for clearCookie to land.
      await logoutApi();
    } finally {
      clearSession();
    }
  };

  return (
    <AuthContext.Provider value={{ accessToken, user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// Splitting this hook into its own file would touch every one of its ~15
// import sites for a Fast Refresh DX nicety only; not worth the churn.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
