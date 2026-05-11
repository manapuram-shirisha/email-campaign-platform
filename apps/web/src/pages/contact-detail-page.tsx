import React, { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

type ContactDetail = {
  contact: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
    status: string;
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

export function ContactDetailPage(props: { contactId: string | null; onBack: () => void }) {
  const [data, setData] = useState<ContactDetail | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!props.contactId) return;
    async function load() {
      try {
        const result = await apiFetch(`/api/contacts/${props.contactId}?eventsPage=1&eventsPageSize=50`);
        setData(result);
      } catch (error) {
        setStatus((error as Error).message);
      }
    }
    void load();
  }, [props.contactId]);

  return (
    <section className="panel" style={{ display: "grid", gap: 12 }}>
      <div className="panel-header">
        <h2>Contact Detail</h2>
        <button onClick={props.onBack}>Back</button>
      </div>
      {status ? <p className="success">{status}</p> : null}
      {!data ? <p className="muted">Loading contact...</p> : null}
      {data ? (
        <>
          <p><strong>Email:</strong> {data.contact.email}</p>
          <p><strong>Name:</strong> {`${data.contact.firstName ?? ""} ${data.contact.lastName ?? ""}`.trim() || "-"}</p>
          <p><strong>Status:</strong> {data.contact.status}</p>
          <p><strong>Phone:</strong> {data.contact.phone ?? "-"}</p>
          <section className="panel">
            <h3>Lists</h3>
            <ul>{data.contact.lists.map((x) => <li key={x.id}>{x.name}</li>)}</ul>
          </section>
          <section className="panel">
            <h3>Event History</h3>
            <div className="table">
              <div className="table-head"><span>Event</span><span>Time</span><span>Metadata</span></div>
              {data.events.map((event) => (
                <div className="table-row" key={event.id}>
                  <span>{event.eventType}</span>
                  <span>{new Date(event.occurredAt).toLocaleString()}</span>
                  <span>{typeof event.metadata === "object" ? JSON.stringify(event.metadata) : String(event.metadata ?? "-")}</span>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : null}
    </section>
  );
}
