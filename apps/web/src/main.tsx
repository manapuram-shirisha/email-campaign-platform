// apps/web/src/main.tsx
import React, { FormEvent, useEffect, useId, useState } from "react";
import { createRoot } from "react-dom/client";
import { ContactsManagementPage } from "./pages/contact-management-page";
import { ContactListDetailPage } from "./pages/contact-list-detail-page";
import { ContactDetailPage } from "./pages/contact-detail-page";
import { ContactsImportPage } from "./pages/contacts-import-page";
import { ContactsSegmentsPage } from "./pages/contacts-segments-page";
import { TemplateLibraryPage } from "./pages/template-library-page";
import { TemplateEditorPage } from "./pages/template-editor-page";
import { CampaignsPage } from "./pages/campaigns-page";
import { CampaignEditorPage } from "./pages/campaign-editor-page";
import { CampaignReportPage } from "./pages/campaign-report-page";
import { CampaignWizardPage } from "./pages/campaign-wizard-page";
import { SuppressionPage } from "./pages/suppression-page";
import { DashboardPage as AnalyticsDashboardPage } from "./pages/dashboard-page";
import { OrganisationSettingsPage } from "./pages/organisation-settings-page";
import "./styles.css";

type Role = "SUPER_ADMIN" | "CAMPAIGN_MANAGER" | "VIEWER";

type User = {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  orgId: string;
};

type AuthState = {
  accessToken: string;
  refreshToken: string;
  user: User;
};

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

const navItems = [
  { label: "Dashboard", path: "/", roles: ["SUPER_ADMIN", "CAMPAIGN_MANAGER", "VIEWER"] },
  { label: "Contacts", path: "/contacts/lists", roles: ["SUPER_ADMIN", "CAMPAIGN_MANAGER"] },
  { label: "Templates", path: "/templates", roles: ["SUPER_ADMIN", "CAMPAIGN_MANAGER"] },
  { label: "Campaigns", path: "/campaigns", roles: ["SUPER_ADMIN", "CAMPAIGN_MANAGER"] },
  { label: "Analytics", path: "/analytics", roles: ["SUPER_ADMIN", "CAMPAIGN_MANAGER", "VIEWER"] },
  { label: "Organisation", path: "/settings/org", roles: ["SUPER_ADMIN"] },
  { label: "Suppression", path: "/settings/suppression", roles: ["SUPER_ADMIN", "CAMPAIGN_MANAGER"] },
  { label: "Users", path: "/settings/users", roles: ["SUPER_ADMIN"] },
  { label: "Profile", path: "/settings/profile", roles: ["SUPER_ADMIN", "CAMPAIGN_MANAGER", "VIEWER"] }
] satisfies Array<{ label: string; path: string; roles: Role[] }>;

function canAccessRoute(path: string, role: Role) {
  if (path === "/" || path === "/analytics" || path === "/settings/profile") return true;
  if (path === "/settings/org" || path === "/settings/users") return role === "SUPER_ADMIN";
  if (path === "/settings/suppression") return role === "SUPER_ADMIN" || role === "CAMPAIGN_MANAGER";
  if (path.startsWith("/contacts/")) return role === "SUPER_ADMIN" || role === "CAMPAIGN_MANAGER";
  if (path === "/templates" || /^\/templates\/[^/]+\/edit$/.test(path)) {
    return role === "SUPER_ADMIN" || role === "CAMPAIGN_MANAGER";
  }
  if (path === "/campaigns" || path.startsWith("/campaigns/")) {
    return role === "SUPER_ADMIN" || role === "CAMPAIGN_MANAGER";
  }
  return true;
}

function extractTemplateId(path: string) {
  const match = path.match(/^\/templates\/([^/]+)\/edit$/);
  return match ? match[1] : null;
}

function extractCampaignId(path: string) {
  const match = path.match(/^\/campaigns\/([^/]+)\/edit$/);
  return match ? match[1] : null;
}

function extractCampaignReportId(path: string) {
  const match = path.match(/^\/campaigns\/([^/]+)\/report$/);
  return match ? match[1] : null;
}

function extractContactListId(path: string) {
  const match = path.match(/^\/contacts\/lists\/([^/]+)$/);
  return match ? match[1] : null;
}

function extractContactId(path: string) {
  const match = path.match(/^\/contacts\/([^/]+)$/);
  if (!match) return null;
  if (["lists", "import", "segments"].includes(match[1])) return null;
  return match[1];
}

