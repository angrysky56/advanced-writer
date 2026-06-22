"use client";

import { useEffect, useMemo, useState } from "react";
import { useChat } from "@ai-sdk/react";

/* ------------------------------------------------------------------ *
 * Advanced Writer — "Studio" IDE shell (new view, runs alongside the
 * existing dashboard at "/"). Three zones around a dominant manuscript:
 *   Left   — Narrative Explorer (the project tree)
 *   Center — Manuscript / selected document (the editor surface)
 *   Right  — Contextual Inspector (changes with the selection)
 * plus a bottom Copilot rail that always knows the active project.
 * ------------------------------------------------------------------ */

type Selection =
  | { type: "manuscript" }
  | { type: "scene"; id: string }
  | { type: "character"; id: string }
  | { type: "doc"; id: "architecture" | "worldbible" | "storyscope" };

const C = {
  bg: "#0e0e16",
  panel: "#15151f",
  panel2: "#1b1b27",
  border: "rgba(255,255,255,0.08)",
  text: "#e7e7ee",
  dim: "rgba(255,255,255,0.45)",
  accent: "#a855f7",
  accentSoft: "rgba(168,85,247,0.15)",
};

/** Minimal, safe markdown → JSX (headings, bullets, bold, paragraphs). */
function Markdown({ text }: { text: string }) {
  if (!text) return null;
  const lines = text.replace(/\r/g, "").split("\n");
  const out: any[] = [];
  let para: string[] = [];
  const flush = (k: number) => {
    if (para.length) {
      out.push(
        <p key={`p${k}`} style={{ margin: "0 0 14px", lineHeight: 1.7 }}>
          {inline(para.join(" "))}
        </p>,
      );
      para = [];
    }
  };
  const inline = (s: string) =>
    s.split(/(\*\*[^*]+\*\*)/g).map((seg, i) =>
      seg.startsWith("**") && seg.endsWith("**") ? (
        <strong key={i}>{seg.slice(2, -2)}</strong>
      ) : (
        <span key={i}>{seg}</span>
      ),
    );
  lines.forEach((raw, i) => {
    const l = raw.trimEnd();
    if (!l.trim()) {
      flush(i);
      return;
    }
    const h = l.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      flush(i);
      const lvl = h[1].length;
      out.push(
        <div
          key={`h${i}`}
          style={{
            fontWeight: 700,
            fontSize: lvl === 1 ? "1.3rem" : lvl === 2 ? "1.1rem" : "0.95rem",
            margin: "18px 0 8px",
            color: C.text,
          }}
        >
          {inline(h[2])}
        </div>,
      );
      return;
    }
    if (/^[-*]\s+/.test(l)) {
      flush(i);
      out.push(
        <div key={`li${i}`} style={{ display: "flex", gap: 8, margin: "2px 0" }}>
          <span style={{ color: C.accent }}>•</span>
          <span style={{ lineHeight: 1.6 }}>{inline(l.replace(/^[-*]\s+/, ""))}</span>
        </div>,
      );
      return;
    }
    para.push(l);
  });
  flush(9999);
  return <div>{out}</div>;
}

