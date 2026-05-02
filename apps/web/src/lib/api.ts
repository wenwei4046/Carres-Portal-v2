import { useAuth } from "./auth";

const baseUrl = import.meta.env.VITE_API_BASE_URL;

export class ApiError extends Error {
  constructor(public status: number, message: string, public body: unknown) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const session = useAuth.getState().session;
  const headers = new Headers(init.headers);
  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try { body = JSON.parse(text); } catch { body = text; }
  }

  if (!res.ok) {
    const msg =
      typeof body === "string"
        ? body
        : (body as { message?: string } | null)?.message ?? res.statusText;
    throw new ApiError(res.status, msg, body);
  }

  return body as T;
}
