import React, { FormEvent, useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

type SuppressionItem = {
  id: string;
  email: string;
  reason: "BOUNCED" | "COMPLAINED" | "UNSUBSCRIBED" | "MANUAL";
  suppressedAt: string;
};

export function SuppressionPage() {
  const [items, setItems] = useState<SuppressionItem[]>([]);
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState<SuppressionItem["reason"]>("MANUAL");
  const [status, setStatus] = useState("");

  async function load() {
    try {
      const data = await apiFetch("/api/settings/suppression");
      setItems(data.items ?? []);
    } catch (error) {
      setStatus((error as Error).message);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function addItem(event: FormEvent) {
    event.preventDefault();
    try {
      await apiFetch("/api/settings/suppression", {
        method: "POST",
        body: JSON.stringify({ email, reason })
      });
      setEmail("");
      setStatus("Suppression entry added");
      await load();
    } catch (error) {
      setStatus((error as Error).message);
    }
  }

  async function removeItem(id: string) {
    try {
      await apiFetch(`/api/settings/suppression/${id}`, { method: "DELETE" });
      setStatus("Suppression entry removed");
      await load();
    } catch (error) {
      setStatus((error as Error).message);
    }
  }

  return (
    <section className="panel" style={{ display: "grid", gap: 12 }}>
      <h2>Suppression List</h2>
      {status ? <p className="success">{status}</p> : null}

      <form className="panel form-panel" onSubmit={addItem}>
        <label>Email<input value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label>
          Reason
          <select value={reason} onChange={(e) => setReason(e.target.value as SuppressionItem["reason"])}>
            <option value="MANUAL">MANUAL</option>
            <option value="BOUNCED">BOUNCED</option>
            <option value="COMPLAINED">COMPLAINED</option>
            <option value="UNSUBSCRIBED">UNSUBSCRIBED</option>
          </select>
        </label>
        <button className="primary-button">Add Entry</button>
      </form>

      <section className="panel">
        <div className="table">
          <div className="table-head">
            <span>Email</span>
            <span>Reason</span>
            <span>Date</span>
            <span>Action</span>
          </div>
          {items.map((item) => (
            <div className="table-row" key={item.id}>
              <span>{item.email}</span>
              <span>{item.reason}</span>
              <span>{new Date(item.suppressedAt).toLocaleString()}</span>
              <span><button onClick={() => void removeItem(item.id)}>Remove</button></span>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}

