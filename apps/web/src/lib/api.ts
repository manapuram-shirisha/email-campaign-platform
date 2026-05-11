export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

export function getAccessToken() {
  return localStorage.getItem("auth")
    ? JSON.parse(localStorage.getItem("auth") as string)?.accessToken ?? null
    : null;
}

function getAuthState() {
  const raw = localStorage.getItem("auth");
  return raw ? (JSON.parse(raw) as { accessToken: string; refreshToken: string; user: unknown }) : null;
}

async function tryRefreshAccessToken() {
  const auth = getAuthState();
  if (!auth?.refreshToken) return null;

  const res = await fetch(`${API_BASE}/api/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: auth.refreshToken })
  });

  if (!res.ok) return null;

  const data = (await res.json()) as { accessToken?: string };
  if (!data.accessToken) return null;

  const next = { ...auth, accessToken: data.accessToken };
  localStorage.setItem("auth", JSON.stringify(next));
  return data.accessToken;
}

export async function apiFetch(path: string, init?: RequestInit) {
  let token = getAccessToken();

  const headers = new Headers(init?.headers ?? {});
  headers.set("Content-Type", "application/json");

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers
  });

  if (res.status === 401) {
    const refreshed = await tryRefreshAccessToken();
    if (refreshed) {
      token = refreshed;
      const retryHeaders = new Headers(init?.headers ?? {});
      retryHeaders.set("Content-Type", "application/json");
      retryHeaders.set("Authorization", `Bearer ${token}`);

      const retry = await fetch(`${API_BASE}${path}`, {
        ...init,
        headers: retryHeaders
      });
      const retryData = await retry.json().catch(() => ({}));
      if (!retry.ok) throw new Error(retryData?.message ?? "Request failed");
      return retryData;
    }
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data?.message ?? "Request failed");
  }

  return data;
}
