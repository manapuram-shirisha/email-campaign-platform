// apps/web/src/pages/template-library-page.tsx
import React, { FormEvent, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";

type Role = "SUPER_ADMIN" | "CAMPAIGN_MANAGER" | "VIEWER";

type Template = {
  id: string;
  name: string;
  category: string;
  html: string;
  blocks: unknown[];
  thumbnailUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export function TemplateLibraryPage(props: {
  role: Role;
  onOpenEditor: (templateId: string) => void;
}) {
  const canWrite = props.role === "SUPER_ADMIN" || props.role === "CAMPAIGN_MANAGER";

  const [templates, setTemplates] = useState<Template[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");

  const [newName, setNewName] = useState("New Template");
  const [newCategory, setNewCategory] = useState("General");
  const [newHtml, setNewHtml] = useState(
    `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
  <h1 style="color:#172033;">Hello {{first_name}}</h1>
  <p>Template body text</p>
  <p style="font-size:12px;color:#687386;margin-top:32px;">{{unsubscribe_link}}</p>
</div>`
  );

  async function loadTemplates() {
    try {
      const query = new URLSearchParams();
      if (search.trim()) query.set("search", search.trim());
      if (category.trim()) query.set("category", category.trim());

      const data = await apiFetch(`/api/templates?${query.toString()}`);
      setTemplates(data.templates ?? []);
    } catch (e) {
      setStatus((e as Error).message);
    }
  }

  useEffect(() => {
    loadTemplates();
  }, [search, category]);

  const categories = useMemo(() => {
    const set = new Set(templates.map((t) => t.category));
    return Array.from(set).sort();
  }, [templates]);

  async function createTemplate(event: FormEvent) {
    event.preventDefault();
    if (!canWrite) return;

    try {
      await apiFetch("/api/templates", {
        method: "POST",
        body: JSON.stringify({
          name: newName,
          category: newCategory,
          html: newHtml,
          blocks: []
        })
      });
      setStatus("Template created");
      await loadTemplates();
    } catch (e) {
      setStatus((e as Error).message);
    }
  }

  async function duplicateTemplate(id: string) {
    if (!canWrite) return;
    try {
      await apiFetch(`/api/templates/${id}/duplicate`, { method: "POST" });
      setStatus("Template duplicated");
      await loadTemplates();
    } catch (e) {
      setStatus((e as Error).message);
    }
  }

  async function deleteTemplate(id: string) {
    if (!canWrite) return;
    try {
      await apiFetch(`/api/templates/${id}`, { method: "DELETE" });
      setStatus("Template deleted");
      await loadTemplates();
    } catch (e) {
      setStatus((e as Error).message);
    }
  }

  return (
    <div className="panel" style={{ display: "grid", gap: 16 }}>
      <h2>Template Library</h2>
      {!canWrite ? <p className="muted">Viewer mode: read-only access enabled.</p> : null}
      {status ? <p className="success">{status}</p> : null}

      <section className="panel form-panel">
        <h3>Search & Filter</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            placeholder="Search template name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button onClick={loadTemplates}>Refresh</button>
        </div>
      </section>

      <section className="panel form-panel">
        <h3>Create Template</h3>
        <form onSubmit={createTemplate}>
          <label>
            Name
            <input value={newName} onChange={(e) => setNewName(e.target.value)} disabled={!canWrite} />
          </label>
          <label>
            Category
            <input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} disabled={!canWrite} />
          </label>
          <label>
            HTML
            <textarea
              rows={8}
              value={newHtml}
              onChange={(e) => setNewHtml(e.target.value)}
              disabled={!canWrite}
              style={{ width: "100%" }}
            />
          </label>
          <button className="primary-button" disabled={!canWrite}>
            Create Template
          </button>
        </form>
      </section>

      <section className="panel">
        <h3>Saved Templates ({templates.length})</h3>
        <div className="table">
          <div className="table-head">
            <span>Name</span>
            <span>Category</span>
            <span>Updated</span>
            <span>Actions</span>
          </div>

          {templates.map((template) => (
            <div className="table-row" key={template.id}>
              <span>{template.name}</span>
              <span>{template.category}</span>
              <span>{new Date(template.updatedAt).toLocaleString()}</span>
              <span style={{ display: "flex", gap: 8 }}>
                <button onClick={() => props.onOpenEditor(template.id)}>
                  Edit
                </button>
                <button onClick={() => duplicateTemplate(template.id)} disabled={!canWrite}>
                  Duplicate
                </button>
                <button onClick={() => deleteTemplate(template.id)} disabled={!canWrite}>
                  Delete
                </button>
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
