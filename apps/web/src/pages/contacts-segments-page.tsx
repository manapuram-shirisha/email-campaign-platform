import React, { FormEvent, useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

type Role = "SUPER_ADMIN" | "CAMPAIGN_MANAGER" | "VIEWER";

type Segment = {
  id: string;
  name: string;
  rules: {
    operator: "AND" | "OR";
    conditions: Array<{ field: string; operator: string; value: string }>;
  };
};

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

export function ContactsSegmentsPage(props: { role: Role }) {
  const canWrite = props.role === "SUPER_ADMIN" || props.role === "CAMPAIGN_MANAGER";
  const [segments, setSegments] = useState<Segment[]>([]);
  const [segmentName, setSegmentName] = useState("Opened Last 30 Days");
  const [segmentOperator, setSegmentOperator] = useState<"AND" | "OR">("AND");
  const [conditions, setConditions] = useState([{ field: "email", operator: "contains", value: "@" }]);
  const [status, setStatus] = useState("");

  async function loadSegments() {
    try {
      const data = await apiFetch("/api/segments");
      setSegments(data.segments ?? []);
    } catch (error) {
      setStatus((error as Error).message);
    }
  }

  useEffect(() => {
    void loadSegments();
  }, []);

  function updateCondition(index: number, key: "field" | "operator" | "value", value: string) {
    setConditions((prev) => prev.map((c, i) => (i === index ? { ...c, [key]: value } : c)));
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
    } catch (error) {
      setStatus((error as Error).message);
    }
  }

  return (
    <section className="panel" style={{ display: "grid", gap: 12 }}>
      <h2>Segments</h2>
      {status ? <p className="success">{status}</p> : null}
      <form className="panel form-panel" onSubmit={createSegment}>
        <label>Segment Name<input value={segmentName} onChange={(e) => setSegmentName(e.target.value)} disabled={!canWrite} /></label>
        <label>Operator<select value={segmentOperator} onChange={(e) => setSegmentOperator(e.target.value as "AND" | "OR")} disabled={!canWrite}><option value="AND">AND</option><option value="OR">OR</option></select></label>
        {conditions.map((condition, index) => (
          <div key={index} style={{ display: "flex", gap: 8 }}>
            <input value={condition.field} onChange={(e) => updateCondition(index, "field", e.target.value)} />
            <select value={condition.operator} onChange={(e) => updateCondition(index, "operator", e.target.value)}>
              <option value="equals">equals</option>
              <option value="not_equals">not_equals</option>
              <option value="contains">contains</option>
              <option value="not_contains">not_contains</option>
              <option value="opened_last_30_days">opened_last_30_days</option>
              <option value="never_opened">never_opened</option>
              <option value="never_clicked">never_clicked</option>
            </select>
            <input value={condition.value} onChange={(e) => updateCondition(index, "value", e.target.value)} />
          </div>
        ))}
        <button className="primary-button" disabled={!canWrite}>Create Segment</button>
      </form>
      <section className="panel">
        <div className="table">
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
    </section>
  );
}
