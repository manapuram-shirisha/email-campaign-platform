// apps/web/src/pages/campaign-editor-page.tsx
import React, { FormEvent, useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

type Role = "SUPER_ADMIN" | "CAMPAIGN_MANAGER" | "VIEWER";

type Template = {
  id: string;
  name: string;
  category: string;
};

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
  status: "DRAFT" | "SCHEDULED" | "SENDING" | "SENT" | "PAUSED" | "CANCELLED";
  scheduledAt: string | null;
  updatedAt: string;
};

export function CampaignEditorPage(props: {
  role: Role;
  campaignId: string | null;
  onBack: () => void;
}) {
  const canWrite = props.role === "SUPER_ADMIN" || props.role === "CAMPAIGN_MANAGER";

  const [templates, setTemplates] = useState<Template[]>([]);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [statusMessage, setStatusMessage] = useState("");

  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [previewText, setPreviewText] = useState("");
  const [fromName, setFromName] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [replyToEmail, setReplyToEmail] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [timezone, setTimezone] = useState("Asia/Kolkata");

  useEffect(() => {
    if (!props.campaignId) return;

    async function loadEditorData() {
      try {
        const [campaignData, templatesData] = await Promise.all([
          apiFetch(`/api/campaigns/${props.campaignId}`),
          apiFetch("/api/templates")
        ]);

        const c = campaignData.campaign as Campaign;
        setCampaign(c);

        setName(c.name);
        setSubject(c.subject);
        setPreviewText(c.previewText ?? "");
        setFromName(c.fromName);
        setFromEmail(c.fromEmail);
        setReplyToEmail(c.replyToEmail ?? "");
        setTemplateId(c.templateId ?? "");
        setTimezone(c.timezone ?? "Asia/Kolkata");

        setTemplates(templatesData.templates ?? []);
      } catch (error) {
        setStatusMessage((error as Error).message);
      }
    }

    void loadEditorData();
  }, [props.campaignId]);

  async function saveCampaign(event: FormEvent) {
    event.preventDefault();
    if (!canWrite || !campaign) return;

    try {
      const data = await apiFetch(`/api/campaigns/${campaign.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name,
          subject,
          previewText,
          fromName,
          fromEmail,
          replyToEmail: replyToEmail || null,
          templateId: templateId || null,
          timezone
        })
      });

      setCampaign(data.campaign as Campaign);
      setStatusMessage("Campaign updated");
    } catch (error) {
      setStatusMessage((error as Error).message);
    }
  }

  if (!props.campaignId) {
    return (
      <section className="panel">
        <h2>Campaign Editor</h2>
        <p className="muted">No campaign selected.</p>
        <button onClick={props.onBack}>Back to Campaigns</button>
      </section>
    );
  }

  if (!campaign) {
    return (
      <section className="panel">
        <h2>Campaign Editor</h2>
        <p className="muted">Loading campaign...</p>
      </section>
    );
  }

  return (
    <section className="panel form-panel" style={{ display: "grid", gap: 12 }}>
      <div className="panel-header">
        <h2>Campaign Editor</h2>
        <button onClick={props.onBack}>Back</button>
      </div>

      {!canWrite ? <p className="muted">Viewer mode: read-only access enabled.</p> : null}
      {statusMessage ? <p className="success">{statusMessage}</p> : null}

      <form onSubmit={saveCampaign} style={{ display: "grid", gap: 10 }}>
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} disabled={!canWrite} />
        </label>

        <label>
          Subject
          <input value={subject} onChange={(e) => setSubject(e.target.value)} disabled={!canWrite} />
        </label>

        <label>
          Preview Text
          <input value={previewText} onChange={(e) => setPreviewText(e.target.value)} disabled={!canWrite} />
        </label>

        <label>
          From Name
          <input value={fromName} onChange={(e) => setFromName(e.target.value)} disabled={!canWrite} />
        </label>

        <label>
          From Email
          <input value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} disabled={!canWrite} />
        </label>

        <label>
          Reply-To Email
          <input value={replyToEmail} onChange={(e) => setReplyToEmail(e.target.value)} disabled={!canWrite} />
        </label>

        <label>
          Template
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} disabled={!canWrite}>
            <option value="">Select Template</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name} ({template.category})
              </option>
            ))}
          </select>
        </label>

        <label>
          Timezone
          <input value={timezone} onChange={(e) => setTimezone(e.target.value)} disabled={!canWrite} />
        </label>

        <button className="primary-button" disabled={!canWrite}>
          Save Campaign
        </button>
      </form>

      <div className="panel" style={{ marginTop: 8 }}>
        <h3>Campaign Meta</h3>
        <p>Status: {campaign.status}</p>
        <p>Scheduled At: {campaign.scheduledAt ? new Date(campaign.scheduledAt).toLocaleString() : "-"}</p>
        <p>Last Updated: {new Date(campaign.updatedAt).toLocaleString()}</p>
      </div>
    </section>
  );
}