function normalizeSceneId(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export default function Studio() {
  const [stories, setStories] = useState<any[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [version, setVersion] = useState<string>("v1");
  const [arc, setArc] = useState<any[]>([]);
  const [sel, setSel] = useState<Selection>({ type: "manuscript" });
  const [input, setInput] = useState("");

  const { messages, sendMessage, status } = useChat();
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    fetch(`/api/workspace?version=${version}`)
      .then((r) => r.json())
      .then((d) => {
        const s = Array.isArray(d.stories) ? d.stories : [];
        setStories(s);
        if (s.length && !activeId) setActiveId(s[0].id);
      })
      .catch(() => {});
  }, [version]); // eslint-disable-line

  useEffect(() => {
    if (!activeId) return;
    setVersion("v1");
    fetch(`/api/arc?story_id=${encodeURIComponent(activeId)}`)
      .then((r) => r.json())
      .then((d) => setArc(Array.isArray(d.characters) ? d.characters : []))
      .catch(() => setArc([]));
    setSel({ type: "manuscript" });
  }, [activeId]);

  const story = useMemo(
    () => stories.find((s) => s.id === activeId) || stories[0],
    [stories, activeId],
  );

  const arcOf = (name: string) =>
    arc.find((c) => (c.name || "").toLowerCase() === (name || "").toLowerCase());

  const diagOf = (sceneId: string) =>
    (story?.diagnostics || []).find(
      (d: any) => normalizeSceneId(d.sceneId) === normalizeSceneId(sceneId),
    );

  const send = (text: string) => {
    if (!text.trim() || busy) return;
    sendMessage({ text: `(Active project: ${activeId}) ${text}` });
    setInput("");
  };

  // Context actions change with the selection and route through the copilot.
  const sceneText =
    sel.type === "scene"
      ? (story?.drafts || []).find((x: any) => x.id === sel.id)?.content || ""
      : "";
  const contextActions: { label: string; run: () => void }[] =
    sel.type === "scene"
      ? [
          { label: "✎ Revise scene", run: () => send(`Use rewrite_scene to improve ${sel.id} (target_axis cortisol, scene_id "${sel.id}"). Scene text:\n\n${sceneText}`) },
          { label: "🔍 Re-score", run: () => send(`Use review_narrative (scope scene, scene_id "${sel.id}") on this text:\n\n${sceneText}`) },
          { label: "🎭 Character debate", run: () => send(`Run batch_revise_pathologies on this project (async) to convene the Character Writer's Room.`) },
        ]
      : sel.type === "character"
        ? [
            { label: "✦ Develop", run: () => send(`Develop the character "${sel.id}" further using develop_character.`) },
            { label: "+ New character", run: () => send(`Add a new character to this project with develop_character (action create) — ask me for name and archetype.`) },
          ]
        : [
            { label: "+ New story", run: () => send(`Start a brand-new story with create_narrative — ask me for the logline, genre, tone, and length.`) },
            { label: "📋 StoryScope audit", run: () => send(`Run storyscope_final_review on this project (async).`) },
            { label: "✎ Apply Draft 2", run: () => send(`Run apply_storyscope_revisions on this project (async).`) },
          ];

  // ---- center content ----
  const center = () => {
    if (!story)
      return <Empty msg="No project loaded. Generate or open a story first." />;
    if (sel.type === "manuscript")
      return story.manuscript ? (
        <Markdown text={story.manuscript} />
      ) : (
        <Empty msg="No compiled manuscript yet. Draft scenes, then compile." />
      );
    if (sel.type === "scene") {
      const d = (story.drafts || []).find((x: any) => x.id === sel.id);
      return d ? <Markdown text={d.content} /> : <Empty msg="Scene not found." />;
    }
    if (sel.type === "character") {
      const c = (story.characters || []).find((x: any) => x.name === sel.id);
      return c ? <Markdown text={c.description} /> : <Empty msg="Character not found." />;
    }
    if (sel.type === "doc") {
      const text =
        sel.id === "architecture"
          ? story.architectureBrief
          : sel.id === "worldbible"
            ? story.worldBible
            : story.executiveSummary;
      return text ? <Markdown text={text} /> : <Empty msg="Not generated yet." />;
    }
    return null;
  };

  // ---- inspector ----
  const inspector = () => {
    if (!story) return null;
    if (sel.type === "scene") {
      const d = diagOf(sel.id);
      return (
        <div>
          <Section title="Scene Diagnostics" />
          {d ? (
            <>
              <ScoreRow label="Cortisol (tension)" v={d.cortisol} />
              <ScoreRow label="Oxytocin (empathy)" v={d.oxytocin} />
              <ScoreRow label="Dopamine (agency)" v={d.dopamine} />
              <div style={{ marginTop: 10 }}>
                {(d.pathologies || []).length === 0 ? (
                  <span style={{ color: "#4ade80", fontSize: "0.78rem" }}>
                    No pathologies flagged.
                  </span>
                ) : (
                  d.pathologies.map((p: string, i: number) => (
                    <div key={i} style={pill("#f59e0b")}>⚠ {p}</div>
                  ))
                )}
              </div>
            </>
          ) : (
            <Muted text="No scored diagnostic for this scene yet." />
          )}
          <Section title="Character state — as tracked" />
          {arc.length === 0 ? (
            <Muted text="No tracked state yet (run a fresh draft)." />
          ) : (
            arc.map((c, i) => (
              <div key={i} style={{ marginBottom: 10 }}>
                <div style={{ fontWeight: 600, fontSize: "0.8rem" }}>{c.name}</div>
                {c.scratchpad ? (
                  <div style={{ fontSize: "0.72rem", color: C.dim, lineHeight: 1.5 }}>
                    {["location", "wants", "knows", "holding", "relationships"]
                      .filter((k) => c.scratchpad[k])
                      .map((k) => (
                        <div key={k}>
                          <b style={{ color: "rgba(255,255,255,0.6)" }}>{k}:</b>{" "}
                          {c.scratchpad[k]}
                        </div>
                      ))}
                  </div>
                ) : (
                  <Muted text="no sheet yet" />
                )}
              </div>
            ))
          )}
        </div>
      );
    }
    if (sel.type === "character") {
      const c = (story.characters || []).find((x: any) => x.name === sel.id);
      const a = arcOf(sel.id);
      if (!c) return null;
      return (
        <div>
          <Section title="Panksepp drives" />
          {Object.entries(c.panksepp || {}).map(([k, v]: any) => (
            <Bar key={k} label={k} v={v} />
          ))}
          <Section title="Continuity sheet" />
          {a?.scratchpad ? (
            <div style={{ fontSize: "0.74rem", color: C.dim, lineHeight: 1.6 }}>
              {Object.entries(a.scratchpad).map(([k, v]: any) => (
                <div key={k}>
                  <b style={{ color: "rgba(255,255,255,0.6)" }}>{k}:</b> {String(v)}
                </div>
              ))}
            </div>
          ) : (
            <Muted text="No scratchpad recorded yet." />
          )}
          <Section title="Affect arc" />
          <Muted text={`${a?.snapshots?.length || 0} scene snapshot(s) tracked. Full wheel + arc chart in the Character Workbench (next slice).`} />
        </div>
      );
    }
    // book-level
    return (
      <div>
        <Section title="StoryScope" />
        {story.executiveSummary ? (
          <button style={linkBtn} onClick={() => setSel({ type: "doc", id: "storyscope" })}>
            Open Executive Summary →
          </button>
        ) : (
          <Muted text="No StoryScope review yet. Ask the copilot to run one." />
        )}
        <Section title="Cast" />
        {(story.characters || []).map((c: any, i: number) => (
          <button key={i} style={linkBtn} onClick={() => setSel({ type: "character", id: c.name })}>
            {c.name} <span style={{ color: C.dim }}>— {c.archetype}</span>
          </button>
        ))}
      </div>
    );
  };

  return (
    <div style={shell}>
      {/* header */}
      <div style={header}>
        <span style={{ fontWeight: 700, color: C.accent }}>◆ Advanced Writer Studio</span>
        <select
          value={activeId}
          onChange={(e) => setActiveId(e.target.value)}
          style={selectStyle}
        >
          {stories.map((s) => (
            <option key={s.id} value={s.id} style={{ background: C.panel }}>
              {s.name}
            </option>
          ))}
        </select>
        {(story?.availableVersions?.length || 0) > 1 && (
          <select
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            style={selectStyle}
            title="Draft version"
          >
            {story.availableVersions.map((v: string) => (
              <option key={v} value={v} style={{ background: C.panel }}>
                Draft {v}
              </option>
            ))}
          </select>
        )}
        <a href="/" style={{ marginLeft: "auto", color: C.dim, fontSize: "0.78rem" }}>
          ← classic dashboard
        </a>
      </div>

      {/* explorer */}
      <div style={{ ...col, borderRight: `1px solid ${C.border}`, overflowY: "auto" }}>
        <NavItem label="📖 Full Manuscript" active={sel.type === "manuscript"} onClick={() => setSel({ type: "manuscript" })} />
        <Group title="Scenes" />
        {(story?.drafts || []).map((d: any) => (
          <NavItem key={d.id} label={`▸ ${d.title}`} active={sel.type === "scene" && sel.id === d.id} onClick={() => setSel({ type: "scene", id: d.id })} indent />
        ))}
        <Group title="Cast" />
        {(story?.characters || []).map((c: any) => (
          <NavItem key={c.name} label={`◐ ${c.name}`} active={sel.type === "character" && sel.id === c.name} onClick={() => setSel({ type: "character", id: c.name })} indent />
        ))}
        <Group title="Structure" />
        <NavItem label="◷ Architecture Brief" active={sel.type === "doc" && (sel as any).id === "architecture"} onClick={() => setSel({ type: "doc", id: "architecture" })} indent />
        <NavItem label="◷ World Bible" active={sel.type === "doc" && (sel as any).id === "worldbible"} onClick={() => setSel({ type: "doc", id: "worldbible" })} indent />
        <NavItem label="◷ StoryScope Summary" active={sel.type === "doc" && (sel as any).id === "storyscope"} onClick={() => setSel({ type: "doc", id: "storyscope" })} indent />
      </div>

      {/* center: action bar + manuscript + copilot rail */}
      <div style={{ ...col, padding: 0, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={actionBar}>
          {contextActions.map((a, i) => (
            <button key={i} style={actionBtn} onClick={a.run} disabled={busy}>
              {a.label}
            </button>
          ))}
          <span style={{ marginLeft: "auto", color: C.dim, fontSize: "0.72rem", alignSelf: "center" }}>
            {sel.type === "scene"
              ? `scene · ${sel.id}`
              : sel.type === "character"
                ? `character · ${sel.id}`
                : "project"}
          </span>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "32px 48px", fontSize: "1.02rem", color: C.text }}>
          {center()}
        </div>
        {/* copilot rail */}
        <div style={rail}>
          <div style={{ flex: 1, overflowY: "auto", padding: "10px 14px" }}>
            {messages.length === 0 ? (
              <div style={{ color: C.dim, fontSize: "0.8rem" }}>
                Copilot — knows the active project. Try: “review the manuscript”, “run a StoryScope audit”, “continue drafting the next scene”.
              </div>
            ) : (
              messages.map((m: any) => (
                <div key={m.id} style={{ margin: "6px 0", fontSize: "0.84rem" }}>
                  <b style={{ color: m.role === "user" ? C.accent : "#7cd992" }}>
                    {m.role === "user" ? "you" : "copilot"}:
                  </b>{" "}
                  {m.parts?.map((p: any, i: number) =>
                    p.type === "text" ? (
                      <span key={i}>{p.text}</span>
                    ) : p.type?.startsWith?.("tool-") ? (
                      <span key={i} style={pill(C.accent)}>⚙ {p.type.slice(5)}</span>
                    ) : null,
                  )}
                </div>
              ))
            )}
            {busy && <div style={{ color: C.dim, fontSize: "0.8rem" }}>…working</div>}
          </div>
          <div style={{ display: "flex", gap: 8, padding: "8px 12px", borderTop: `1px solid ${C.border}` }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send(input)}
              placeholder={`Write to the ${story?.name || ""} copilot…`}
              style={chatInput}
            />
            <button style={sendBtn} onClick={() => send(input)} disabled={busy}>
              Send
            </button>
          </div>
        </div>
      </div>

      {/* inspector */}
      <div style={{ ...col, borderLeft: `1px solid ${C.border}`, overflowY: "auto" }}>
        <div style={{ fontWeight: 700, fontSize: "0.85rem", marginBottom: 6 }}>
          Inspector
        </div>
        {inspector()}
      </div>
    </div>
  );
}

