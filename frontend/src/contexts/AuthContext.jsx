import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { request, setSessionExpiredHandler } from "../lib/api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkSession = useCallback(async () => {
    try {
      const data = await request("/api/auth/me");
      setUser(data);
      // Cron schedules run in the user's zone: keep it in sync with this browser.
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (timezone && data.timezone !== timezone) {
        request("/api/auth/me/timezone", {
          method: "PUT",
          body: JSON.stringify({ timezone }),
        }).catch(() => {});
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  // A failed refresh means the session is gone: drop the user so AuthGuard
  // sends them to the login page instead of leaving screens full of 401s.
  useEffect(() => {
    setSessionExpiredHandler(() => {
      setUser(null);
    });
    return () => setSessionExpiredHandler(null);
  }, []);

  const login = useCallback(async (email, password) => {
    await request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    await checkSession();
  }, [checkSession]);

  const register = useCallback(async (email, password, displayName) => {
    await request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, display_name: displayName || undefined }),
    });
    await checkSession();
  }, [checkSession]);

  const logout = useCallback(async () => {
    await request("/api/auth/logout", { method: "POST" });
    setUser(null);
  }, []);

  const linkLastfm = useCallback(async (username) => {
    await request("/api/auth/link-lastfm", {
      method: "POST",
      body: JSON.stringify({ username }),
    });
    // Optimistically update state so isLastfmLinked is true immediately
    // This prevents the linking page from staying visible or the dashboard
    // from showing "No Last.fm account linked" if the refresh call fails.
    setUser((prev) =>
      prev ? { ...prev, lastfm_username: username, is_lastfm_linked: true } : prev
    );
    // Refresh session with actual server data — failure is non-fatal
    // because we already optimistically applied the linking above
    try {
      const data = await request("/api/auth/me");
      setUser(data);
    } catch {
      // Session fetch failed, but the linking itself succeeded on the backend.
      // Optimistic state keeps the user correctly identified as linked.
      // Real data will be fetched on next app load.
    }
  }, []);

  const isLastfmLinked = !!user?.lastfm_username;
  const lastfmUsername = user?.lastfm_username;
  const [avatar, setAvatar] = useState(null);

  // One profile call per linked account, shared by the sidebar and dashboard.
  useEffect(() => {
    if (!lastfmUsername) {
      setAvatar(null);
      return;
    }
    let active = true;
    request("/api/info")
      .then((data) => active && setAvatar(data?.image || null))
      .catch(() => active && setAvatar(null));
    return () => {
      active = false;
    };
  }, [lastfmUsername]);

  const value = useMemo(() => ({
    user,
    avatar,
    isAuthenticated: !!user,
    isLastfmLinked,
    login,
    register,
    logout,
    linkLastfm,
    loading,
  }), [user, avatar, loading, isLastfmLinked, login, register, logout, linkLastfm]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() { // eslint-disable-line react-refresh/only-export-components
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
