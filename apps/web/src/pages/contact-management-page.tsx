// apps/web/src/pages/contact-management-page.tsx
import React, { FormEvent, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";

type Role = "SUPER_ADMIN" | "CAMPAIGN_MANAGER" | "VIEWER";
type ContactStatus = "ACTIVE" | "UNSUBSCRIBED" | "BOUNCED" | "COMPLAINED";

type ListItem = {
  id: string;
  name: string;
  description: string | null;
  tags: string[];
  contactCount: number;
};

type ListDetail = {
  id: string;
  name: string;
  description: string | null;
  tags: string[];
  contactCount: number;
  bounceRate: number;
  openRate: number;
};

type ContactItem = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  status: ContactStatus;
  subscribedAt: string;
};

type ContactDetail = {
  contact: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
    status: ContactStatus;
    customFields: Record<string, unknown> | null;
    lists: Array<{ id: string; name: string; subscribedAt: string }>;
  };
  events: Array<{
    id: string;
    eventType: string;
    occurredAt: string;
    metadata: unknown;
  }>;
};

type Segment = {
  id: string;
  name: string;
  rules: {
    operator: "AND" | "OR";
    conditions: Array<{ field: string; operator: string; value: string }>;
  };
};

export function ContactsManagementPage(props: { role: Role }) {
  const canWrite = props.role === "SUPER_ADMIN" || props.role === "CAMPAIGN_MANAGER";

  const [lists, setLists] = useState<ListItem[]>([]);
  const [activeListId, setActiveListId] = useState("");
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [total, setTotal] = useState(0);
  const [listDetail, setListDetail] = useState<ListDetail | null>(null);

  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"subscribedAt" | "email" | "firstName">("subscribedAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [page] = useState(1);
  const [pageSize] = useState(20);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState<ContactStatus>("UNSUBSCRIBED");

  const [newListName, setNewListName] = useState("");
  const [newListDescription, setNewListDescription] = useState("");

  const [newContactEmail, setNewContactEmail] = useState("");
  const [newContactFirstName, setNewContactFirstName] = useState("");
  const [newContactLastName, setNewContactLastName] = useState("");

  const [detail, setDetail] = useState<ContactDetail | null>(null);

  const [csvText, setCsvText] = useState(
    "email,first_name,last_name\ncsv1@example.com,Csv,One\ncsv2@example.com,Csv,Two"
  );
  const [previewHeaders, setPreviewHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<Record<string, string>[]>([]);
  const [importMapping, setImportMapping] = useState<{
    email: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
  }>({
    email: "email",
    firstName: "first_name",
    lastName: "last_name",
    phone: "phone"
  });
  const [importSummary, setImportSummary] = useState("");

  const [segments, setSegments] = useState<Segment[]>([]);
  const [segmentName, setSegmentName] = useState("City Chennai");
  const [segmentOperator, setSegmentOperator] = useState<"AND" | "OR">("AND");
  const [conditions, setConditions] = useState([
    { field: "custom.city", operator: "equals", value: "Chennai" }
  ]);

  const [status, setStatus] = useState("");

  const activeList = useMemo(
    () => lists.find((l) => l.id === activeListId) ?? null,
    [lists, activeListId]
  );

  async function loadLists() {
    const data = await apiFetch("/api/lists");
    setLists(data.lists ?? []);
    if (!activeListId && data.lists?.length) setActiveListId(data.lists[0].id);
  }

  async function loadContacts() {
    if (!activeListId) return;
    const query = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      search,
      sortBy,
      sortOrder
    });
    const data = await apiFetch(`/api/lists/${activeListId}/contacts?${query.toString()}`);
    setContacts(data.contacts ?? []);
    setTotal(data.total ?? 0);
    setSelectedIds([]);
  }

  async function loadListDetail() {
    if (!activeListId) return;
    try {
      const data = await apiFetch(`/api/lists/${activeListId}`);
      setListDetail(data.list ?? null);
    } catch (e) {
      setStatus((e as Error).message);
    }
  }

  async function loadSegments() {
    const data = await apiFetch("/api/segments");
    setSegments(data.segments ?? []);
  }

  useEffect(() => {
    loadLists().catch((e) => setStatus(e.message));
    loadSegments().catch((e) => setStatus(e.message));
  }, []);

  useEffect(() => {
    loadContacts().catch((e) => setStatus(e.message));
    loadListDetail().catch((e) => setStatus(e.message));
  }, [activeListId, search, sortBy, sortOrder]);

  async function createList(event: FormEvent) {
    event.preventDefault();
    if (!canWrite) return;
    try {
      await apiFetch("/api/lists", {
        method: "POST",
        body: JSON.stringify({ name: newListName, description: newListDescription, tags: [] })
      });
      setNewListName("");
      setNewListDescription("");
      setStatus("List created");
      await loadLists();
    } catch (e) {
      setStatus((e as Error).message);
    }
  }

  async function createContact(event: FormEvent) {
    event.preventDefault();
    if (!canWrite || !activeListId) return;
    try {
      await apiFetch("/api/contacts", {
        method: "POST",
        body: JSON.stringify({
          email: newContactEmail,
          firstName: newContactFirstName || undefined,
          lastName: newContactLastName || undefined,
          listIds: [activeListId],
          customFields: {}
        })
      });
      setNewContactEmail("");
      setNewContactFirstName("");
      setNewContactLastName("");
      setStatus("Contact saved");
      await loadContacts();
      await loadLists();
    } catch (e) {
      setStatus((e as Error).message);
    }
  }

  async function openContactDetail(contactId: string) {
    try {
      const data = await apiFetch(`/api/contacts/${contactId}?eventsPage=1&eventsPageSize=20`);
      setDetail(data);
    } catch (e) {
      setStatus((e as Error).message);
    }
  }

  function toggleSelection(contactId: string) {
    setSelectedIds((prev) =>
      prev.includes(contactId) ? prev.filter((id) => id !== contactId) : [...prev, contactId]
    );
  }

  async function bulkUpdateStatus() {
    if (!canWrite || !activeListId || selectedIds.length === 0) return;
    try {
      await apiFetch(`/api/lists/${activeListId}/contacts/bulk`, {
        method: "POST",
        body: JSON.stringify({ action: "update_status", contactIds: selectedIds, status: bulkStatus })
      });
      setStatus("Status updated");
      await loadContacts();
    } catch (e) {
      setStatus((e as Error).message);
    }
  }

  async function bulkRemoveFromList() {
    if (!canWrite || !activeListId || selectedIds.length === 0) return;
    try {
      await apiFetch(`/api/lists/${activeListId}/contacts/bulk`, {
        method: "POST",
        body: JSON.stringify({ action: "remove_from_list", contactIds: selectedIds })
      });
      setStatus("Contacts removed from list");
      await loadContacts();
      await loadLists();
    } catch (e) {
      setStatus((e as Error).message);
    }
  }

  async function previewImport() {
    if (!activeListId) return;
    try {
      const data = await apiFetch(`/api/lists/${activeListId}/import`, {
        method: "POST",
        body: JSON.stringify({ mode: "preview", csv: csvText })
      });
      setPreviewHeaders(data.headers ?? []);
      setPreviewRows(data.previewRows ?? []);
      const headers: string[] = data.headers ?? [];
      setImportMapping((prev) => ({
        email: headers.includes(prev.email) ? prev.email : headers[0] ?? "email",
        firstName: headers.includes(prev.firstName ?? "") ? prev.firstName : headers.find((h) => /first.?name/i.test(h)),
        lastName: headers.includes(prev.lastName ?? "") ? prev.lastName : headers.find((h) => /last.?name/i.test(h)),
        phone: headers.includes(prev.phone ?? "") ? prev.phone : headers.find((h) => /phone/i.test(h))
      }));
      setImportSummary(`Preview ready: ${data.totalRows ?? 0} rows`);
    } catch (e) {
      setStatus((e as Error).message);
    }
  }

  async function commitImport() {
    if (!canWrite || !activeListId) return;
    try {
      const data = await apiFetch(`/api/lists/${activeListId}/import`, {
        method: "POST",
        body: JSON.stringify({
          mode: "commit",
          csv: csvText,
          mapping: importMapping
        })
      });
      const job = data.importJob;
      setImportSummary(
        `Import completed. Added: ${job.added}, Updated: ${job.updated}, Skipped: ${job.skipped}, Failed: ${job.errored}`
      );
      await loadContacts();
      await loadLists();
      await loadListDetail();
    } catch (e) {
      setStatus((e as Error).message);
    }
  }

  function updateCondition(index: number, key: "field" | "operator" | "value", value: string) {
    setConditions((prev) => prev.map((c, i) => (i === index ? { ...c, [key]: value } : c)));
  }

  function addCondition() {
    if (!canWrite) return;
    setConditions((prev) => [...prev, { field: "email", operator: "contains", value: "" }]);
  }

  function removeCondition(index: number) {
    if (!canWrite) return;
    setConditions((prev) => prev.filter((_, i) => i !== index));
  }

  async function createSegment(event: FormEvent) {
    event.preventDefault();
    if (!canWrite) return;
    try {
      await apiFetch("/api/segments", {
        method: "POST",
        body: JSON.stringify({ name: segmentName, rules: { operator: segmentOperator, conditions } })
      });
      setStatus("Segment created");
      await loadSegments();
    } catch (e) {
      setStatus((e as Error).message);
    }
  }

  return (
    <div className="panel" style={{ display: "grid", gap: 16 }}>
      <h2>Contacts Management</h2>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <a href="/contacts/import"><button>Import Screen</button></a>
        <a href="/contacts/segments"><button>Segments Screen</button></a>
      </div>
      {!canWrite ? <p className="muted">Viewer mode: read-only access enabled.</p> : null}
      {status ? <p className="success">{status}</p> : null}

      <div className="two-column">
        <section className="panel form-panel">
          <h3>Create List</h3>
          <form onSubmit={createList}>
            <label>
              Name
              <input value={newListName} onChange={(e) => setNewListName(e.target.value)} required disabled={!canWrite} />
            </label>
            <label>
              Description
              <input value={newListDescription} onChange={(e) => setNewListDescription(e.target.value)} disabled={!canWrite} />
            </label>
            <button className="primary-button" disabled={!canWrite}>Create List</button>
          </form>

          <h3 style={{ marginTop: 16 }}>Lists</h3>
          <div className="table">
            {lists.map((list) => (
              <div key={list.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button className={activeListId === list.id ? "nav-item active" : "nav-item"} onClick={() => setActiveListId(list.id)}>
                  {list.name} ({list.contactCount})
                </button>
                <a href={`/contacts/lists/${list.id}`}><button>Open</button></a>
              </div>
            ))}
          </div>
        </section>

        <section className="panel form-panel">
          <h3>Add Contact to {activeList?.name ?? "-"}</h3>
          <form onSubmit={createContact}>
            <label>
              Email
              <input type="email" value={newContactEmail} onChange={(e) => setNewContactEmail(e.target.value)} required disabled={!canWrite} />
            </label>
            <label>
              First Name
              <input value={newContactFirstName} onChange={(e) => setNewContactFirstName(e.target.value)} disabled={!canWrite} />
            </label>
            <label>
              Last Name
              <input value={newContactLastName} onChange={(e) => setNewContactLastName(e.target.value)} disabled={!canWrite} />
            </label>
            <button className="primary-button" disabled={!canWrite}>Save Contact</button>
          </form>
        </section>
      </div>

      <section className="panel">
        <div className="panel-header"><h3>List Contacts ({total})</h3></div>
        {listDetail ? (
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 12 }}>
            <span><strong>List:</strong> {listDetail.name}</span>
            <span><strong>Contacts:</strong> {listDetail.contactCount}</span>
            <span><strong>Open Rate:</strong> {listDetail.openRate}%</span>
            <span><strong>Bounce Rate:</strong> {listDetail.bounceRate}%</span>
          </div>
        ) : null}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <input placeholder="Search email / first / last name" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}>
            <option value="subscribedAt">Sort by Subscribed</option>
            <option value="email">Sort by Email</option>
            <option value="firstName">Sort by First Name</option>
          </select>
          <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value as typeof sortOrder)}>
            <option value="desc">Desc</option>
            <option value="asc">Asc</option>
          </select>
          <button onClick={() => loadContacts()}>Refresh</button>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value as ContactStatus)} disabled={!canWrite}>
            <option value="ACTIVE">ACTIVE</option>
            <option value="UNSUBSCRIBED">UNSUBSCRIBED</option>
            <option value="BOUNCED">BOUNCED</option>
            <option value="COMPLAINED">COMPLAINED</option>
          </select>
          <button onClick={bulkUpdateStatus} disabled={!canWrite || selectedIds.length === 0}>Bulk Update Status</button>
          <button onClick={bulkRemoveFromList} disabled={!canWrite || selectedIds.length === 0}>Bulk Remove from List</button>
        </div>

        <div className="table">
          <div className="table-head"><span>Select</span><span>Email</span><span>Name</span><span>Status</span></div>
          {contacts.map((contact) => (
            <div className="table-row" key={contact.id}>
              <span><input type="checkbox" checked={selectedIds.includes(contact.id)} onChange={() => toggleSelection(contact.id)} disabled={!canWrite} /></span>
              <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button className="link-button" onClick={() => openContactDetail(contact.id)}>{contact.email}</button>
                <a href={`/contacts/${contact.id}`}><button>View</button></a>
              </span>
              <span>{`${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim() || "-"}</span>
              <span>{contact.status}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h3>CSV Import</h3>
        <textarea rows={6} value={csvText} onChange={(e) => setCsvText(e.target.value)} style={{ width: "100%" }} />
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button onClick={previewImport}>Preview</button>
          <button onClick={commitImport} disabled={!canWrite}>Import</button>
        </div>
        {previewHeaders.length > 0 ? (
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            <label>
              Email Column
              <select
                value={importMapping.email}
                onChange={(e) => setImportMapping((prev) => ({ ...prev, email: e.target.value }))}
              >
                {previewHeaders.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </label>
            <label>
              First Name Column
              <select
                value={importMapping.firstName ?? ""}
                onChange={(e) => setImportMapping((prev) => ({ ...prev, firstName: e.target.value || undefined }))}
              >
                <option value="">(none)</option>
                {previewHeaders.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </label>
            <label>
              Last Name Column
              <select
                value={importMapping.lastName ?? ""}
                onChange={(e) => setImportMapping((prev) => ({ ...prev, lastName: e.target.value || undefined }))}
              >
                <option value="">(none)</option>
                {previewHeaders.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </label>
            <label>
              Phone Column
              <select
                value={importMapping.phone ?? ""}
                onChange={(e) => setImportMapping((prev) => ({ ...prev, phone: e.target.value || undefined }))}
              >
                <option value="">(none)</option>
                {previewHeaders.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </label>
          </div>
        ) : null}
        {importSummary ? <p className="success">{importSummary}</p> : null}
        {previewHeaders.length > 0 ? <p>Headers: {previewHeaders.join(", ")}</p> : null}
        {previewRows.length > 0 ? <pre className="token-box">{JSON.stringify(previewRows, null, 2)}</pre> : null}
      </section>

      <section className="panel">
        <h3>Segments</h3>
        <form onSubmit={createSegment}>
          <label>
            Segment Name
            <input value={segmentName} onChange={(e) => setSegmentName(e.target.value)} required disabled={!canWrite} />
          </label>
          <label>
            Operator
            <select value={segmentOperator} onChange={(e) => setSegmentOperator(e.target.value as "AND" | "OR")} disabled={!canWrite}>
              <option value="AND">AND</option>
              <option value="OR">OR</option>
            </select>
          </label>

          {conditions.map((condition, index) => (
            <div key={index} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input placeholder="field (email/custom.city)" value={condition.field} onChange={(e) => updateCondition(index, "field", e.target.value)} disabled={!canWrite} />
              <select value={condition.operator} onChange={(e) => updateCondition(index, "operator", e.target.value)} disabled={!canWrite}>
                <option value="equals">equals</option>
                <option value="not_equals">not_equals</option>
                <option value="contains">contains</option>
                <option value="not_contains">not_contains</option>
              </select>
              <input placeholder="value" value={condition.value} onChange={(e) => updateCondition(index, "value", e.target.value)} disabled={!canWrite} />
              {canWrite ? <button type="button" onClick={() => removeCondition(index)}>Remove</button> : null}
            </div>
          ))}

          <div style={{ display: "flex", gap: 8 }}>
            {canWrite ? <button type="button" onClick={addCondition}>Add Condition</button> : null}
            <button className="primary-button" disabled={!canWrite}>Create Segment</button>
          </div>
        </form>

        <div className="table" style={{ marginTop: 16 }}>
          <div className="table-head"><span>Name</span><span>Operator</span><span>Conditions</span><span>Count</span></div>
          {segments.map((segment) => (
            <div className="table-row" key={segment.id}>
              <span>{segment.name}</span>
              <span>{segment.rules?.operator ?? "-"}</span>
              <span>{segment.rules?.conditions?.length ?? 0}</span>
              <span><SegmentCount segmentId={segment.id} /></span>
            </div>
          ))}
        </div>
      </section>

      {detail ? (
        <section className="panel">
          <div className="panel-header"><h3>Contact Detail</h3><button onClick={() => setDetail(null)}>Close</button></div>
          <p><strong>Email:</strong> {detail.contact.email}</p>
          <p><strong>Name:</strong> {`${detail.contact.firstName ?? ""} ${detail.contact.lastName ?? ""}`.trim() || "-"}</p>
          <p><strong>Status:</strong> {detail.contact.status}</p>
          <h4>List Memberships</h4>
          <ul>{detail.contact.lists.map((item) => <li key={item.id}>{item.name}</li>)}</ul>
          <h4>Recent Events</h4>
          <ul>{detail.events.map((event) => <li key={event.id}>{event.eventType} - {new Date(event.occurredAt).toLocaleString()}</li>)}</ul>
        </section>
      ) : null}
    </div>
  );
}

function SegmentCount(props: { segmentId: string }) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const data = await apiFetch(`/api/segments/${props.segmentId}/count`);
        setCount(data.count ?? 0);
      } catch {
        setCount(null);
      }
    }
    void load();
  }, [props.segmentId]);

  return <>{count ?? "-"}</>;
}
