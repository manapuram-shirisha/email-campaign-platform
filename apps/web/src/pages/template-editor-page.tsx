import React, { ChangeEvent, useEffect, useMemo, useState } from "react";
import { API_BASE, apiFetch } from "../lib/api";

type Role = "SUPER_ADMIN" | "CAMPAIGN_MANAGER" | "VIEWER";

type Template = {
  id: string;
  name: string;
  category: string;
  html: string;
  blocks: Array<Record<string, unknown>>;
  thumbnailUrl: string | null;
};

type BlockType =
  | "header"
  | "text"
  | "image"
  | "button"
  | "divider"
  | "spacer"
  | "two_column"
  | "three_column"
  | "social"
  | "footer"
  | "html";

const SAMPLE_DATA: Record<string, string> = {
  first_name: "Aisha",
  last_name: "Rao",
  email: "aisha@example.com",
  unsubscribe_link: `${API_BASE}/unsubscribe?uid=sample`,
  "custom.company": "Acme",
  "custom.city": "Chennai"
};

const MERGE_TAG_OPTIONS = [
  "{{first_name}}",
  "{{last_name}}",
  "{{email}}",
  "{{custom.company}}",
  "{{custom.city}}",
  "{{unsubscribe_link}}"
] as const;

function applyMergeTags(input: string) {
  return input.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, key: string) => {
    return SAMPLE_DATA[key] ?? `{{${key}}}`;
  });
}

function makeBlock(type: BlockType): Record<string, unknown> {
  switch (type) {
    case "header":
      return { type, text: "Header title", bg: "#f5f7fb", color: "#172033" };
    case "text":
      return { type, text: "Paragraph text", align: "left", color: "#222836", size: 15 };
    case "image":
      return { type, src: "https://via.placeholder.com/600x240", alt: "Image", href: "", width: 100 };
    case "button":
      return {
        type,
        label: "Click Here",
        url: "https://example.com",
        bg: "#1f5eff",
        color: "#ffffff",
        radius: 6,
        padY: 12,
        padX: 18
      };
    case "divider":
      return { type, color: "#d8dee9", style: "solid" };
    case "spacer":
      return { type, height: 24 };
    case "two_column":
      return { type, left: "<p>Left column</p>", right: "<p>Right column</p>" };
    case "three_column":
      return { type, c1: "<p>Col 1</p>", c2: "<p>Col 2</p>", c3: "<p>Col 3</p>" };
    case "social":
      return {
        type,
        linkedin: "https://linkedin.com",
        twitter: "https://x.com",
        facebook: "https://facebook.com",
        instagram: "https://instagram.com",
        youtube: "https://youtube.com"
      };
    case "footer":
      return { type, text: "Company Address | {{unsubscribe_link}}" };
    case "html":
      return { type, html: "<div>Custom HTML block</div>" };
    default:
      return { type: "text", text: "" };
  }
}

function socialLink(label: string, href: string) {
  return `<a href="${href}" style="margin-right:8px;color:#1f5eff;text-decoration:none;">${label}</a>`;
}