function getCampaignWizardStep(path: string): "details" | "recipients" | "design" | "review" | null {
  if (path === "/campaigns/new/details") return "details";
  if (path === "/campaigns/new/recipient") return "recipients";
  if (path === "/campaigns/new/recipients") return "recipients";
  if (path === "/campaigns/new/design") return "design";
  if (path === "/campaigns/new/review") return "review";
  return null;
}

function App() {
  const [auth, setAuth] = useState<AuthState | null>(() => {
    const saved = localStorage.getItem("auth");
    return saved ? JSON.parse(saved) : null;
  });
  const [route, setRoute] = useState(window.location.pathname);

  useEffect(() => {
    const onPop = () => setRoute(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function navigate(path: string) {
    window.history.pushState({}, "", path);
    setRoute(window.location.pathname);
  }

  function saveAuth(next: AuthState) {
    localStorage.setItem("auth", JSON.stringify(next));
    setAuth(next);
  }

  async function logout() {
    const raw = localStorage.getItem("auth");
    if (raw) {
      try {
        const state = JSON.parse(raw) as { accessToken?: string; refreshToken?: string };
        await fetch(`${API_BASE}/api/auth/logout`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(state.accessToken ? { Authorization: `Bearer ${state.accessToken}` } : {})
          },
          body: JSON.stringify({ refreshToken: state.refreshToken })
        });
      } catch {
        // best-effort logout
      }
    }

    localStorage.removeItem("auth");
    setAuth(null);
    navigate("/login");
  }

  const templateId = extractTemplateId(route);
  const campaignId = extractCampaignId(route);
  const reportCampaignId = extractCampaignReportId(route);
  const campaignWizardStep = getCampaignWizardStep(route);
  const contactListId = extractContactListId(route);
  const contactId = extractContactId(route);
  const isTemplateEditorRoute = Boolean(templateId);
  const isCampaignEditorRoute = Boolean(campaignId);
  const isCampaignReportRoute = Boolean(reportCampaignId);
  const isCampaignWizardRoute = Boolean(campaignWizardStep);
  const isContactListDetailRoute = Boolean(contactListId);
  const isContactDetailRoute = Boolean(contactId);

  if (!auth) {
    if (route === "/forgot-password") return <ForgotPasswordPage onNavigate={navigate} />;
    if (route === "/reset-password") return <ResetPasswordPage onNavigate={navigate} />;
    return <LoginPage onLogin={saveAuth} onNavigate={navigate} />;
  }

  if (!canAccessRoute(route, auth.user.role)) {
    return (
      <Shell auth={auth} route={route} onNavigate={navigate} onLogout={logout}>
        <section className="panel">
          <h2>Access Restricted</h2>
          <p className="muted">Your role does not have access to this page.</p>
          <button className="primary-button" onClick={() => navigate("/")}>Go to Dashboard</button>
        </section>
      </Shell>
    );
  }

  return (
    <Shell auth={auth} route={route} onNavigate={navigate} onLogout={logout}>
      {route === "/" && <AnalyticsDashboardPage />}
      {route === "/analytics" && <AnalyticsDashboardPage />}
      {route === "/contacts/lists" && <ContactsManagementPage role={auth.user.role} />}
      {isContactListDetailRoute && (
        <ContactListDetailPage
          role={auth.user.role}
          listId={contactListId}
          onBack={() => navigate("/contacts/lists")}
          onOpenContact={(id) => navigate(`/contacts/${id}`)}
        />
      )}
      {isContactDetailRoute && (
        <ContactDetailPage
          contactId={contactId}
          onBack={() => navigate("/contacts/lists")}
        />
      )}
      {route === "/contacts/import" && <ContactsImportPage role={auth.user.role} />}
      {route === "/contacts/segments" && <ContactsSegmentsPage role={auth.user.role} />}

      {route === "/templates" && (
        <TemplateLibraryPage
          role={auth.user.role}
          onOpenEditor={(id) => navigate(`/templates/${id}/edit`)}
        />
      )}
      {isTemplateEditorRoute && (
        <TemplateEditorPage
          role={auth.user.role}
          templateId={templateId}
          onBackToLibrary={() => navigate("/templates")}
        />
      )}

      {route === "/campaigns" && (
        <CampaignsPage
          role={auth.user.role}
          onOpenEditor={(id) => navigate(`/campaigns/${id}/edit`)}
          onOpenReport={(id) => navigate(`/campaigns/${id}/report`)}
          onCreateNew={() => navigate("/campaigns/new/details")}
        />
      )}
      {isCampaignWizardRoute && campaignWizardStep && (
        <CampaignWizardPage
          role={auth.user.role}
          step={campaignWizardStep}
          onNavigate={navigate}
        />
      )}
      {isCampaignEditorRoute && (
        <CampaignEditorPage
          role={auth.user.role}
          campaignId={campaignId}
          onBack={() => navigate("/campaigns")}
        />
      )}
      {isCampaignReportRoute && (
        <CampaignReportPage
          campaignId={reportCampaignId}
          onBack={() => navigate("/campaigns")}
        />
      )}

      {route === "/settings/suppression" && <SuppressionPage />}
      {route === "/settings/org" && <OrganisationSettingsPage />}

      {route === "/settings/profile" && <ProfilePage auth={auth} onAuthChange={saveAuth} />}
      {route === "/settings/users" && <UsersPage auth={auth} />}

      {[
        "/",
        "/contacts/lists",
        "/contacts/import",
        "/contacts/segments",
        "/templates",
        "/campaigns",
        "/campaigns/new/details",
        "/campaigns/new/recipient",
        "/campaigns/new/recipients",
        "/campaigns/new/design",
        "/campaigns/new/review",
        "/analytics",
        "/settings/org",
        "/settings/suppression",
        "/settings/profile",
        "/settings/users"
      ].includes(route) || isTemplateEditorRoute || isCampaignEditorRoute || isCampaignReportRoute || isCampaignWizardRoute || isContactListDetailRoute || isContactDetailRoute
        ? null
        : <PlaceholderPage route={route} />}
    </Shell>
  );
}

function LoginPage(props: { onLogin: (auth: AuthState) => void; onNavigate: (path: string) => void }) {
  const [email, setEmail] = useState("manapuramshiri17@gmail.com");
  const [password, setPassword] = useState("Admin@123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);

    const response = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();
    setLoading(false);

    if (!response.ok) {
      setError(data.message ?? "Login failed");
      return;
    }

    props.onLogin(data);
    props.onNavigate("/");
  }

  return (
    <AuthLayout>
      <form className="auth-card" onSubmit={submit}>
        <div className="brand-mark">EC</div>
        <h1>Email Campaign Platform</h1>
        <p className="muted">Sign in to manage contacts, templates, campaigns, and reports.</p>
        <label>Email<input value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <PasswordField label="Password" value={password} onChange={setPassword} />
        {error && <p className="error">{error}</p>}
        <button className="primary-button" disabled={loading}>{loading ? "Signing in..." : "Sign in"}</button>
        <button className="link-button" type="button" onClick={() => props.onNavigate("/forgot-password")}>Forgot password?</button>
      </form>
    </AuthLayout>
  );
}

function ForgotPasswordPage(props: { onNavigate: (path: string) => void }) {
  const [email, setEmail] = useState("manapuramshiri17@gmail.com");
  const [message, setMessage] = useState("");
  const [token, setToken] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    const response = await fetch(`${API_BASE}/api/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });
    const data = await response.json();
    setMessage(data.message);
    setToken(data.devResetToken ?? "");
  }

  return (
    <AuthLayout>
      <form className="auth-card" onSubmit={submit}>
        <h1>Reset Password</h1>
        <p className="muted">Enter your admin email. In development, the reset token is shown here.</p>
        <label>Email<input value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <button className="primary-button">Send reset link</button>
        {message && <p className="success">{message}</p>}
        {token && <pre className="token-box">{token}</pre>}
        <button className="link-button" type="button" onClick={() => props.onNavigate("/login")}>Back to login</button>
      </form>
    </AuthLayout>
  );
}

function ResetPasswordPage(props: { onNavigate: (path: string) => void }) {
  const initialToken = new URLSearchParams(window.location.search).get("token") ?? "";
  const [token, setToken] = useState(initialToken);
  const [password, setPassword] = useState("Admin@123");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    const response = await fetch(`${API_BASE}/api/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password })
    });
    const data = await response.json();
    setMessage(data.message);
  }

  return (
    <AuthLayout>
      <form className="auth-card" onSubmit={submit}>
        <h1>Create New Password</h1>
        <label>Reset token<input value={token} onChange={(e) => setToken(e.target.value)} /></label>
        <PasswordField label="New password" value={password} onChange={setPassword} />
        <button className="primary-button">Reset password</button>
        {message && <p className="success">{message}</p>}
        <button className="link-button" type="button" onClick={() => props.onNavigate("/login")}>Back to login</button>
      </form>
    </AuthLayout>
  );
}

