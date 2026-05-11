const API_BASE = process.env.SMOKE_API_BASE ?? "http://localhost:4000";
const EMAIL = process.env.SMOKE_EMAIL ?? "manapuramshiri17@gmail.com";
const PASSWORD = process.env.SMOKE_PASSWORD ?? "Admin@123";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers ?? {})
    }
  });

  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    throw new Error(`${options.method ?? "GET"} ${path} failed: ${response.status} ${JSON.stringify(body)}`);
  }

  return body;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const health = await request("/health");
  assert(health.status === "ok", "Health endpoint did not return ok");

  const login = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: EMAIL, password: PASSWORD })
  });
  assert(login.accessToken, "Login did not return an access token");
  assert(login.refreshToken, "Login did not return a refresh token");

  const authHeaders = { Authorization: `Bearer ${login.accessToken}` };

  const me = await request("/api/auth/me", { headers: authHeaders });
  assert(me.user?.email === EMAIL, "Authenticated user email mismatch");

  const lists = await request("/api/lists", { headers: authHeaders });
  assert(Array.isArray(lists.lists), "Lists endpoint did not return a list array");

  const templates = await request("/api/templates", { headers: authHeaders });
  assert(Array.isArray(templates.templates), "Templates endpoint did not return a template array");

  const dashboard = await request("/api/analytics/dashboard", { headers: authHeaders });
  assert(typeof dashboard.cards?.totalContacts === "number", "Dashboard cards are missing");

  const campaigns = await request("/api/campaigns", { headers: authHeaders });
  assert(Array.isArray(campaigns.campaigns), "Campaigns endpoint did not return a campaign array");

  if (campaigns.campaigns[0]?.id) {
    const progress = await request(`/api/campaigns/${campaigns.campaigns[0].id}/progress`, { headers: authHeaders });
    assert(progress.campaignId === campaigns.campaigns[0].id, "Campaign progress response mismatch");
  }

  const refresh = await request("/api/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refreshToken: login.refreshToken })
  });
  assert(refresh.accessToken, "Refresh endpoint did not return a new access token");

  console.log("Smoke test passed");
  console.log(`API: ${API_BASE}`);
  console.log(`User: ${EMAIL}`);
}

main().catch((error) => {
  console.error("Smoke test failed");
  console.error(error.message);
  process.exit(1);
});
