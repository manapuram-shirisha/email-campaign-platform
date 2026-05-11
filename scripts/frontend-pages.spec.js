import { test, expect } from "@playwright/test";

const WEB_BASE = process.env.FRONTEND_WEB_BASE ?? "http://localhost:5173";
const API_BASE = process.env.FRONTEND_API_BASE ?? "http://localhost:4000";
const PASSWORD = "Admin@123";

const users = {
  superAdmin: { email: "manapuramshiri17@gmail.com", role: "SUPER_ADMIN" },
  campaignManager: { email: "yasalapun@gmail.com", role: "CAMPAIGN_MANAGER" },
  viewer: { email: "nikhilyasalapu77@gmail.com", role: "VIEWER" }
};

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers ?? {})
    }
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`${options.method ?? "GET"} ${path} failed ${response.status}: ${text}`);
  }
  return body;
}

async function login(email) {
  return api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password: PASSWORD })
  });
}

async function setAuth(page, auth) {
  await page.goto(WEB_BASE);
  await page.evaluate((value) => {
    localStorage.setItem("auth", JSON.stringify(value));
  }, auth);
}

async function expectAppPage(page, path, expectedTitle) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto(`${WEB_BASE}${path}`);
  await page.waitForLoadState("networkidle");
  await expect(page.locator("body")).toContainText(expectedTitle, { timeout: 10000 });
  await expect(page.locator("body")).not.toContainText("Protected placeholder screen");
  expect(errors, `Browser errors on ${path}`).toEqual([]);
}

test.describe.configure({ mode: "serial" });

test("01 login page accepts super admin credentials", async ({ page }) => {
  await page.goto(`${WEB_BASE}/login`);
  await page.getByLabel("Email").fill(users.superAdmin.email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator("body")).toContainText("Dashboard", { timeout: 10000 });
});

test("02 forgot-password page renders", async ({ page }) => {
  await page.goto(`${WEB_BASE}/forgot-password`);
  await expect(page.getByRole("heading", { name: "Reset Password" })).toBeVisible();
});

test("03 reset-password page renders", async ({ page }) => {
  await page.goto(`${WEB_BASE}/reset-password?token=test-token`);
  await expect(page.getByRole("heading", { name: "Create New Password" })).toBeVisible();
});

test("04 all admin FRD pages render for super admin", async ({ page }) => {
  const auth = await login(users.superAdmin.email);
  const headers = { Authorization: `Bearer ${auth.accessToken}` };
  const lists = await api("/api/lists", { headers });
  const listId = lists.lists.find((item) => item.name === "Real Test Recipients")?.id ?? lists.lists[0].id;
  const listContacts = await api(`/api/lists/${listId}/contacts`, { headers });
  const contactId = listContacts.contacts[0].id;
  const templates = await api("/api/templates", { headers });
  const templateId = templates.templates[0].id;
  const campaigns = await api("/api/campaigns", { headers });
  const campaignId = campaigns.campaigns[0].id;

  await setAuth(page, auth);

  const routes = [
    ["/", "Dashboard"],
    ["/contacts/lists", "Contacts Management"],
    [`/contacts/lists/${listId}`, "List Detail"],
    [`/contacts/${contactId}`, "Contact Detail"],
    ["/contacts/import", "Import Contacts"],
    ["/contacts/segments", "Segments"],
    ["/templates", "Template Library"],
    [`/templates/${templateId}/edit`, "Template Editor"],
    ["/campaigns", "Campaigns"],
    ["/campaigns/new/details", "Campaign Wizard - Details"],
    ["/campaigns/new/recipient", "Campaign Wizard - Recipients"],
    ["/campaigns/new/design", "Campaign Wizard - Design"],
    ["/campaigns/new/review", "Campaign Wizard - Review"],
    [`/campaigns/${campaignId}/report`, "Campaign Report"],
    ["/settings/suppression", "Suppression"],
    ["/settings/org", "Organisation"],
    ["/settings/users", "Users"]
  ];

  for (const [path, title] of routes) {
    await expectAppPage(page, path, title);
  }
});

test("05 campaign manager can open write modules but not super-admin settings", async ({ page }) => {
  const auth = await login(users.campaignManager.email);
  await setAuth(page, auth);
  await expectAppPage(page, "/contacts/lists", "Contacts Management");
  await expectAppPage(page, "/templates", "Template Library");
  await expectAppPage(page, "/campaigns", "Campaigns");
  await page.goto(`${WEB_BASE}/settings/users`);
  await expect(page.locator("body")).toContainText("Access Restricted");
});

test("06 viewer is read-only and blocked from module edit pages", async ({ page }) => {
  const auth = await login(users.viewer.email);
  await setAuth(page, auth);
  await expectAppPage(page, "/", "Dashboard");
  await expectAppPage(page, "/analytics", "Dashboard");
  await page.goto(`${WEB_BASE}/contacts/lists`);
  await expect(page.locator("body")).toContainText("Access Restricted");
  await page.goto(`${WEB_BASE}/campaigns`);
  await expect(page.locator("body")).toContainText("Access Restricted");
});

test("07 public unsubscribe and preferences pages render", async ({ page }) => {
  const auth = await login(users.superAdmin.email);
  const headers = { Authorization: `Bearer ${auth.accessToken}` };
  const lists = await api("/api/lists", { headers });
  const listId = lists.lists.find((item) => item.name === "Real Test Recipients")?.id ?? lists.lists[0].id;
  const listContacts = await api(`/api/lists/${listId}/contacts`, { headers });
  const contactId = listContacts.contacts[0].id;
  const campaigns = await api("/api/campaigns", { headers });
  const campaignId = campaigns.campaigns[0].id;
  const uid = Buffer.from(`${campaignId}:${contactId}`).toString("base64url");

  await page.goto(`${API_BASE}/preferences?uid=${encodeURIComponent(uid)}`);
  await expect(page.locator("body")).toContainText("Preference Center");

  await page.goto(`${API_BASE}/unsubscribe?uid=${encodeURIComponent(uid)}`);
  await expect(page.locator("body")).toContainText("You Have Been Unsubscribed");
});
