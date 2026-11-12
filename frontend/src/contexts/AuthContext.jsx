import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { request, setSessionExpiredHandler } from "../lib/api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkSession = useCallback(() => request("/api/auth/me")
    .then((data) => {
      setUser(data);
      // The first browser sets the zone. After that only Settings does: a trip must not shift the schedules.
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (timezone && !data.timezone) {
        request("/api/auth/me/timezone", {
          method: "PUT",
          body: JSON.stringify({ timezone }),
        }).catch(() => {});
      }
    })
    .catch(() => setUser(null))
    .finally(() => setLoading(false)), []);

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

  // Nothing opens yet: the account waits for the link mailed to the address.
  const register = useCallback((email, password) => request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  }), []);

  // The mailed links: each signs the person in on the way.
  const confirmEmail = useCallback(async (token) => {
    await request("/api/auth/confirm", { method: "POST", body: JSON.stringify({ token }) });
    await checkSession();
  }, [checkSession]);

  const resetPassword = useCallback(async (token, password) => {
    await request("/api/auth/password/reset", { method: "POST", body: JSON.stringify({ token, password }) });
    await checkSession();
  }, [checkSession]);

  const logout = useCallback(async () => {
    await request("/api/auth/logout", { method: "POST" });
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    setUser(await request("/api/auth/me"));
  }, []);

  const forgetUser = useCallback(() => setUser(null), []);

  const finishLastfmLink = useCallback(async (token, state) => {
    const linked = await request("/api/auth/lastfm/link", {
      method: "POST",
      body: JSON.stringify({ token, state }),
    });
    await refreshUser();
    return linked;
  }, [refreshUser]);

  const isLastfmLinked = !!user?.lastfm_username;
  const lastfmUsername = user?.lastfm_username;
  const [loadedAvatar, setAvatar] = useState(null);
  const avatar = lastfmUsername ? loadedAvatar : null;

  // One profile call per linked account, shared by the sidebar and dashboard.
  useEffect(() => {
    if (!lastfmUsername) return undefined;
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
    confirmEmail,
    resetPassword,
    logout,
    finishLastfmLink,
    refreshUser,
    forgetUser,
    loading,
  }), [user, avatar, loading, isLastfmLinked, login, register, confirmEmail, resetPassword, logout, finishLastfmLink, refreshUser, forgetUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() { // eslint-disable-line react-refresh/only-export-components
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
