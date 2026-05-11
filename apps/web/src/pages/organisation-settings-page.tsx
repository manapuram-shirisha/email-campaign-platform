import React, { FormEvent, useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

type Organisation = {
  id: string;
  name: string;
  logoUrl: string | null;
  fromEmail: string | null;
  sesConfigSet: string | null;
  awsRegion: string;
};

export function OrganisationSettingsPage() {
  const [org, setOrg] = useState<Organisation | null>(null);
  const [name, setName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [sesConfigSet, setSesConfigSet] = useState("");
  const [awsRegion, setAwsRegion] = useState("ap-south-1");
  const [status, setStatus] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const data = await apiFetch("/api/settings/org");
        const item = data.organisation as Organisation;
        setOrg(item);
        setName(item.name);
        setLogoUrl(item.logoUrl ?? "");
        setFromEmail(item.fromEmail ?? "");
        setSesConfigSet(item.sesConfigSet ?? "");
        setAwsRegion(item.awsRegion ?? "ap-south-1");
      } catch (error) {
        setStatus((error as Error).message);
      }
    }
    void load();
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    try {
      const data = await apiFetch("/api/settings/org", {
        method: "PUT",
        body: JSON.stringify({
          name,
          logoUrl: logoUrl || null,
          fromEmail: fromEmail || null,
          sesConfigSet: sesConfigSet || null,
          awsRegion
        })
      });
      setOrg(data.organisation as Organisation);
      setStatus("Organisation settings updated");
    } catch (error) {
      setStatus((error as Error).message);
    }
  }

  return (
    <section className="panel form-panel" style={{ display: "grid", gap: 12 }}>
      <h2>Organisation Settings</h2>
      {status ? <p className="success">{status}</p> : null}
      {!org ? <p className="muted">Loading organisation...</p> : null}
      <form onSubmit={save} style={{ display: "grid", gap: 10 }}>
        <label>Name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>Logo URL<input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} /></label>
        <label>Default From Email<input value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} /></label>
        <label>SES Configuration Set<input value={sesConfigSet} onChange={(e) => setSesConfigSet(e.target.value)} /></label>
        <label>AWS Region<input value={awsRegion} onChange={(e) => setAwsRegion(e.target.value)} /></label>
        <button className="primary-button">Save Settings</button>
      </form>
    </section>
  );
}
