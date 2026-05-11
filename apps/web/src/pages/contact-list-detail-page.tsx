import React, { useEffect, useState } from "react";
import { API_BASE, apiFetch, getAccessToken } from "../lib/api";

type Role = "SUPER_ADMIN" | "CAMPAIGN_MANAGER" | "VIEWER";
type ContactStatus = "ACTIVE" | "UNSUBSCRIBED" | "BOUNCED" | "COMPLAINED";

type ContactItem = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  status: ContactStatus;
  subscribedAt: string;
};

type ListDetail = {
  id: string;
  name: string;
  description: string | null;
  contactCount: number;
  bounceRate: number;
  openRate: number;
};

export function ContactListDetailPage(props: {
  role: Role;
  listId: string | null;
  onBack: () => void;
  onOpenContact: (contactId: string) => void;
}) {
  const canWrite = props.role === "SUPER_ADMIN" || props.role === "CAMPAIGN_MANAGER";
  const [list, setList] = useState<ListDetail | null>(null);
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"subscribedAt" | "email" | "firstName">("subscribedAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState<ContactStatus>("UNSUBSCRIBED");
  const [status, setStatus] = useState("");

  async function load() {
    if (!props.listId) return;
    try {
      const [listData, contactData] = await Promise.all([
        apiFetch(`/api/lists/${props.listId}`),
        apiFetch(
          `/api/lists/${props.listId}/contacts?${new URLSearchParams({
            page: "1",
            pageSize: "50",
            search,
            sortBy,
            sortOrder
          }).toString()}`
        )
      ]);
      setList(listData.list ?? null);
      setContacts(contactData.contacts ?? []);
      setSelectedIds([]);
    } catch (error) {
      setStatus((error as Error).message);
    }
  }

  useEffect(() => {
    void load();
  }, [props.listId, search, sortBy, sortOrder]);

  function toggle(contactId: string) {
    setSelectedIds((prev) => (prev.includes(contactId) ? prev.filter((id) => id !== contactId) : [...prev, contactId]));
  }

  async function bulkUpdateStatus() {
    if (!canWrite || !props.listId || selectedIds.length === 0) return;
    try {
      await apiFetch(`/api/lists/${props.listId}/contacts/bulk`, {
        method: "POST",
        body: JSON.stringify({ action: "update_status", contactIds: selectedIds, status: bulkStatus })
      });
      setStatus("Bulk status updated");
      await load();
    } catch (error) {
      setStatus((error as Error).message);
    }
  }

  async function bulkRemove() {
    if (!canWrite || !props.listId || selectedIds.length === 0) return;
    try {
      await apiFetch(`/api/lists/${props.listId}/contacts/bulk`, {
        method: "POST",
        body: JSON.stringify({ action: "remove_from_list", contactIds: selectedIds })
      });
      setStatus("Contacts removed from list");
      await load();
    } catch (error) {
      setStatus((error as Error).message);
    }
  }

  async function exportContactsCsv() {
    if (!props.listId) return;

    try {
      const response = await fetch(`${API_BASE}/api/lists/${props.listId}/contacts.csv`, {
        headers: {
          Authorization: `Bearer ${getAccessToken() ?? ""}`
        }
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.message ?? "Failed to export contacts");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${list?.name ?? "contacts"}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setStatus("Contact CSV exported");
    } catch (error) {
      setStatus((error as Error).message);
    }
  }

  return (
    <section className="panel" style={{ display: "grid", gap: 12 }}>
      <div className="panel-header">
        <h2>Contact List Detail</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => void exportContactsCsv()} disabled={!props.listId}>Export CSV</button>
          <button onClick={props.onBack}>Back</button>
        </div>
      </div>
      {status ? <p className="success">{status}</p> : null}
      {list ? (
        <p>
          <strong>{list.name}</strong> | Contacts: {list.contactCount} | Open Rate: {list.openRate}% | Bounce Rate: {list.bounceRate}%
        </p>
      ) : <p className="muted">Loading list...</p>}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input placeholder="Search contact" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}>
          <option value="subscribedAt">Subscribed</option>
          <option value="email">Email</option>
          <option value="firstName">First Name</option>
        </select>
        <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value as typeof sortOrder)}>
          <option value="desc">Desc</option>
          <option value="asc">Asc</option>
        </select>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value as ContactStatus)} disabled={!canWrite}>
          <option value="ACTIVE">ACTIVE</option>
          <option value="UNSUBSCRIBED">UNSUBSCRIBED</option>
          <option value="BOUNCED">BOUNCED</option>
          <option value="COMPLAINED">COMPLAINED</option>
        </select>
        <button onClick={() => void bulkUpdateStatus()} disabled={!canWrite || selectedIds.length === 0}>Bulk Status</button>
        <button onClick={() => void bulkRemove()} disabled={!canWrite || selectedIds.length === 0}>Bulk Remove</button>
      </div>

      <div className="table">
        <div className="table-head"><span>Select</span><span>Email</span><span>Name</span><span>Status</span></div>
        {contacts.map((contact) => (
          <div className="table-row" key={contact.id}>
            <span><input type="checkbox" checked={selectedIds.includes(contact.id)} onChange={() => toggle(contact.id)} /></span>
            <span><button className="link-button" onClick={() => props.onOpenContact(contact.id)}>{contact.email}</button></span>
            <span>{`${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim() || "-"}</span>
            <span>{contact.status}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
