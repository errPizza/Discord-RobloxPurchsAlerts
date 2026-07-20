import { createContext, useEffect, useMemo, useState } from "react";
import * as auth from "../services/auth.js";

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { auth.getSession().then(({ user: sessionUser }) => setUser(sessionUser?.email ? sessionUser : null)).catch(() => setUser(null)).finally(() => setLoading(false)); }, []);
  const value = useMemo(() => ({ user, loading, login: async (email, password) => { const data = await auth.login(email, password); setUser(data.user); return data.user; }, logout: async () => { await auth.logout(); setUser(null); } }), [user, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
