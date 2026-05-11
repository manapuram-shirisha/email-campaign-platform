import React, { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

type DashboardData = {
  cards: {
    totalContacts: number;
    emailsSent: number;
    avgOpenRate: number;
    avgClickRate: number;
    bounceRate: number;
    complaintRate: number;
    unsubscribeRate: number;
  };
  topCampaigns: Array<{
    id: string;
    name: string;
    openRate: number;
    clickRate: number;
    delivered: number;
  }>;
  recentActivity: Array<{
    id: string;
    eventType: string;
    occurredAt: string;
  }>;
};

export function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const result = await apiFetch("/api/analytics/dashboard");
        setData(result);
      } catch (error) {
        setStatus((error as Error).message);
      }
    }
    void load();
  }, []);

  return (
    <section className="panel" style={{ display: "grid", gap: 12 }}>
      <h2>Dashboard</h2>
      {status ? <p className="success">{status}</p> : null}
      {!data ? <p className="muted">Loading analytics...</p> : null}

      {data ? (
        <>
          <div className="metric-grid">
            <article className="metric-card"><span>Total Contacts</span><strong>{data.cards.totalContacts}</strong></article>
            <article className="metric-card"><span>Emails Sent</span><strong>{data.cards.emailsSent}</strong></article>
            <article className="metric-card"><span>Avg Open Rate</span><strong>{data.cards.avgOpenRate}%</strong></article>
            <article className="metric-card"><span>Avg Click Rate</span><strong>{data.cards.avgClickRate}%</strong></article>
            <article className="metric-card"><span>Bounce Rate</span><strong>{data.cards.bounceRate}%</strong></article>
            <article className="metric-card"><span>Complaint Rate</span><strong>{data.cards.complaintRate}%</strong></article>
            <article className="metric-card"><span>Unsubscribe Rate</span><strong>{data.cards.unsubscribeRate}%</strong></article>
          </div>

          <section className="panel">
            <h3>Top 5 Campaigns (By Open Rate)</h3>
            <div className="table">
              <div className="table-head"><span>Name</span><span>Open Rate</span><span>Click Rate</span><span>Delivered</span></div>
              {data.topCampaigns.map((campaign) => (
                <div key={campaign.id} className="table-row">
                  <span>{campaign.name}</span>
                  <span>{campaign.openRate}%</span>
                  <span>{campaign.clickRate}%</span>
                  <span>{campaign.delivered}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="panel">
            <h3>Recent Activity</h3>
            {data.recentActivity.map((event) => (
              <div key={event.id} className="activity-row">
                {event.eventType} - {new Date(event.occurredAt).toLocaleString()}
              </div>
            ))}
          </section>
        </>
      ) : null}
    </section>
  );
}