function AuthLayout(props: { children: React.ReactNode }) {
  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div>
          <p className="eyebrow">Campaign operations</p>
          <h2>Build, send, and measure email campaigns from one quiet workspace.</h2>
          <p>A focused admin console for teams managing contacts, templates, scheduled sends, compliance, and performance reporting.</p>
        </div>
      </section>
      {props.children}
    </main>
  );
}

function Shell(props: { auth: AuthState; route: string; children: React.ReactNode; onNavigate: (path: string) => void; onLogout: () => void }) {
  const visibleNav = navItems.filter((item) => item.roles.includes(props.auth.user.role));
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-mark small">EC</span>
          <div><strong>EmailOps</strong><span>{props.auth.user.role.replace("_", " ")}</span></div>
        </div>
        <nav>
          {visibleNav.map((item) => (
            <button key={item.path} className={props.route === item.path ? "nav-item active" : "nav-item"} onClick={() => props.onNavigate(item.path)}>
              {item.label}
            </button>
          ))}
        </nav>
      </aside>
      <section className="workspace">
        <header className="topbar">
          <div><p className="eyebrow">Admin console</p><h1>{getPageTitle(props.route)}</h1></div>
          <div className="user-chip"><span>{props.auth.user.name ?? props.auth.user.email}</span><button onClick={props.onLogout}>Logout</button></div>
        </header>
        <section className="content">{props.children}</section>
      </section>
    </main>
  );
}

