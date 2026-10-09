import axios, { AxiosError, type AxiosRequestConfig, type InternalAxiosRequestConfig } from "axios";

/**
 * API client. The access token lives only in memory (never localStorage); the refresh token is an
 * HttpOnly cookie handled by the browser. Concurrent 401s share a single refresh request.
 */
let accessToken: string | null = null;
let onSessionExpired: (() => void) | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function setSessionExpiredHandler(handler: (() => void) | null) {
  onSessionExpired = handler;
}

const XHR = { "X-Requested-With": "XMLHttpRequest" };

export const api = axios.create({ baseURL: "/api", headers: XHR, withCredentials: true });

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

let refreshing: Promise<string | null> | null = null;

export function refreshAccess(): Promise<string | null> {
  if (!refreshing) {
    refreshing = axios
      .post<{ access: string }>("/api/auth/refresh/", null, { headers: XHR, withCredentials: true })
      .then((r) => {
        setAccessToken(r.data.access);
        return r.data.access;
      })
      .catch(() => {
        setAccessToken(null);
        return null;
      })
      .finally(() => {
        setTimeout(() => (refreshing = null), 0);
      });
  }
  return refreshing;
}

type RetriableConfig = InternalAxiosRequestConfig & { _retry?: boolean };

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as RetriableConfig | undefined;
    const url = original?.url ?? "";
    if (error.response?.status === 401 && original && !original._retry && !url.startsWith("/auth/login")) {
      original._retry = true;
      const token = await refreshAccess();
      if (token) {
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      }
      onSessionExpired?.();
    }
    return Promise.reject(error);
  },
);

export interface ApiErrorInfo {
  status: number | null;
  detail: string;
  code: string;
  errors: Record<string, unknown>;
  data: Record<string, unknown>;
}

export function parseApiError(err: unknown): ApiErrorInfo {
  if (axios.isAxiosError(err)) {
    if (!err.response) {
      return {
        status: null,
        detail: "Server bilan aloqa yo'q. Internet aloqasini tekshiring.",
        code: "network_error",
        errors: {},
        data: {},
      };
    }
    const data = (err.response.data ?? {}) as Record<string, unknown>;
    return {
      status: err.response.status,
      detail:
        typeof data.detail === "string" && data.detail
          ? data.detail
          : err.response.status >= 500
            ? "Serverda kutilmagan xatolik. Birozdan so'ng qayta urinib ko'ring."
            : "So'rovni bajarib bo'lmadi.",
      code: typeof data.code === "string" ? data.code : "error",
      errors: (data.errors as Record<string, unknown>) ?? {},
      data,
    };
  }
  return { status: null, detail: String((err as Error)?.message ?? err), code: "error", errors: {}, data: {} };
}

/** First error message of a backend ``errors`` entry (handles nested arrays/objects). */
export function fieldMessage(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const v of value) {
      const m = fieldMessage(v);
      if (m) return m;
    }
  }
  if (typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) {
      const m = fieldMessage(v);
      if (m) return m;
    }
  }
  return undefined;
}

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

type Params = Record<string, string | number | boolean | null | undefined>;

export function cleanParams(params?: Params) {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v !== undefined && v !== null && v !== "") out[k] = v;
  }
  return out;
}

export async function get<T>(url: string, params?: Params, config?: AxiosRequestConfig): Promise<T> {
  const r = await api.get<T>(url, { ...config, params: cleanParams(params) });
  return r.data;
}

export async function post<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const r = await api.post<T>(url, body, config);
  return r.data;
}

export async function patch<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const r = await api.patch<T>(url, body, config);
  return r.data;
}

export async function del(url: string): Promise<void> {
  await api.delete(url);
}

/** Download a protected file (auth header required, so a plain <a href> would not work). */
export async function downloadFile(url: string, fallbackName = "file") {
  const r = await api.get(url, { responseType: "blob" });
  const disposition = String(r.headers["content-disposition"] ?? "");
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  const name = match ? decodeURIComponent(match[1]) : fallbackName;
  const href = URL.createObjectURL(r.data as Blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

export function toFormData(values: Record<string, unknown>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) {
    if (v === undefined || v === null) continue;
    if (v instanceof File) fd.append(k, v);
    else if (typeof v === "boolean") fd.append(k, v ? "true" : "false");
    else fd.append(k, String(v));
  }
  return fd;
}
