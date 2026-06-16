import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { request } from "../lib/api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkSession = useCallback(async () => {
    try {
      const data = await request("/api/auth/me");
      setUser(data);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

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

  const value = useMemo(() => ({
    user,
    isAuthenticated: !!user,
    login,
    register,
    logout,
    loading,
  }), [user, loading, login, register, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