function DashboardPage(props: { user: User }) {
  const cards = [
    ["Total Contacts", "3", "+ seeded demo"],
    ["Emails Sent", "0", "ready for sending"],
    ["Open Rate", "0%", "tracking later"],
    ["Click Rate", "0%", "tracking later"]
  ];
  return (
    <>
      <div className="welcome-strip">
        <div><h2>Welcome, {props.user.name ?? props.user.email}</h2><p>M1 is active: authentication, roles, profile, and user management.</p></div>
        <span className="status-pill">{props.user.role}</span>
      </div>
      <div className="metric-grid">
        {cards.map(([label, value, hint]) => (
          <article className="metric-card" key={label}><span>{label}</span><strong>{value}</strong><small>{hint}</small></article>
        ))}
      </div>
      <section className="panel">
        <h2>Recent Activity</h2>
        <div className="activity-row">Admin login and user role setup are ready.</div>
        <div className="activity-row">Contacts, templates, campaigns, and reports are protected placeholders.</div>
      </section>
    </>
  );
}

function ProfilePage(props: { auth: AuthState; onAuthChange: (auth: AuthState) => void }) {
  const [name, setName] = useState(props.auth.user.name ?? "");
  const [email, setEmail] = useState(props.auth.user.email);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");

  async function updateProfile(event: FormEvent) {
    event.preventDefault();
    const response = await fetch(`${API_BASE}/api/profile`, {
      method: "PUT",
      headers: authHeaders(props.auth.accessToken),
      body: JSON.stringify({ name, email })
    });
    const data = await response.json();
    if (response.ok) props.onAuthChange({ ...props.auth, user: data.user });
    setMessage(response.ok ? "Profile updated" : data.message);
  }

  async function updatePassword(event: FormEvent) {
    event.preventDefault();
    const response = await fetch(`${API_BASE}/api/profile/password`, {
      method: "PUT",
      headers: authHeaders(props.auth.accessToken),
      body: JSON.stringify({ currentPassword, newPassword })
    });
    const data = await response.json();
    setMessage(response.ok ? "Password updated" : data.message);
  }

  return (
    <div className="two-column">
      <form className="panel form-panel" onSubmit={updateProfile}>
        <h2>Profile</h2>
        <label>Name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>Email<input value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <button className="primary-button">Save profile</button>
      </form>
      <form className="panel form-panel" onSubmit={updatePassword}>
        <h2>Password</h2>
        <PasswordField label="Current password" value={currentPassword} onChange={setCurrentPassword} />
        <PasswordField label="New password" value={newPassword} onChange={setNewPassword} />
        <button className="primary-button">Update password</button>
        {message && <p className="success">{message}</p>}
      </form>
    </div>
  );
}

