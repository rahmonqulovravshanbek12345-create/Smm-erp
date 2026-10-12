// Serverli tizim: brauzer ↔ server so'rovlari. Demo (GitHub Pages) versiyasida ishlatilmaydi.
import type { ErpState, Role } from "./types";

/** Yig'ishda belgilanadi: `VITE_SERVER=1 vite build` — haqiqiy tizim, aks holda demo. */
export const SERVER_MODE = import.meta.env.VITE_SERVER === "1";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly blocked?: "password" | "2fa",
  ) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, body?: unknown, o: { method?: "GET" | "POST" } = {}): Promise<T> {
  const method = o.method ?? (body === undefined ? "GET" : "POST");
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers: method === "POST" ? { "Content-Type": "application/json", "X-ERP": "1" } : {},
      body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
    });
  } catch {
    throw new ApiError("Server bilan aloqa yo'q — internetni tekshiring", 0);
  }
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as { error?: string; blocked?: "password" | "2fa" };
  if (!res.ok) throw new ApiError(data.error ?? `Xatolik (${res.status})`, res.status, data.blocked);
  return data as T;
}

export interface MeInfo {
  user: { id: string; name: string; role: Role };
  login: string;
  blocked: "password" | "2fa" | null;
  has2fa: boolean;
  require2fa: boolean;
}

export interface StateResponse {
  version: number;
  state: ErpState;
}

export interface ActionResponse extends StateResponse {
  ok: true;
  value: unknown;
}
