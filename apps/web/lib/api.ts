import axios from "axios";
import type { AxiosError, InternalAxiosRequestConfig } from "axios";

type RetryableRequestConfig = InternalAxiosRequestConfig & { _retry?: boolean };

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "/api/v1",
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const axiosError = error as AxiosError;
    const originalRequest = axiosError.config as RetryableRequestConfig | undefined;
    const requestUrl = originalRequest?.url ?? "";
    const isRefreshRequest = requestUrl.includes("/auth/refresh");

    if (
      axiosError.response?.status === 401 &&
      typeof window !== "undefined" &&
      originalRequest &&
      !originalRequest._retry &&
      !isRefreshRequest
    ) {
      originalRequest._retry = true;
      try {
        // Refresh token cookie is sent automatically via withCredentials
        await axios.post(
          `${process.env.NEXT_PUBLIC_API_URL ?? "/api/v1"}/auth/refresh`,
          null,
          { withCredentials: true }
        );
        return api.request(originalRequest);
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
