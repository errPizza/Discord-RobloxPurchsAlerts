import { api } from "./api.js";

export const getSession = () => api("/api/auth/session");
export const getProviders = () => api("/api/auth/providers");
export const login = (email, password, turnstileToken = "") => api("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password, turnstileToken }) });
export const signup = (email, password, passwordConfirmation, turnstileToken = "") => api("/api/auth/signup", { method: "POST", body: JSON.stringify({ email, password, passwordConfirmation, turnstileToken }) });
export const logout = () => api("/api/auth/logout", { method: "POST" });
