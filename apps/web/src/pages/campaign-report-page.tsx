import React, { useEffect, useState } from "react";
import { API_BASE, apiFetch } from "../lib/api";

type Report = {
  summary: {
    sent: number;
    delivered: number;
    uniqueOpens: number;
    totalOpens: number;
    uniqueClicks: number;
    totalClicks: number;
    bounces: number;
    complaints: number;
    unsubscribes: number;
  };
  links: Array<{ url: string; count: number }>;
  devices: { desktop: number; mobile: number; tablet: number };
  timeSeries: Array<{ time: string; opens: number; clicks: number }>;
  perContact: Array<{
    contactId: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    status: string;
    sentAt: string | null;
  }>;
};

export function CampaignReportPage(props: { campaignId: string | null; onBack: () => void }) {
  const [report, setReport] = useState<Report | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!props.campaignId) return;

    async function load() {
      try {
        const data = await apiFetch(`/api/campaigns/${props.campaignId}/report`);
        setReport(data);
      } catch (error) {
        setStatus((error as Error).message);
      }
    }

    void load();
  }, [props.campaignId]);

  if (!props.campaignId) {
    return (
      <section className="panel">
        <h2>Campaign Report</h2>
        <p className="muted">No campaign selected.</p>
        <button onClick={props.onBack}>Back</button>
      </section>
    );
  }

  const openRate = report && report.summary.delivered > 0
    ? ((report.summary.uniqueOpens / report.summary.delivered) * 100).toFixed(2)
    : "0.00";
  const clickRate = report && report.summary.delivered > 0
    ? ((report.summary.uniqueClicks / report.summary.delivered) * 100).toFixed(2)
    : "0.00";
  const bounceRate = report && report.summary.sent > 0
    ? ((report.summary.bounces / report.summary.sent) * 100).toFixed(2)
    : "0.00";
  const unsubscribeRate = report && report.summary.delivered > 0
    ? ((report.summary.unsubscribes / report.summary.delivered) * 100).toFixed(2)
    : "0.00";

  async function exportCsv() {
    if (!props.campaignId) return;
    const raw = localStorage.getItem("auth");
    const token = raw ? (JSON.parse(raw) as { accessToken?: string }).accessToken : "";
    const response = await fetch(`${API_BASE}/api/campaigns/${props.campaignId}/report.csv`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    if (!response.ok) {
      setStatus("Failed to export CSV");
      return;
    }
    const csv = await response.text();
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `campaign-${props.campaignId}-report.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="panel" style={{ display: "grid", gap: 12 }}>
      <div className="panel-header">
        <h2>Campaign Report</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => void exportCsv()}>Export CSV</button>
          <button onClick={props.onBack}>Back</button>
        </div>
      </div>
      {status ? <p className="success">{status}</p> : null}
      {!report ? <p className="muted">Loading report...</p> : null}

      {report ? (
        <>
          <section className="panel">
            <h3>Summary</h3>
            <div className="table">
              <div className="table-row"><span>Sent</span><span>{report.summary.sent}</span></div>
              <div className="table-row"><span>Delivered</span><span>{report.summary.delivered}</span></div>
              <div className="table-row"><span>Unique Opens</span><span>{report.summary.uniqueOpens}</span></div>
              <div className="table-row"><span>Total Opens</span><span>{report.summary.totalOpens}</span></div>
              <div className="table-row"><span>Unique Clicks</span><span>{report.summary.uniqueClicks}</span></div>
              <div className="table-row"><span>Total Clicks</span><span>{report.summary.totalClicks}</span></div>
              <div className="table-row"><span>Bounces</span><span>{report.summary.bounces}</span></div>
              <div className="table-row"><span>Complaints</span><span>{report.summary.complaints}</span></div>
              <div className="table-row"><span>Unsubscribes</span><span>{report.summary.unsubscribes}</span></div>
              <div className="table-row"><span>Open Rate</span><span>{openRate}%</span></div>
              <div className="table-row"><span>Click Rate</span><span>{clickRate}%</span></div>
              <div className="table-row"><span>Bounce Rate</span><span>{bounceRate}%</span></div>
              <div className="table-row"><span>Unsubscribe Rate</span><span>{unsubscribeRate}%</span></div>
            </div>
          </section>

          <section className="panel">
            <h3>Link Clicks</h3>
            <div className="table">
              <div className="table-head"><span>URL</span><span>Clicks</span></div>
              {report.links.map((link) => (
                <div className="table-row" key={link.url}>
                  <span>{link.url}</span>
                  <span>{link.count}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="panel">
            <h3>Open/Click Timeline</h3>
            <div className="table">
              <div className="table-head"><span>Time (Hour)</span><span>Opens</span><span>Clicks</span></div>
              {report.timeSeries.map((point) => (
                <div className="table-row" key={point.time}>
                  <span>{new Date(point.time).toLocaleString()}</span>
                  <span>{point.opens}</span>
                  <span>{point.clicks}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="panel">
            <h3>Device Breakdown</h3>
            <div className="table">
              <div className="table-row"><span>Desktop</span><span>{report.devices.desktop}</span></div>
              <div className="table-row"><span>Mobile</span><span>{report.devices.mobile}</span></div>
              <div className="table-row"><span>Tablet</span><span>{report.devices.tablet}</span></div>
            </div>
          </section>

          <section className="panel">
            <h3>Per Contact Activity</h3>
            <div className="table">
              <div className="table-head"><span>Email</span><span>Name</span><span>Status</span><span>Sent At</span></div>
              {report.perContact.map((row) => (
                <div className="table-row" key={row.contactId}>
                  <span>{row.email}</span>
                  <span>{`${row.firstName ?? ""} ${row.lastName ?? ""}`.trim() || "-"}</span>
                  <span>{row.status}</span>
                  <span>{row.sentAt ? new Date(row.sentAt).toLocaleString() : "-"}</span>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : null}
    </section>
  );
}
