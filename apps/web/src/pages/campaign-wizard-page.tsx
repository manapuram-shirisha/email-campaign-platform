import React, { FormEvent, useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

type WizardStep = "details" | "recipients" | "design" | "review";
type Role = "SUPER_ADMIN" | "CAMPAIGN_MANAGER" | "VIEWER";

type Campaign = {
  id: string;
  name: string;
  subject: string;
  previewText: string | null;
  fromName: string;
  fromEmail: string;
  replyToEmail: string | null;
  templateId: string | null;
  timezone: string | null;
};

type ListItem = { id: string; name: string; contactCount: number };
type SegmentItem = { id: string; name: string };
type TemplateItem = { id: string; name: string; category: string };

export function CampaignWizardPage(props: {
  role: Role;
  step: WizardStep;
  onNavigate: (path: string) => void;
}) {
  const canWrite = props.role === "SUPER_ADMIN" || props.role === "CAMPAIGN_MANAGER";
  const [status, setStatus] = useState("");
  const [campaign, setCampaign] = useState<Campaign | null>(null);

  const [name, setName] = useState("New Campaign");
  const [subject, setSubject] = useState("Subject line");
  const [previewText, setPreviewText] = useState("Preview text");
  const [fromName, setFromName] = useState("EmailOps Team");
  const [fromEmail, setFromEmail] = useState("verified@example.com");
  const [replyToEmail, setReplyToEmail] = useState("verified@example.com");
  const [timezone, setTimezone] = useState("Asia/Kolkata");

  const [lists, setLists] = useState<ListItem[]>([]);
  const [segments, setSegments] = useState<SegmentItem[]>([]);
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [selectedListIds, setSelectedListIds] = useState<string[]>([]);
  const [excludeListIds, setExcludeListIds] = useState<string[]>([]);
  const [segmentId, setSegmentId] = useState("");
  const [estimatedRecipients, setEstimatedRecipients] = useState(0);
  const [testEmails, setTestEmails] = useState("test@example.com");
  const [scheduleAt, setScheduleAt] = useState("");

  const draftId = new URLSearchParams(window.location.search).get("draft") ?? "";
  const audienceStateKey = draftId ? `campaign-wizard-audience:${draftId}` : "";

  useEffect(() => {
    async function loadStatic() {
      try {
        const [l, s, t] = await Promise.all([
          apiFetch("/api/lists"),
          apiFetch("/api/segments"),
          apiFetch("/api/templates")
        ]);
        setLists(l.lists ?? []);
        setSegments(s.segments ?? []);
        setTemplates(t.templates ?? []);
      } catch (e) {
        setStatus((e as Error).message);
      }
    }
    void loadStatic();
  }, []);

  useEffect(() => {
    if (!draftId) return;
    async function loadCampaign() {
      try {
        const data = await apiFetch(`/api/campaigns/${draftId}`);
        const c = data.campaign as Campaign;
        setCampaign(c);
        setName(c.name);
        setSubject(c.subject);
        setPreviewText(c.previewText ?? "");
        setFromName(c.fromName);
        setFromEmail(c.fromEmail);
        setReplyToEmail(c.replyToEmail ?? "");
        setTimezone(c.timezone ?? "Asia/Kolkata");
      } catch (e) {
        setStatus((e as Error).message);
      }
    }
    void loadCampaign();
  }, [draftId]);

  useEffect(() => {
    if (!audienceStateKey) return;
    const saved = localStorage.getItem(audienceStateKey);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as {
        selectedListIds?: string[];
        excludeListIds?: string[];
        segmentId?: string;
        estimatedRecipients?: number;
      };
      setSelectedListIds(Array.isArray(parsed.selectedListIds) ? parsed.selectedListIds : []);
      setExcludeListIds(Array.isArray(parsed.excludeListIds) ? parsed.excludeListIds : []);
      setSegmentId(parsed.segmentId ?? "");
      setEstimatedRecipients(Number(parsed.estimatedRecipients ?? 0));
    } catch {
      // ignore corrupt local wizard state
    }
  }, [audienceStateKey]);

  useEffect(() => {
    if (!audienceStateKey) return;
    localStorage.setItem(
      audienceStateKey,
      JSON.stringify({ selectedListIds, excludeListIds, segmentId, estimatedRecipients })
    );
  }, [audienceStateKey, selectedListIds, excludeListIds, segmentId, estimatedRecipients]);

  async function ensureDraft(event?: FormEvent) {
    if (event) event.preventDefault();
    if (!canWrite) return;
    try {
      if (!draftId) {
        const data = await apiFetch("/api/campaigns", {
          method: "POST",
          body: JSON.stringify({
            name,
            subject,
            previewText,
            fromName,
            fromEmail,
            replyToEmail: replyToEmail || null,
            timezone
          })
        });
        const id = data.campaign.id as string;
        props.onNavigate(`/campaigns/new/recipients?draft=${id}`);
        return;
      }

      await apiFetch(`/api/campaigns/${draftId}`, {
        method: "PUT",
        body: JSON.stringify({
          name,
          subject,
          previewText,
          fromName,
          fromEmail,
          replyToEmail: replyToEmail || null,
          timezone
        })
      });
      props.onNavigate(`/campaigns/new/recipients?draft=${draftId}`);
    } catch (e) {
      setStatus((e as Error).message);
    }
  }

  function toggle(values: string[], setValues: (next: string[]) => void, id: string) {
    setValues(values.includes(id) ? values.filter((v) => v !== id) : [...values, id]);
  }

  async function estimateRecipients() {
    if (!draftId) return;
    try {
      const data = await apiFetch(`/api/campaigns/${draftId}/estimate`, {
        method: "POST",
        body: JSON.stringify({
          listIds: selectedListIds,
          excludeListIds,
          segmentId: segmentId || null
        })
      });
      setEstimatedRecipients(data.recipientCount ?? 0);
    } catch (e) {
      setStatus((e as Error).message);
    }
  }

  function goBackFromStep() {
    if (props.step === "recipients") props.onNavigate(`/campaigns/new/details?draft=${draftId}`);
    if (props.step === "design") props.onNavigate(`/campaigns/new/recipients?draft=${draftId}`);
    if (props.step === "review") props.onNavigate(`/campaigns/new/design?draft=${draftId}`);
  }

  async function saveDesign(templateId: string) {
    if (!draftId) return;
    try {
      await apiFetch(`/api/campaigns/${draftId}`, {
        method: "PUT",
        body: JSON.stringify({ templateId })
      });
      props.onNavigate(`/campaigns/new/review?draft=${draftId}`);
    } catch (e) {
      setStatus((e as Error).message);
    }
  }

  async function sendTest() {
    if (!draftId) return;
    try {
      const emails = testEmails.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 5);
      const data = await apiFetch(`/api/campaigns/${draftId}/test`, {
        method: "POST",
        body: JSON.stringify({ emails })
      });
      setStatus(data.message ?? "Test send queued");
    } catch (e) {
      setStatus((e as Error).message);
    }
  }

  async function sendNow() {
    if (!draftId) return;
    try {
      const data = await apiFetch(`/api/campaigns/${draftId}/send`, {
        method: "POST",
        body: JSON.stringify({
          listIds: selectedListIds,
          excludeListIds,
          segmentId: segmentId || null
        })
      });
      setStatus(data.message ?? "Campaign send queued");
      if (audienceStateKey) localStorage.removeItem(audienceStateKey);
      props.onNavigate("/campaigns");
    } catch (e) {
      setStatus((e as Error).message);
    }
  }

  async function schedule() {
    if (!draftId || !scheduleAt) return;
    try {
      const data = await apiFetch(`/api/campaigns/${draftId}/schedule`, {
        method: "POST",
        body: JSON.stringify({
          sendAt: new Date(scheduleAt).toISOString(),
          timezone,
          listIds: selectedListIds,
          excludeListIds,
          segmentId: segmentId || null
        })
      });
      setStatus(data.message ?? "Campaign scheduled");
      if (audienceStateKey) localStorage.removeItem(audienceStateKey);
      props.onNavigate("/campaigns");
    } catch (e) {
      setStatus((e as Error).message);
    }
  }

  return (
    <section className="panel" style={{ display: "grid", gap: 12 }}>
      <h2>New Campaign - {props.step.toUpperCase()}</h2>
      {status ? <p className="success">{status}</p> : null}

      {props.step === "details" ? (
        <form className="panel form-panel" onSubmit={ensureDraft}>
          <label>Name<input value={name} onChange={(e) => setName(e.target.value)} disabled={!canWrite} /></label>
          <label>Subject<input value={subject} onChange={(e) => setSubject(e.target.value)} disabled={!canWrite} /></label>
          <label>Preview Text<input value={previewText} onChange={(e) => setPreviewText(e.target.value)} disabled={!canWrite} /></label>
          <label>Sender Name<input value={fromName} onChange={(e) => setFromName(e.target.value)} disabled={!canWrite} /></label>
          <label>Sender Email<input value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} disabled={!canWrite} /></label>
          <label>Reply-To Email<input value={replyToEmail} onChange={(e) => setReplyToEmail(e.target.value)} disabled={!canWrite} /></label>
          <button className="primary-button" disabled={!canWrite}>Save & Next</button>
        </form>
      ) : null}

      {props.step === "recipients" ? (
        <section className="panel form-panel">
          <h3>Select Recipients</h3>
          <p><strong>Include Lists</strong></p>
          {lists.map((l) => (
            <label key={l.id} style={{ display: "flex", gap: 8 }}>
              <input type="checkbox" checked={selectedListIds.includes(l.id)} onChange={() => toggle(selectedListIds, setSelectedListIds, l.id)} />
              <span>{l.name} ({l.contactCount})</span>
            </label>
          ))}

          <p><strong>Exclude Lists</strong></p>
          {lists.map((l) => (
            <label key={`ex-${l.id}`} style={{ display: "flex", gap: 8 }}>
              <input type="checkbox" checked={excludeListIds.includes(l.id)} onChange={() => toggle(excludeListIds, setExcludeListIds, l.id)} />
              <span>{l.name}</span>
            </label>
          ))}

          <label>
            Segment
            <select value={segmentId} onChange={(e) => setSegmentId(e.target.value)}>
              <option value="">No Segment</option>
              {segments.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => void estimateRecipients()}>Estimate Recipients</button>
            <button onClick={goBackFromStep}>Back</button>
            <button onClick={() => props.onNavigate(`/campaigns/new/design?draft=${draftId}`)} className="primary-button">Next</button>
          </div>
          <p>Estimated Recipients: <strong>{estimatedRecipients}</strong></p>
        </section>
      ) : null}

      {props.step === "design" ? (
        <section className="panel">
          <h3>Pick Template</h3>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <button onClick={goBackFromStep}>Back</button>
          </div>
          <div className="table">
            <div className="table-head"><span>Name</span><span>Category</span><span>Action</span></div>
            {templates.map((t) => (
              <div key={t.id} className="table-row">
                <span>{t.name}</span>
                <span>{t.category}</span>
                <span style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => void saveDesign(t.id)}>Use This</button>
                  <button onClick={() => props.onNavigate(`/templates/${t.id}/edit`)}>Edit Template</button>
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {props.step === "review" ? (
        <section className="panel form-panel">
          <h3>Review & Send</h3>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={goBackFromStep}>Back</button>
          </div>
          <p><strong>Name:</strong> {campaign?.name ?? name}</p>
          <p><strong>Subject:</strong> {campaign?.subject ?? subject}</p>
          <p><strong>Template:</strong> {campaign?.templateId ?? "-"}</p>
          <p><strong>Recipients (estimated):</strong> {estimatedRecipients}</p>

          <label>
            Test Emails (max 5, comma-separated)
            <input value={testEmails} onChange={(e) => setTestEmails(e.target.value)} />
          </label>
          <button onClick={() => void sendTest()}>Send Test</button>

          <div style={{ borderTop: "1px solid #d8dee9", paddingTop: 8 }}>
            <button className="primary-button" onClick={() => void sendNow()}>Send Now</button>
          </div>

          <div style={{ borderTop: "1px solid #d8dee9", paddingTop: 8 }}>
            <label>
              Schedule At
              <input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} />
            </label>
            <label>
              Timezone
              <input value={timezone} onChange={(e) => setTimezone(e.target.value)} />
            </label>
            <button onClick={() => void schedule()}>Schedule</button>
          </div>
        </section>
      ) : null}
    </section>
  );
}