function renderBlockHtml(block: Record<string, unknown>) {
  const type = String(block.type ?? "");

  if (type === "header") {
    return `<div style="background:${String(block.bg ?? "#f5f7fb")};padding:14px;border-radius:6px;margin:0 0 12px;"><h1 style="color:${String(block.color ?? "#172033")};margin:0;">${String(block.text ?? "")}</h1></div>`;
  }
  if (type === "text") {
    return `<p style="margin:0 0 12px;text-align:${String(block.align ?? "left")};color:${String(block.color ?? "#222836")};font-size:${Number(block.size ?? 15)}px;">${String(block.text ?? "")}</p>`;
  }
  if (type === "image") {
    const img = `<img src="${String(block.src ?? "")}" alt="${String(block.alt ?? "")}" style="max-width:${Number(block.width ?? 100)}%;height:auto;border-radius:4px;" />`;
    const href = String(block.href ?? "");
    return href ? `<a href="${href}">${img}</a>` : img;
  }
  if (type === "button") {
    return `<a href="${String(block.url ?? "#")}" style="display:inline-block;background:${String(block.bg ?? "#1f5eff")};color:${String(block.color ?? "#fff")};padding:${Number(block.padY ?? 12)}px ${Number(block.padX ?? 18)}px;text-decoration:none;border-radius:${Number(block.radius ?? 6)}px;">${String(block.label ?? "Button")}</a>`;
  }
  if (type === "divider") {
    return `<hr style="border:none;border-top:1px ${String(block.style ?? "solid")} ${String(block.color ?? "#d8dee9")};margin:14px 0;" />`;
  }
  if (type === "spacer") {
    return `<div style="height:${Number(block.height ?? 24)}px;"></div>`;
  }
  if (type === "two_column") {
    return `<table role="presentation" width="100%" style="margin:0 0 12px;"><tr><td width="50%" style="vertical-align:top;padding-right:8px;">${String(block.left ?? "")}</td><td width="50%" style="vertical-align:top;padding-left:8px;">${String(block.right ?? "")}</td></tr></table>`;
  }
  if (type === "three_column") {
    return `<table role="presentation" width="100%" style="margin:0 0 12px;"><tr><td width="33%" style="vertical-align:top;padding-right:6px;">${String(block.c1 ?? "")}</td><td width="33%" style="vertical-align:top;padding:0 3px;">${String(block.c2 ?? "")}</td><td width="33%" style="vertical-align:top;padding-left:6px;">${String(block.c3 ?? "")}</td></tr></table>`;
  }
  if (type === "social") {
    return `<p style="margin:0 0 12px;">${socialLink("LinkedIn", String(block.linkedin ?? "#"))}${socialLink("X", String(block.twitter ?? "#"))}${socialLink("Facebook", String(block.facebook ?? "#"))}${socialLink("Instagram", String(block.instagram ?? "#"))}${socialLink("YouTube", String(block.youtube ?? "#"))}</p>`;
  }
  if (type === "footer") {
    return `<p style="font-size:12px;color:#687386;margin-top:24px;">${String(block.text ?? "")}</p>`;
  }
  if (type === "html") {
    return String(block.html ?? "");
  }

  return "";
}

function buildHtmlFromBlocks(blocks: Array<Record<string, unknown>>) {
  const inner = blocks.map(renderBlockHtml).join("\n");
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">${inner}</div>`;
}