/* ---------- little presentational helpers ---------- */
const shell: any = {
  display: "grid",
  gridTemplateColumns: "240px 1fr 340px",
  gridTemplateRows: "46px 1fr",
  height: "100vh",
  background: C.bg,
  color: C.text,
  fontFamily: "system-ui, sans-serif",
};
const header: any = {
  gridColumn: "1 / -1",
  display: "flex",
  alignItems: "center",
  gap: 14,
  padding: "0 16px",
  borderBottom: `1px solid ${C.border}`,
  background: C.panel,
};
const col: any = { background: C.panel, padding: "12px", minHeight: 0 };
const actionBar: any = {
  display: "flex",
  gap: 8,
  padding: "8px 14px",
  borderBottom: `1px solid ${C.border}`,
  background: C.panel2,
  alignItems: "center",
};
const actionBtn: any = {
  background: C.accentSoft,
  color: "#e9d5ff",
  border: `1px solid rgba(168,85,247,0.35)`,
  borderRadius: 6,
  padding: "5px 11px",
  cursor: "pointer",
  fontSize: "0.76rem",
  fontWeight: 600,
};
const rail: any = {
  height: 220,
  borderTop: `1px solid ${C.border}`,
  background: C.panel2,
  display: "flex",
  flexDirection: "column",
};
const selectStyle: any = {
  background: C.panel2,
  color: C.text,
  border: `1px solid ${C.border}`,
  borderRadius: 6,
  padding: "5px 8px",
  fontSize: "0.82rem",
};
const chatInput: any = {
  flex: 1,
  background: C.bg,
  color: C.text,
  border: `1px solid ${C.border}`,
  borderRadius: 6,
  padding: "8px 10px",
  fontSize: "0.85rem",
  outline: "none",
};
const sendBtn: any = {
  background: C.accent,
  color: "#fff",
  border: "none",
  borderRadius: 6,
  padding: "0 14px",
  cursor: "pointer",
  fontWeight: 600,
};
const linkBtn: any = {
  display: "block",
  width: "100%",
  textAlign: "left",
  background: "transparent",
  color: C.text,
  border: "none",
  padding: "5px 0",
  cursor: "pointer",
  fontSize: "0.8rem",
};
const pill = (c: string): any => ({
  display: "inline-block",
  border: `1px solid ${c}`,
  color: c,
  borderRadius: 5,
  padding: "1px 7px",
  margin: "2px 4px 2px 0",
  fontSize: "0.7rem",
});

