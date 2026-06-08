import axios from "axios";

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error.response?.status === 401 && typeof window !== "undefined") {
      try {
        // Refresh token cookie is sent automatically via withCredentials
        await axios.post(
          `${process.env.NEXT_PUBLIC_API_URL}/auth/refresh`,
          {},
          { withCredentials: true }
        );
        return axios({ ...error.config, withCredentials: true });
      } catch {
        localStorage.clear();
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

/**
 * FastAPI/Pydantic returns `detail` as a plain string for HTTPException,
 * but as an array of {msg, loc, type} objects for 422 validation errors.
 * Rendering the array directly would crash React, so normalize both shapes
 * into a single human-readable string (or null if nothing usable is found).
 */
export function extractErrorDetail(err: unknown): string | null {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0] as { msg?: unknown };
    if (typeof first?.msg === "string") return first.msg.replace(/^Value error,\s*/, "");
  }
  return null;
}
