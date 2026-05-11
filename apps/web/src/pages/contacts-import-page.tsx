import React, { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

type Role = "SUPER_ADMIN" | "CAMPAIGN_MANAGER" | "VIEWER";
type ListItem = { id: string; name: string; contactCount: number };

export function ContactsImportPage(props: { role: Role }) {
  const canWrite = props.role === "SUPER_ADMIN" || props.role === "CAMPAIGN_MANAGER";
  const [lists, setLists] = useState<ListItem[]>([]);
  const [listId, setListId] = useState("");
  const [csvText, setCsvText] = useState("email,first_name,last_name\nsample1@example.com,Sample,One");
  const [headers, setHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<{ email: string; firstName?: string; lastName?: string; phone?: string }>({ email: "email" });
  const [status, setStatus] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const data = await apiFetch("/api/lists");
        setLists(data.lists ?? []);
        if (!listId && data.lists?.length) setListId(data.lists[0].id);
      } catch (error) {
        setStatus((error as Error).message);
      }
    }
    void load();
  }, []);

  async function preview() {
    if (!listId) return;
    try {
      const data = await apiFetch(`/api/lists/${listId}/import`, {
        method: "POST",
        body: JSON.stringify({ mode: "preview", csv: csvText })
      });
      setHeaders(data.headers ?? []);
      setPreviewRows(data.previewRows ?? []);
      setStatus(`Preview ready: ${data.totalRows ?? 0} rows`);
    } catch (error) {
      setStatus((error as Error).message);
    }
  }

  async function commit() {
    if (!canWrite || !listId) return;
    try {
      const data = await apiFetch(`/api/lists/${listId}/import`, {
        method: "POST",
        body: JSON.stringify({ mode: "commit", csv: csvText, mapping })
      });
      const job = data.importJob;
      setStatus(`Import completed. Added ${job.added}, Updated ${job.updated}, Skipped ${job.skipped}, Failed ${job.errored}`);
    } catch (error) {
      setStatus((error as Error).message);
    }
  }

  return (
    <section className="panel" style={{ display: "grid", gap: 12 }}>
      <h2>Import Contacts</h2>
      {status ? <p className="success">{status}</p> : null}
      <label>
        Target List
        <select value={listId} onChange={(e) => setListId(e.target.value)}>
          {lists.map((list) => <option key={list.id} value={list.id}>{list.name} ({list.contactCount})</option>)}
        </select>
      </label>
      <textarea rows={8} style={{ width: "100%" }} value={csvText} onChange={(e) => setCsvText(e.target.value)} />
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => void preview()}>Preview</button>
        <button onClick={() => void commit()} disabled={!canWrite}>Import</button>
      </div>
      {headers.length > 0 ? (
        <div style={{ display: "grid", gap: 8 }}>
          <label>Email Column<select value={mapping.email} onChange={(e) => setMapping((p) => ({ ...p, email: e.target.value }))}>{headers.map((h) => <option key={h} value={h}>{h}</option>)}</select></label>
          <label>First Name Column<select value={mapping.firstName ?? ""} onChange={(e) => setMapping((p) => ({ ...p, firstName: e.target.value || undefined }))}><option value="">(none)</option>{headers.map((h) => <option key={h} value={h}>{h}</option>)}</select></label>
          <label>Last Name Column<select value={mapping.lastName ?? ""} onChange={(e) => setMapping((p) => ({ ...p, lastName: e.target.value || undefined }))}><option value="">(none)</option>{headers.map((h) => <option key={h} value={h}>{h}</option>)}</select></label>
          <label>Phone Column<select value={mapping.phone ?? ""} onChange={(e) => setMapping((p) => ({ ...p, phone: e.target.value || undefined }))}><option value="">(none)</option>{headers.map((h) => <option key={h} value={h}>{h}</option>)}</select></label>
          <pre className="token-box">{JSON.stringify(previewRows, null, 2)}</pre>
        </div>
      ) : null}
    </section>
  );
}