function NavItem({ label, active, onClick, indent }: any) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        background: active ? C.accentSoft : "transparent",
        color: active ? "#fff" : "rgba(255,255,255,0.8)",
        border: "none",
        borderLeft: active ? `2px solid ${C.accent}` : "2px solid transparent",
        padding: indent ? "5px 8px 5px 18px" : "6px 8px",
        cursor: "pointer",
        fontSize: "0.8rem",
        borderRadius: 4,
      }}
    >
      {label}
    </button>
  );
}
const Group = ({ title }: any) => (
  <div style={{ color: C.dim, fontSize: "0.66rem", textTransform: "uppercase", letterSpacing: 1, margin: "12px 0 4px 4px" }}>
    {title}
  </div>
);
const Section = ({ title }: any) => (
  <div style={{ color: C.dim, fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: 1, margin: "14px 0 6px" }}>
    {title}
  </div>
);
const Muted = ({ text }: any) => (
  <div style={{ color: C.dim, fontSize: "0.74rem", lineHeight: 1.5 }}>{text}</div>
);
const Empty = ({ msg }: any) => (
  <div style={{ color: C.dim, textAlign: "center", marginTop: 80 }}>{msg}</div>
);
function ScoreRow({ label, v }: any) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", margin: "3px 0" }}>
      <span style={{ color: C.dim }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{v == null ? "—" : `${v}/10`}</span>
    </div>
  );
}
function Bar({ label, v }: any) {
  const n = Number(v) || 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "3px 0", fontSize: "0.72rem" }}>
      <span style={{ width: 78, color: C.dim }}>{label}</span>
      <div style={{ flex: 1, height: 5, background: "rgba(255,255,255,0.08)", borderRadius: 3 }}>
        <div style={{ width: `${n * 10}%`, height: "100%", background: C.accent, borderRadius: 3 }} />
      </div>
      <span>{n}</span>
    </div>
  );
}