function UsersPage(props: { auth: AuthState }) {
  const [users, setUsers] = useState<User[]>([]);
  const [email, setEmail] = useState("newuser@example.com");
  const [name, setName] = useState("New User");
  const [role, setRole] = useState<Role>("CAMPAIGN_MANAGER");
  const [temporaryPassword, setTemporaryPassword] = useState("Temp@1234");
  const [message, setMessage] = useState("");

  async function loadUsers() {
    const response = await fetch(`${API_BASE}/api/users`, { headers: { Authorization: `Bearer ${props.auth.accessToken}` } });
    const data = await response.json();
    if (response.ok) setUsers(data.users);
    else setMessage(data.message);
  }

  async function inviteUser(event: FormEvent) {
    event.preventDefault();
    const response = await fetch(`${API_BASE}/api/users/invite`, {
      method: "POST",
      headers: authHeaders(props.auth.accessToken),
      body: JSON.stringify({ email, name, role, temporaryPassword })
    });
    const data = await response.json();
    setMessage(response.ok ? `Invited ${data.user.email}` : data.message);
    await loadUsers();
  }

  useEffect(() => { void loadUsers(); }, []);

  return (
    <div className="two-column users-layout">
      <section className="panel">
        <div className="panel-header"><h2>Users</h2><button onClick={loadUsers}>Refresh</button></div>
        <div className="table">
          <div className="table-head"><span>Name</span><span>Email</span><span>Role</span></div>
          {users.map((user) => <div className="table-row" key={user.id}><span>{user.name ?? "-"}</span><span>{user.email}</span><span>{user.role}</span></div>)}
        </div>
      </section>
      <form className="panel form-panel" onSubmit={inviteUser}>
        <h2>Invite User</h2>
        <label>Name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>Email<input value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>Role
          <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="SUPER_ADMIN">Super Admin</option>
            <option value="CAMPAIGN_MANAGER">Campaign Manager</option>
            <option value="VIEWER">Viewer</option>
          </select>
        </label>
        <PasswordField label="Temporary password" value={temporaryPassword} onChange={setTemporaryPassword} />
        <button className="primary-button">Invite teammate</button>
        {message && <p className="success">{message}</p>}
      </form>
    </div>
  );
}

function PlaceholderPage(props: { route: string }) {
  return <section className="panel"><h2>{getPageTitle(props.route)}</h2><p className="muted">Protected placeholder screen. Full module implementation comes next.</p></section>;
}

function PasswordField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  const inputId = useId();
  const iconLabel = visible ? "Hide" : "Show";

  return (
    <div className="password-field">
      <label htmlFor={inputId}>{props.label}</label>
      <span className="password-input-wrap">
        <input
          id={inputId}
          type={visible ? "text" : "password"}
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
        />
        <button
          type="button"
          className="password-toggle"
          aria-label={iconLabel}
          title={iconLabel}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </span>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M2.2 12s3.6-6.2 9.8-6.2S21.8 12 21.8 12s-3.6 6.2-9.8 6.2S2.2 12 2.2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M3 3l18 18" />
      <path d="M9.9 5.9c.7-.1 1.4-.2 2.1-.2 6.2 0 9.8 6.3 9.8 6.3a18 18 0 0 1-3.1 3.8" />
      <path d="M14.1 18.1c-.7.1-1.4.2-2.1.2-6.2 0-9.8-6.3-9.8-6.3a18.7 18.7 0 0 1 3.3-4" />
      <path d="M10.4 10.4a3 3 0 0 0 3.2 3.2" />
    </svg>
  );
}

function getPageTitle(route: string) {
  if (route === "/contacts/lists") return "Contacts Management";
  if (/^\/templates\/([^/]+)\/edit$/.test(route)) return "Template Editor";
  if (/^\/campaigns\/([^/]+)\/edit$/.test(route)) return "Campaign Editor";
  if (/^\/campaigns\/([^/]+)\/report$/.test(route)) return "Campaign Report";
  if (/^\/contacts\/lists\/([^/]+)$/.test(route)) return "List Detail";
  if (/^\/contacts\/([^/]+)$/.test(route)) return "Contact Detail";
  if (route === "/contacts/import") return "Import Contacts";
  if (route === "/contacts/segments") return "Segments";
  if (/^\/campaigns\/new\/details$/.test(route)) return "Campaign Wizard - Details";
  if (/^\/campaigns\/new\/recipient$/.test(route)) return "Campaign Wizard - Recipients";
  if (/^\/campaigns\/new\/recipients$/.test(route)) return "Campaign Wizard - Recipients";
  if (/^\/campaigns\/new\/design$/.test(route)) return "Campaign Wizard - Design";
  if (/^\/campaigns\/new\/review$/.test(route)) return "Campaign Wizard - Review";
  const item = navItems.find((nav) => nav.path === route);
  return item ? item.label : "Workspace";
}

function authHeaders(token: string) {
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
