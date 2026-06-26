"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useWorkspace } from "../store/workspaceStore";

/* ------------------------------------------------------------------ *
 * Brainstorm — the ideation surface. Generate deliberately varied story
 * concepts, riff on them in chat, save the keepers, and (discussion-first)
 * tell the copilot when an idea is ready to become a written story.
 * ------------------------------------------------------------------ */

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

interface Idea {
  id: string;
  logline: string;
  genre: string;
  tone: string;
  hook: string;
}

export default function Brainstorm() {
  // Shared store: project list + background-job feedback.
  const stories = useWorkspace((s) => s.stories);
  const jobs = useWorkspace((s) => s.jobs);
  const initWorkspace = useWorkspace((s) => s.init);
  const startPolling = useWorkspace((s) => s.startPolling);
  const stopPolling = useWorkspace((s) => s.stopPolling);

  const [seed, setSeed] = useState("");
  const [wildness, setWildness] = useState(40);
  const [count, setCount] = useState(4);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [saved, setSaved] = useState<Idea[]>([]);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");

  // Tag this surface so the chat API applies the brainstorm system framing
  // (lead with appeal/metaphor before plot; don't start writing unprompted).
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: { mode: "brainstorm" },
    }),
  });
  const busy = status === "submitted" || status === "streaming";
  const [input, setInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    initWorkspace();
    startPolling();
    refreshSaved();
    return () => stopPolling();
  }, []); // eslint-disable-line

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const refreshSaved = async () => {
    try {
      const d = await fetch("/api/ideas").then((r) => r.json());
      setSaved(Array.isArray(d?.ideas) ? d.ideas : []);
    } catch {
      /* ignore */
    }
  };

  const generate = async (append: boolean) => {
    if (generating) return;
    setGenerating(true);
    setGenError("");
    try {
      const avoid = [
        ...(append ? ideas.map((i) => i.logline) : []),
        ...saved.map((i) => i.logline),
      ];
      const d = await fetch("/api/brainstorm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seed, wildness, count, avoid }),
      }).then((r) => r.json());
      const fresh: Idea[] = Array.isArray(d?.ideas) ? d.ideas : [];
      if (d?.error) setGenError(d.error);
      else if (fresh.length === 0) setGenError("No ideas came back — try again.");
      setIdeas((prev) => (append ? [...prev, ...fresh] : fresh));
    } catch (e: any) {
      setGenError(e?.message || "Generation failed.");
    } finally {
      setGenerating(false);
    }
  };

  const saveIdea = async (idea: Idea) => {
    try {
      const d = await fetch("/api/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", idea }),
      }).then((r) => r.json());
      if (Array.isArray(d?.ideas)) setSaved(d.ideas);
    } catch {
      /* ignore */
    }
  };

  const removeSaved = async (id: string) => {
    try {
      const d = await fetch("/api/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", id }),
      }).then((r) => r.json());
      if (Array.isArray(d?.ideas)) setSaved(d.ideas);
    } catch {
      /* ignore */
    }
  };

  const isSaved = (idea: Idea) =>
    saved.some(
      (s) => s.logline.trim().toLowerCase() === idea.logline.trim().toLowerCase(),
    );

  const send = (text: string) => {
    if (!text.trim() || busy) return;
    sendMessage({ text });
    setInput("");
  };

  const discuss = (idea: Idea) =>
    send(
      `Let's explore this story idea (don't write yet — just talk it through):\n"${idea.logline}" (${[idea.genre, idea.tone].filter(Boolean).join(", ")})${idea.hook ? `\nHook: ${idea.hook}` : ""}\n\nStart with the real appeal: why does this premise pull at us, and is the familiar part just a device or a deeper metaphor? Then where could it go?`,
    );

  const sendToWriting = (idea: Idea) =>
    send(
      `I'm ready to develop this into a real story. Use create_narrative with logline "${idea.logline}", genre "${idea.genre}", tone "${idea.tone}". Ask me for target length and any other choices first if needed.`,
    );

  const openProject = (id: string) => {
    window.location.href = `/?story=${encodeURIComponent(id)}`;
  };

  const runningJobs = (jobs || []).filter((j: any) => j.status === "running");

  return (
    <div style={shell}>
      {/* header */}
      <div style={header}>
        <span style={{ fontWeight: 700, color: C.accent }}>
          ✦ Advanced Writer — Brainstorm
        </span>
        {runningJobs.length > 0 && (
          <span style={{ color: "#e9d5ff", fontSize: "0.74rem", marginLeft: 6 }}>
            ⚙ {runningJobs.length} writing job(s) running…
          </span>
        )}
        <div style={{ marginLeft: "auto", display: "flex", gap: 14 }}>
          <a href="/" style={link}>
            ◆ Studio
          </a>
          <a href="/dashboard" style={link}>
            ⚙ Full dashboard
          </a>
        </div>
      </div>

      {/* projects rail */}
      <div style={{ ...col, borderRight: `1px solid ${C.border}`, overflowY: "auto" }}>
        <div style={groupTitle}>Projects</div>
        {(stories || []).length === 0 ? (
          <div style={{ color: C.dim, fontSize: "0.76rem" }}>
            No stories yet. Brainstorm one, then send it to writing.
          </div>
        ) : (
          (stories || []).map((s: any) => (
            <button key={s.id} style={projectBtn} onClick={() => openProject(s.id)}>
              {s.name}
            </button>
          ))
        )}
        <div style={{ ...groupTitle, marginTop: 18 }}>
          Saved ideas ({saved.length})
        </div>
        {saved.length === 0 ? (
          <div style={{ color: C.dim, fontSize: "0.74rem" }}>
            Star an idea to keep it here.
          </div>
        ) : (
          saved.map((idea) => (
            <div key={idea.id} style={savedCard}>
              <div style={{ fontSize: "0.78rem", marginBottom: 4 }}>
                {idea.logline}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button style={tinyBtn} onClick={() => discuss(idea)}>
                  💬
                </button>
                <button style={tinyBtn} onClick={() => sendToWriting(idea)}>
                  ✍
                </button>
                <button
                  style={{ ...tinyBtn, color: "#e06c75", marginLeft: "auto" }}
                  onClick={() => removeSaved(idea.id)}
                >
                  ✕
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* center: generator + idea cards */}
      <div style={{ ...col, overflowY: "auto" }}>
        <div style={controls}>
          <input
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && generate(false)}
            placeholder="Optional seed — theme, genre, keywords, a vibe… (blank = range wide)"
            style={seedInput}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <label
              style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.8rem", color: C.dim }}
              title="Grounded realism → visionary/speculative. Always coherent and resonant — never absurd for its own sake."
            >
              Ambition
              <span style={{ fontSize: "0.66rem" }}>grounded</span>
              <input
                type="range"
                min={0}
                max={100}
                value={wildness}
                onChange={(e) => setWildness(Number(e.target.value))}
                style={{ accentColor: C.accent }}
              />
              <span style={{ fontSize: "0.66rem" }}>visionary</span>
              <span style={{ color: C.text, width: 28 }}>{wildness}</span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.8rem", color: C.dim }}>
              How many
              <select
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                style={selectStyle}
              >
                {[3, 4, 5, 6].map((n) => (
                  <option key={n} value={n} style={{ background: C.panel }}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <button
              style={genBtn}
              onClick={() => generate(false)}
              disabled={generating}
            >
              {generating ? "…thinking" : "✦ Generate ideas"}
            </button>
            {ideas.length > 0 && (
              <button
                style={ghostBtn}
                onClick={() => generate(true)}
                disabled={generating}
              >
                ↻ More like these
              </button>
            )}
          </div>
          {genError && (
            <div style={{ color: "#e06c75", fontSize: "0.78rem" }}>⚠ {genError}</div>
          )}
        </div>

        {ideas.length === 0 ? (
          <div style={{ color: C.dim, padding: "28px 4px", lineHeight: 1.6 }}>
            Hit <b style={{ color: C.text }}>Generate ideas</b> for a batch of
            concepts. They aim for resonance — a real emotional core and a fresh
            angle, not gimmicks. Raise <b style={{ color: C.text }}>Ambition</b>{" "}
            for bolder, more speculative premises (still coherent), lower it for
            grounded literary ones. Star the keepers, talk any of them over with
            the copilot, and tell it when you're ready to turn one into a story.
          </div>
        ) : (
          <div style={cardGrid}>
            {ideas.map((idea) => (
              <div key={idea.id} style={ideaCard}>
                <div style={{ fontSize: "0.95rem", fontWeight: 600, lineHeight: 1.45, marginBottom: 8 }}>
                  {idea.logline}
                </div>
                {(idea.genre || idea.tone) && (
                  <div style={{ color: C.dim, fontSize: "0.74rem", marginBottom: 8 }}>
                    {[idea.genre, idea.tone].filter(Boolean).join(" · ")}
                  </div>
                )}
                {idea.hook && (
                  <div style={{ color: "#cbb6e8", fontSize: "0.82rem", fontStyle: "italic", lineHeight: 1.5, marginBottom: 12 }}>
                    {idea.hook}
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, marginTop: "auto" }}>
                  <button
                    style={isSaved(idea) ? cardBtnActive : cardBtn}
                    onClick={() => saveIdea(idea)}
                    disabled={isSaved(idea)}
                  >
                    {isSaved(idea) ? "★ Saved" : "☆ Save"}
                  </button>
                  <button style={cardBtn} onClick={() => discuss(idea)}>
                    💬 Discuss
                  </button>
                  <button style={cardBtn} onClick={() => sendToWriting(idea)}>
                    ✍ Write
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* discussion copilot */}
      <div style={{ ...col, borderLeft: `1px solid ${C.border}`, display: "flex", flexDirection: "column", padding: 0 }}>
        <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`, fontWeight: 600, fontSize: "0.82rem" }}>
          Discuss
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "10px 14px" }}>
          {messages.length === 0 ? (
            <div style={{ color: C.dim, fontSize: "0.8rem", lineHeight: 1.6 }}>
              Talk ideas through here. Try “riff on idea 2 but darker”, “combine
              1 and 3”, or “generate 5 wilder ones about grief”. When an idea is
              ready, say “let's write this” and I'll start it.
            </div>
          ) : (
            messages.map((m: any) => (
              <div key={m.id} style={{ margin: "8px 0", fontSize: "0.84rem", lineHeight: 1.5 }}>
                <b style={{ color: m.role === "user" ? C.accent : "#7cd992" }}>
                  {m.role === "user" ? "you" : "copilot"}:
                </b>{" "}
                {m.parts?.map((p: any, i: number) =>
                  p.type === "text" ? (
                    <span key={i}>{p.text}</span>
                  ) : p.type?.startsWith?.("tool-") ? (
                    <span key={i} style={pill}>
                      ⚙ {p.type.slice(5)}
                    </span>
                  ) : null,
                )}
              </div>
            ))
          )}
          {busy && <div style={{ color: C.dim, fontSize: "0.8rem" }}>…thinking</div>}
          <div ref={chatEndRef} />
        </div>
        <div style={{ display: "flex", gap: 8, padding: "8px 12px", borderTop: `1px solid ${C.border}` }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send(input)}
            placeholder="Riff, combine, refine, or say “let's write this”…"
            style={chatInput}
          />
          <button style={genBtn} onClick={() => send(input)} disabled={busy}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- styles ---------- */
const shell: any = {
  display: "grid",
  gridTemplateColumns: "260px 1fr 380px",
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
  gap: 10,
  padding: "0 16px",
  borderBottom: `1px solid ${C.border}`,
  background: C.panel,
};
const link: any = { color: C.dim, fontSize: "0.8rem", textDecoration: "none" };
const col: any = { background: C.panel, padding: "12px", minHeight: 0 };
const groupTitle: any = {
  color: C.dim,
  fontSize: "0.66rem",
  textTransform: "uppercase",
  letterSpacing: 1,
  margin: "4px 0 8px 2px",
};
const projectBtn: any = {
  display: "block",
  width: "100%",
  textAlign: "left",
  background: C.panel2,
  color: C.text,
  border: `1px solid ${C.border}`,
  borderRadius: 6,
  padding: "7px 9px",
  marginBottom: 6,
  fontSize: "0.8rem",
  cursor: "pointer",
};
const savedCard: any = {
  background: C.panel2,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  padding: "8px 9px",
  marginBottom: 6,
};
const controls: any = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  paddingBottom: 14,
  borderBottom: `1px solid ${C.border}`,
};
const seedInput: any = {
  width: "100%",
  background: C.bg,
  color: C.text,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  padding: "10px 12px",
  fontSize: "0.9rem",
  outline: "none",
  boxSizing: "border-box",
};
const selectStyle: any = {
  background: C.panel2,
  color: C.text,
  border: `1px solid ${C.border}`,
  borderRadius: 6,
  padding: "5px 8px",
  fontSize: "0.82rem",
};
const genBtn: any = {
  background: C.accent,
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "8px 16px",
  fontSize: "0.85rem",
  fontWeight: 600,
  cursor: "pointer",
};
const ghostBtn: any = {
  background: "transparent",
  color: "#e9d5ff",
  border: `1px solid rgba(168,85,247,0.35)`,
  borderRadius: 8,
  padding: "8px 14px",
  fontSize: "0.85rem",
  cursor: "pointer",
};
const cardGrid: any = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
  gap: 14,
  paddingTop: 18,
};
const ideaCard: any = {
  display: "flex",
  flexDirection: "column",
  background: C.panel2,
  border: `1px solid ${C.border}`,
  borderRadius: 12,
  padding: "14px 15px",
  minHeight: 150,
};
const cardBtn: any = {
  background: C.accentSoft,
  color: "#e9d5ff",
  border: `1px solid rgba(168,85,247,0.3)`,
  borderRadius: 6,
  padding: "5px 9px",
  fontSize: "0.74rem",
  cursor: "pointer",
};
const cardBtnActive: any = {
  ...cardBtn,
  background: "rgba(124,217,146,0.15)",
  color: "#9be8ad",
  border: "1px solid rgba(124,217,146,0.35)",
  cursor: "default",
};
const tinyBtn: any = {
  background: "transparent",
  color: C.dim,
  border: `1px solid ${C.border}`,
  borderRadius: 5,
  padding: "2px 7px",
  fontSize: "0.72rem",
  cursor: "pointer",
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
const pill: any = {
  background: C.accentSoft,
  color: "#e9d5ff",
  borderRadius: 4,
  padding: "1px 6px",
  fontSize: "0.72rem",
};
