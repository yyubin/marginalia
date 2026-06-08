import axios from "axios";

/**
 * Axios instance for anonymous (logged-out) access to public share endpoints.
 *
 * Unlike `lib/api.ts`, this client:
 *  - sends no credentials (no auth cookie) — share pages are public
 *  - has no 401 → /auth/refresh → /login interceptor, so an anonymous visitor
 *    is never bounced to the login page when a share is missing/disabled.
 */
export const publicApi = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  headers: { "Content-Type": "application/json" },
  withCredentials: false,
});
