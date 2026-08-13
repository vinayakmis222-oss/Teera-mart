import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, formatApiErrorDetail } from "../lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null=checking, false=guest, obj=logged
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch {
      setUser(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = async (email, password, role) => {
    try {
      const { data } = await api.post("/auth/login", { email, password, role });
      setUser(data);
      return { ok: true, user: data };
    } catch (e) {
      return { ok: false, error: formatApiErrorDetail(e.response?.data?.detail) || e.message };
    }
  };

  const register = async (payload) => {
    try {
      const { data } = await api.post("/auth/register", payload);
      setUser(data);
      return { ok: true, user: data };
    } catch (e) {
      return { ok: false, error: formatApiErrorDetail(e.response?.data?.detail) || e.message };
    }
  };

  const logout = async () => {
    try { await api.post("/auth/logout"); } catch (e) { /* ignore */ }
    setUser(false);
  };

  const otpSend = async (phone) => {
    try {
      const { data } = await api.post("/auth/otp/send", { phone });
      return { ok: true, ...data };
    } catch (e) {
      return { ok: false, error: formatApiErrorDetail(e.response?.data?.detail) || e.message };
    }
  };

  const otpVerify = async (phone, otp, name) => {
    try {
      const { data } = await api.post("/auth/otp/verify", { phone, otp, name });
      setUser(data);
      return { ok: true, user: data };
    } catch (e) {
      return { ok: false, error: formatApiErrorDetail(e.response?.data?.detail) || e.message };
    }
  };

  const updateProfile = async (payload) => {
    try {
      const { data } = await api.patch("/auth/me", payload);
      setUser(data);
      return { ok: true, user: data };
    } catch (e) {
      return { ok: false, error: formatApiErrorDetail(e.response?.data?.detail) || e.message };
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refresh, otpSend, otpVerify, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
