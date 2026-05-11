import React, { FormEvent, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";

type Role = "SUPER_ADMIN" | "CAMPAIGN_MANAGER" | "VIEWER";
type CampaignStatus = "DRAFT" | "SCHEDULED" | "SENDING" | "SENT" | "PAUSED" | "CANCELLED";

type Campaign = {
  id: string;
  name: string;
  subject: string;
  previewText: string | null;
  fromName: string;
  fromEmail: string;
  replyToEmail: string | null;
  templateId: string | null;
  status: CampaignStatus;
  timezone: string | null;
  tags?: string[];
  scheduledAt: string | null;
  updatedAt: string;
};

type Template = {
  id: string;
  name: string;
  category: string;
};

type ContactList = {
  id: string;
  name: string;
};

export function CampaignsPage(props: {
  role: Role;
  onOpenEditor: (campaignId: string) => void;
  onOpenReport: (campaignId: string) => void;
  onCreateNew: () => void;
}) {
  const canWrite = props.role === "SUPER_ADMIN" || props.role === "CAMPAIGN_MANAGER";

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [lists, setLists] = useState<ContactList[]>([]);

  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  const [name, setName] = useState("New Campaign");
  const [subject, setSubject] = useState("Welcome to our newsletter");
  const [previewText, setPreviewText] = useState("Quick update for you");
  const [fromName, setFromName] = useState("EmailOps Team");
  const [fromEmail, setFromEmail] = useState("verified@example.com");
  const [replyToEmail, setReplyToEmail] = useState("verified@example.com");
  const [templateId, setTemplateId] = useState("");
  const [selectedListIds, setSelectedListIds] = useState<string[]>([]);
  const [segmentId, setSegmentId] = useState("");
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [tags, setTags] = useState("newsletter");
  const [scheduleAt, setScheduleAt] = useState("");
  const [testEmails, setTestEmails] = useState("test@example.com");
  const [progressMap, setProgressMap] = useState<Record<string, { total: number; sent: number; percent: number }>>({});

  const filteredCampaigns = useMemo(() => {
    return campaigns.filter((c) => {
      const matchSearch = search.trim()
        ? c.name.toLowerCase().includes(search.trim().toLowerCase()) ||
          c.subject.toLowerCase().includes(search.trim().toLowerCase())
        : true;
      const matchStatus = statusFilter ? c.status === statusFilter : true;
      return matchSearch && matchStatus;
    });
  }, [campaigns, search, statusFilter]);

  async function loadCampaigns() {
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (statusFilter) params.set("status", statusFilter);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (tagFilter.trim()) params.set("tag", tagFilter.trim());

      const data = await apiFetch(`/api/campaigns?${params.toString()}`);
      setCampaigns(data.campaigns ?? []);
    } catch (error) {
      setStatusMessage((error as Error).message);
    }
  }

  async function loadTemplatesAndLists() {
    try {
      const [tplData, listData] = await Promise.all([apiFetch("/api/templates"), apiFetch("/api/lists")]);
      setTemplates(tplData.templates ?? []);
      setLists(listData.lists ?? []);
    } catch (error) {
      setStatusMessage((error as Error).message);
    }
  }

  useEffect(() => {
    void loadCampaigns();
  }, [search, statusFilter, dateFrom, dateTo, tagFilter]);

  useEffect(() => {
    void loadTemplatesAndLists();
  }, []);

  useEffect(() => {
    const trackable = campaigns.filter((c) => c.status === "SENDING" || c.status === "PAUSED");
    if (trackable.length === 0) return;

    let active = true;
    const loadProgress = async () => {
      const entries = await Promise.all(
        trackable.map(async (campaign) => {
          try {
            const data = await apiFetch(`/api/campaigns/${campaign.id}/progress`);
            return [campaign.id, { total: data.total ?? 0, sent: data.sent ?? 0, percent: data.percent ?? 0 }] as const;
          } catch {
            return [campaign.id, { total: 0, sent: 0, percent: 0 }] as const;
          }
        })
      );

      if (!active) return;
      setProgressMap((prev) => {
        const next = { ...prev };
        for (const [id, progress] of entries) next[id] = progress;
        return next;
      });
    };

    void loadProgress();
    const timer = setInterval(() => {
      void loadProgress();
    }, 5000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [campaigns]);

  function toggleList(listId: string) {
    setSelectedListIds((prev) => (prev.includes(listId) ? prev.filter((id) => id !== listId) : [...prev, listId]));
  }

  async function createCampaign(event: FormEvent) {
    event.preventDefault();
    if (!canWrite) return;

    try {
      const data = await apiFetch("/api/campaigns", {
        method: "POST",
        body: JSON.stringify({
          name,
          subject,
          previewText,
          fromName,
          fromEmail,
          replyToEmail: replyToEmail || null,
          templateId: templateId || null,
          timezone,
          tags: tags.split(",").map((t) => t.trim()).filter(Boolean)
        })
      });

      setStatusMessage(`Campaign created: ${data.campaign.name}`);
      await loadCampaigns();
    } catch (error) {
      setStatusMessage((error as Error).message);
    }
  }

  async function sendNow(id: string) {
    if (!canWrite) return;
    try {
      const data = await apiFetch(`/api/campaigns/${id}/send-now`, {
        method: "POST",
        body: JSON.stringify({
          listIds: selectedListIds,
          excludeListIds: [],
          segmentId: segmentId || null
        })
      });
      setStatusMessage(data.message ?? "Campaign moved to sending");
      await loadCampaigns();
    } catch (error) {
      setStatusMessage((error as Error).message);
    }
  }

  async function duplicateCampaign(id: string) {
    if (!canWrite) return;
    try {
      await apiFetch(`/api/campaigns/${id}/duplicate`, { method: "POST" });
      setStatusMessage("Campaign duplicated");
      await loadCampaigns();
    } catch (error) {
      setStatusMessage((error as Error).message);
    }
  }

  async function deleteCampaign(id: string) {
    if (!canWrite) return;
    try {
      await apiFetch(`/api/campaigns/${id}`, { method: "DELETE" });
      setStatusMessage("Campaign deleted");
      await loadCampaigns();
    } catch (error) {
      setStatusMessage((error as Error).message);
    }
  }

  async function pauseCampaign(id: string) {
    if (!canWrite) return;
    try {
      const data = await apiFetch(`/api/campaigns/${id}/pause`, { method: "POST" });
      setStatusMessage(data.message ?? "Campaign paused");
      await loadCampaigns();
    } catch (error) {
      setStatusMessage((error as Error).message);
    }
  }

  async function resumeCampaign(id: string) {
    if (!canWrite) return;
    try {
      const data = await apiFetch(`/api/campaigns/${id}/resume`, { method: "POST" });
      setStatusMessage(data.message ?? "Campaign resumed");
      await loadCampaigns();
    } catch (error) {
      setStatusMessage((error as Error).message);
    }
  }

  async function cancelCampaign(id: string) {
    if (!canWrite) return;
    try {
      const data = await apiFetch(`/api/campaigns/${id}/cancel`, { method: "POST" });
      setStatusMessage(data.message ?? "Campaign cancelled");
      await loadCampaigns();
    } catch (error) {
      setStatusMessage((error as Error).message);
    }
  }

  async function testCampaign(id: string) {
    if (!canWrite) return;
    try {
      const emails = testEmails
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean)
        .slice(0, 5);
      const data = await apiFetch(`/api/campaigns/${id}/test`, {
        method: "POST",
        body: JSON.stringify({ emails })
      });
      setStatusMessage(data.message ?? "Test send queued");
    } catch (error) {
      setStatusMessage((error as Error).message);
    }
  }

  async function scheduleCampaign(id: string) {
    if (!canWrite) return;
    if (!scheduleAt) {
      setStatusMessage("Pick schedule datetime first");
      return;
    }

    try {
      const iso = new Date(scheduleAt).toISOString();

      const data = await apiFetch(`/api/campaigns/${id}/schedule`, {
        method: "POST",
        body: JSON.stringify({
          sendAt: iso,
          timezone,
          listIds: selectedListIds,
          excludeListIds: [],
          segmentId: segmentId || null
        })
      });

      setStatusMessage(data.message ?? "Campaign scheduled");
      await loadCampaigns();
    } catch (error) {
      setStatusMessage((error as Error).message);
    }
  }

  return (
    <div className="panel" style={{ display: "grid", gap: 16 }}>
      <h2>Campaigns</h2>
      {canWrite ? <button className="primary-button" onClick={props.onCreateNew}>New Campaign Wizard</button> : null}
      {!canWrite ? <p className="muted">Viewer mode: read-only access enabled.</p> : null}
      {statusMessage ? <p className="success">{statusMessage}</p> : null}

      <section className="panel form-panel">
        <h3>Search & Filter</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input placeholder="Search campaign or subject" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All Status</option>
            <option value="DRAFT">DRAFT</option>
            <option value="SCHEDULED">SCHEDULED</option>
            <option value="SENDING">SENDING</option>
            <option value="SENT">SENT</option>
            <option value="PAUSED">PAUSED</option>
            <option value="CANCELLED">CANCELLED</option>
          </select>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          <input placeholder="Tag filter" value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} />
          <button onClick={() => void loadCampaigns()}>Refresh</button>
        </div>
      </section>

      <section className="panel form-panel">
        <h3>Create Campaign</h3>
        <form onSubmit={createCampaign} style={{ display: "grid", gap: 10 }}>
          <label>Name<input value={name} onChange={(e) => setName(e.target.value)} disabled={!canWrite} /></label>
          <label>Subject<input value={subject} onChange={(e) => setSubject(e.target.value)} disabled={!canWrite} /></label>
          <label>Preview Text<input value={previewText} onChange={(e) => setPreviewText(e.target.value)} disabled={!canWrite} /></label>
          <label>From Name<input value={fromName} onChange={(e) => setFromName(e.target.value)} disabled={!canWrite} /></label>
          <label>From Email<input value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} disabled={!canWrite} /></label>
          <label>Reply-To Email<input value={replyToEmail} onChange={(e) => setReplyToEmail(e.target.value)} disabled={!canWrite} /></label>

          <label>
            Template
            <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} disabled={!canWrite}>
              <option value="">Select Template</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.category})
                </option>
              ))}
            </select>
          </label>

          <label>Audience Lists (UI only for now)</label>
          <div style={{ display: "grid", gap: 6 }}>
            {lists.map((list) => (
              <label key={list.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={selectedListIds.includes(list.id)}
                  onChange={() => toggleList(list.id)}
                  disabled={!canWrite}
                />
                <span>{list.name}</span>
              </label>
            ))}
            {lists.length === 0 ? <small className="muted">No lists found</small> : null}
          </div>

          <label>Segment ID (UI only for now)<input value={segmentId} onChange={(e) => setSegmentId(e.target.value)} disabled={!canWrite} /></label>
          <label>Timezone<input value={timezone} onChange={(e) => setTimezone(e.target.value)} disabled={!canWrite} /></label>
          <label>Tags (comma-separated)<input value={tags} onChange={(e) => setTags(e.target.value)} disabled={!canWrite} /></label>

          <button className="primary-button" disabled={!canWrite}>Create Campaign</button>
        </form>
      </section>

      <section className="panel">
        <h3>Campaign List ({filteredCampaigns.length})</h3>
        <label style={{ display: "grid", gap: 6, marginBottom: 10 }}>
          Test Emails (max 5, comma-separated)
          <input
            value={testEmails}
            onChange={(e) => setTestEmails(e.target.value)}
            disabled={!canWrite}
          />
        </label>
        <label style={{ display: "grid", gap: 6, marginBottom: 10 }}>
          Schedule Datetime (used by Schedule button)
          <input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} disabled={!canWrite} />
        </label>

        <div className="table">
          <div className="table-head">
            <span>Name</span>
            <span>Status</span>
            <span>Template</span>
            <span>Updated</span>
            <span>Actions</span>
          </div>

          {filteredCampaigns.map((campaign) => (
            <div className="table-row" key={campaign.id}>
              <span>{campaign.name}</span>
              <span>
                {campaign.status}
                {(campaign.status === "SENDING" || campaign.status === "PAUSED") && progressMap[campaign.id] ? (
                  <small style={{ display: "block" }}>
                    {progressMap[campaign.id].sent} / {progressMap[campaign.id].total} ({progressMap[campaign.id].percent}%)
                  </small>
                ) : null}
              </span>
              <span>{campaign.templateId ?? "-"}</span>
              <span>{new Date(campaign.updatedAt).toLocaleString()}</span>
              <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={() => props.onOpenEditor(campaign.id)} disabled={!canWrite || campaign.status !== "DRAFT"}>Edit</button>
                <button onClick={() => props.onOpenReport(campaign.id)}>View Report</button>
                <button onClick={() => void duplicateCampaign(campaign.id)} disabled={!canWrite}>Duplicate</button>
                <button onClick={() => void testCampaign(campaign.id)} disabled={!canWrite}>Test</button>
                <button onClick={() => void sendNow(campaign.id)} disabled={!canWrite}>Send Now</button>
                <button onClick={() => void scheduleCampaign(campaign.id)} disabled={!canWrite}>Schedule</button>
                {campaign.status === "SENDING" ? (
                  <button onClick={() => void pauseCampaign(campaign.id)} disabled={!canWrite}>Pause</button>
                ) : null}
                {campaign.status === "PAUSED" ? (
                  <button onClick={() => void resumeCampaign(campaign.id)} disabled={!canWrite}>Resume</button>
                ) : null}
                {campaign.status === "SCHEDULED" ? (
                  <button onClick={() => void cancelCampaign(campaign.id)} disabled={!canWrite}>Cancel</button>
                ) : null}
                {campaign.status === "DRAFT" ? (
                  <button onClick={() => void deleteCampaign(campaign.id)} disabled={!canWrite}>Delete</button>
                ) : null}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