export function TemplateEditorPage(props: {
  role: Role;
  templateId: string | null;
  onBackToLibrary: () => void;
}) {
  const canWrite = props.role === "SUPER_ADMIN" || props.role === "CAMPAIGN_MANAGER";

  const [template, setTemplate] = useState<Template | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [blocks, setBlocks] = useState<Array<Record<string, unknown>>>([]);
  const [html, setHtml] = useState("");
  const [activeTab, setActiveTab] = useState<"blocks" | "html">("blocks");
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const [status, setStatus] = useState("");
  const [selectedMergeTag, setSelectedMergeTag] = useState("{{first_name}}");

  const mergedPreviewHtml = useMemo(() => {
    const raw = activeTab === "html" ? html : buildHtmlFromBlocks(blocks);
    return applyMergeTags(raw);
  }, [activeTab, blocks, html]);

  useEffect(() => {
    if (!props.templateId) return;

    async function loadTemplate() {
      try {
        const data = await apiFetch(`/api/templates/${props.templateId}`);
        const tpl = data.template as Template;
        setTemplate(tpl);
        setName(tpl.name);
        setCategory(tpl.category);
        setBlocks(Array.isArray(tpl.blocks) ? tpl.blocks : []);
        setHtml(tpl.html ?? "");
      } catch (e) {
        setStatus((e as Error).message);
      }
    }

    void loadTemplate();
  }, [props.templateId]);

  function addBlock(type: BlockType) {
    if (!canWrite) return;
    setBlocks((prev) => [...prev, makeBlock(type)]);
    setActiveTab("blocks");
  }

  function removeBlock(index: number) {
    if (!canWrite) return;
    setBlocks((prev) => prev.filter((_, i) => i !== index));
  }

  function moveBlock(index: number, direction: "up" | "down") {
    if (!canWrite) return;
    setBlocks((prev) => {
      const next = [...prev];
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function updateBlock(index: number, key: string, value: unknown) {
    if (!canWrite) return;
    setBlocks((prev) => prev.map((b, i) => (i === index ? { ...b, [key]: value } : b)));
  }

  function insertMergeTagIntoHtml() {
    if (!canWrite) return;
    setHtml((prev) => `${prev}\n${selectedMergeTag}`);
    setActiveTab("html");
  }

  function insertMergeTagIntoBlock(index: number, key: string) {
    if (!canWrite) return;
    setBlocks((prev) =>
      prev.map((b, i) =>
        i === index ? { ...b, [key]: `${String(b[key] ?? "")}${selectedMergeTag}` } : b
      )
    );
  }

  async function uploadImageToS3(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !canWrite) return;

    try {
      const base64 = await fileToBase64(file);
      const payload = {
        fileName: file.name,
        contentType: file.type || "application/octet-stream",
        dataBase64: base64
      };
      const data = await apiFetch("/api/templates/upload-asset", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      if (activeTab === "html") {
        setHtml((prev) => `${prev}\n<img src="${data.url}" alt="${file.name}" />`);
      } else {
        setBlocks((prev) => [...prev, { type: "image", src: data.url, alt: file.name, width: 100, href: "" }]);
      }

      setStatus("Image uploaded to S3");
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      event.target.value = "";
    }
  }

  async function saveTemplate() {
    if (!canWrite || !template) return;
    try {
      const payload = {
        name,
        category,
        blocks,
        html: activeTab === "html" ? html : buildHtmlFromBlocks(blocks)
      };

      const data = await apiFetch(`/api/templates/${template.id}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });

      setTemplate(data.template);
      setStatus("Template saved");
    } catch (e) {
      setStatus((e as Error).message);
    }
  }

  if (!props.templateId) {
    return (
      <section className="panel">
        <h2>Template Editor</h2>
        <p className="muted">Select a template from library to edit.</p>
        <button onClick={props.onBackToLibrary}>Back to Library</button>
      </section>
    );
  }

  return (
    <div className="panel" style={{ display: "grid", gap: 16 }}>
      <div className="panel-header">
        <h2>Template Editor</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={props.onBackToLibrary}>Back</button>
          <button className="primary-button" onClick={saveTemplate} disabled={!canWrite}>
            Save
          </button>
        </div>
      </div>

      {!canWrite ? <p className="muted">Viewer mode: read-only access enabled.</p> : null}
      {status ? <p className="success">{status}</p> : null}

      <section className="panel form-panel">
        <label>
          Template Name
          <input value={name} onChange={(e) => setName(e.target.value)} disabled={!canWrite} />
        </label>
        <label>
          Category
          <input value={category} onChange={(e) => setCategory(e.target.value)} disabled={!canWrite} />
        </label>
      </section>

      <div className="two-column">
        <section className="panel">
          <h3>Builder</h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <button onClick={() => setActiveTab("blocks")} className={activeTab === "blocks" ? "primary-button" : ""}>Blocks</button>
            <button onClick={() => setActiveTab("html")} className={activeTab === "html" ? "primary-button" : ""}>HTML</button>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <select value={selectedMergeTag} onChange={(e) => setSelectedMergeTag(e.target.value)} disabled={!canWrite}>
              {MERGE_TAG_OPTIONS.map((tag) => (
                <option key={tag} value={tag}>{tag}</option>
              ))}
            </select>
            <button onClick={insertMergeTagIntoHtml} disabled={!canWrite}>Insert into HTML</button>
            <label style={{ border: "1px solid #d8dee9", padding: "6px 10px", borderRadius: 6, cursor: "pointer" }}>
              Upload Image (S3)
              <input type="file" accept="image/*" onChange={uploadImageToS3} style={{ display: "none" }} />
            </label>
          </div>

          {activeTab === "blocks" ? (
            <>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                <button onClick={() => addBlock("header")} disabled={!canWrite}>+ Header</button>
                <button onClick={() => addBlock("text")} disabled={!canWrite}>+ Text</button>
                <button onClick={() => addBlock("image")} disabled={!canWrite}>+ Image</button>
                <button onClick={() => addBlock("button")} disabled={!canWrite}>+ Button</button>
                <button onClick={() => addBlock("divider")} disabled={!canWrite}>+ Divider</button>
                <button onClick={() => addBlock("spacer")} disabled={!canWrite}>+ Spacer</button>
                <button onClick={() => addBlock("two_column")} disabled={!canWrite}>+ 2-Column</button>
                <button onClick={() => addBlock("three_column")} disabled={!canWrite}>+ 3-Column</button>
                <button onClick={() => addBlock("social")} disabled={!canWrite}>+ Social</button>
                <button onClick={() => addBlock("footer")} disabled={!canWrite}>+ Footer</button>
                <button onClick={() => addBlock("html")} disabled={!canWrite}>+ HTML Block</button>
              </div>

              {blocks.map((block, index) => {
                const type = String(block.type ?? "");
                return (
                  <div key={index} className="panel" style={{ marginBottom: 8 }}>
                    <div className="panel-header">
                      <strong>{type.toUpperCase()}</strong>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => moveBlock(index, "up")} disabled={!canWrite}>Up</button>
                        <button onClick={() => moveBlock(index, "down")} disabled={!canWrite}>Down</button>
                        <button onClick={() => removeBlock(index)} disabled={!canWrite}>Remove</button>
                      </div>
                    </div>

                    {(type === "header" || type === "text" || type === "footer") && (
                      <div style={{ display: "grid", gap: 8 }}>
                        <input
                          value={String(block.text ?? "")}
                          onChange={(e) => updateBlock(index, "text", e.target.value)}
                          disabled={!canWrite}
                        />
                        <button type="button" onClick={() => insertMergeTagIntoBlock(index, "text")} disabled={!canWrite}>Insert Tag</button>
                      </div>
                    )}

                    {type === "image" && (
                      <div style={{ display: "grid", gap: 8 }}>
                        <input
                          placeholder="Image URL"
                          value={String(block.src ?? "")}
                          onChange={(e) => updateBlock(index, "src", e.target.value)}
                          disabled={!canWrite}
                        />
                        <input
                          placeholder="Alt text"
                          value={String(block.alt ?? "")}
                          onChange={(e) => updateBlock(index, "alt", e.target.value)}
                          disabled={!canWrite}
                        />
                        <input
                          placeholder="Clickable URL"
                          value={String(block.href ?? "")}
                          onChange={(e) => updateBlock(index, "href", e.target.value)}
                          disabled={!canWrite}
                        />
                      </div>
                    )}

                    {type === "button" && (
                      <div style={{ display: "grid", gap: 8 }}>
                        <input
                          placeholder="Label"
                          value={String(block.label ?? "")}
                          onChange={(e) => updateBlock(index, "label", e.target.value)}
                          disabled={!canWrite}
                        />
                        <button type="button" onClick={() => insertMergeTagIntoBlock(index, "label")} disabled={!canWrite}>Insert Tag</button>
                        <input
                          placeholder="URL"
                          value={String(block.url ?? "")}
                          onChange={(e) => updateBlock(index, "url", e.target.value)}
                          disabled={!canWrite}
                        />
                      </div>
                    )}

                    {type === "spacer" && (
                      <input
                        type="number"
                        value={Number(block.height ?? 24)}
                        onChange={(e) => updateBlock(index, "height", Number(e.target.value))}
                        disabled={!canWrite}
                      />
                    )}

                    {(type === "two_column" || type === "three_column" || type === "html") && (
                      <textarea
                        rows={4}
                        value={
                          type === "two_column"
                            ? `${String(block.left ?? "")}\n---\n${String(block.right ?? "")}`
                            : type === "three_column"
                            ? `${String(block.c1 ?? "")}\n---\n${String(block.c2 ?? "")}\n---\n${String(block.c3 ?? "")}`
                            : String(block.html ?? "")
                        }
                        onChange={(e) => {
                          if (type === "two_column") {
                            const [left, right] = e.target.value.split("\n---\n");
                            updateBlock(index, "left", left ?? "");
                            updateBlock(index, "right", right ?? "");
                          } else if (type === "three_column") {
                            const [c1, c2, c3] = e.target.value.split("\n---\n");
                            updateBlock(index, "c1", c1 ?? "");
                            updateBlock(index, "c2", c2 ?? "");
                            updateBlock(index, "c3", c3 ?? "");
                          } else {
                            updateBlock(index, "html", e.target.value);
                          }
                        }}
                        disabled={!canWrite}
                        style={{ width: "100%" }}
                      />
                    )}
                  </div>
                );
              })}
            </>
          ) : (
            <textarea
              rows={18}
              style={{ width: "100%" }}
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              disabled={!canWrite}
            />
          )}
        </section>

        <section className="panel">
          <h3>Preview</h3>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <button className={previewMode === "desktop" ? "primary-button" : ""} onClick={() => setPreviewMode("desktop")}>
              Desktop (600)
            </button>
            <button className={previewMode === "mobile" ? "primary-button" : ""} onClick={() => setPreviewMode("mobile")}>
              Mobile (375)
            </button>
          </div>

          <div
            style={{
              width: previewMode === "desktop" ? 600 : 375,
              maxWidth: "100%",
              margin: "0 auto",
              border: "1px solid #d8dee9",
              borderRadius: 6,
              background: "#fff",
              minHeight: 200,
              padding: 8
            }}
          >
            <div dangerouslySetInnerHTML={{ __html: mergedPreviewHtml }} />
          </div>
        </section>
      </div>
    </div>
  );
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      const comma = dataUrl.indexOf(",");
      resolve(comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl);
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}
