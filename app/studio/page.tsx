"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { useWorkspace } from "../store/workspaceStore";

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
  | { type: "doc"; id: "architecture" | "worldbible" | "storyscope" }
  | { type: "aspect"; id: string }
  | { type: "diff" };

/** Simple LCS line diff (guarded against huge inputs). */
function lineDiff(
  aText: string,
  bText: string,
): { t: "same" | "add" | "del"; x: string }[] {
  const a = (aText || "").split("\n");
  const b = (bText || "").split("\n");
  const n = a.length,
    m = b.length;
  if (n * m > 4_000_000) {
    // Too large for an inline diff — show as full replace.
    return [
      ...a.map((x) => ({ t: "del" as const, x })),
      ...b.map((x) => ({ t: "add" as const, x })),
    ];
  }
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] =
        a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: { t: "same" | "add" | "del"; x: string }[] = [];
  let i = 0,
    j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ t: "same", x: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ t: "del", x: a[i] });
      i++;
    } else {
      out.push({ t: "add", x: b[j] });
      j++;
    }
  }
  while (i < n) out.push({ t: "del", x: a[i++] });
  while (j < m) out.push({ t: "add", x: b[j++] });
  return out;
}

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
  // Shared workspace state lives in the zustand store; every panel subscribes
  // to the same source instead of fetching independently.
  const stories = useWorkspace((s) => s.stories);
  const activeId = useWorkspace((s) => s.activeId);
  const version = useWorkspace((s) => s.version);
  const arc = useWorkspace((s) => s.arc);
  const setActiveId = useWorkspace((s) => s.setActiveId);
  const setVersion = useWorkspace((s) => s.setVersion);
  const initWorkspace = useWorkspace((s) => s.init);
  const refreshStore = useWorkspace((s) => s.refresh);
  const startPolling = useWorkspace((s) => s.startPolling);
  const stopPolling = useWorkspace((s) => s.stopPolling);

  const [sel, setSel] = useState<Selection>({ type: "manuscript" });
  const [input, setInput] = useState("");
  const [running, setRunning] = useState<string>("");
  const [diffA, setDiffA] = useState<string>("v1");
  const [diffB, setDiffB] = useState<string>("v1");
  const [diffTextA, setDiffTextA] = useState<string>("");
  const [diffTextB, setDiffTextB] = useState<string>("");

  // ---- hand editing ----
  const [editing, setEditing] = useState<boolean>(false);
  const [editText, setEditText] = useState<string>("");
  const [saving, setSaving] = useState<boolean>(false);
  const [saveMsg, setSaveMsg] = useState<string>("");

  // ---- find / replace ----
  const [frOpen, setFrOpen] = useState<boolean>(false);
  const [frFind, setFrFind] = useState<string>("");
  const [frReplace, setFrReplace] = useState<string>("");
  const [frMode, setFrMode] = useState<"literal" | "whole-word" | "regex">(
    "whole-word",
  );
  const [frCase, setFrCase] = useState<boolean>(false);
  const [frScope, setFrScope] = useState<"document" | "story" | "all">("story");
  const [frBusy, setFrBusy] = useState<boolean>(false);
  const [frResult, setFrResult] = useState<any>(null);
  const [frApplied, setFrApplied] = useState<boolean>(false);

  const { messages, sendMessage, status, setMessages } = useChat();
  const busy = status === "submitted" || status === "streaming";

  // ---- chat history (per-story, persisted) ----
  const [chatId, setChatId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState<boolean>(false);
  const [historyTab, setHistoryTab] = useState<"active" | "archived">("active");
  const [convos, setConvos] = useState<any[]>([]);
  const [archivedConvos, setArchivedConvos] = useState<any[]>([]);
  const savedSig = useRef<string>("");
  const skipNextSave = useRef<boolean>(false);

  // Boot the shared store and start the job poller (which auto-refreshes every
  // view when a background job finishes). Reference-counted; stops on unmount.
  useEffect(() => {
    initWorkspace();
    startPolling();
    return () => stopPolling();
  }, []); // eslint-disable-line

  // Reset the center selection when the active story changes (data fetching for
  // the new story is handled by the store's setActiveId).
  useEffect(() => {
    if (activeId) setSel({ type: "manuscript" });
  }, [activeId]);

  useEffect(() => {
    if (sel.type !== "diff" || !activeId) return;
    const load = async (v: string) => {
      try {
        const r = await fetch(`/api/workspace?version=${v}`);
        const d = await r.json();
        const st = (d.stories || []).find((s: any) => s.id === activeId);
        return st?.manuscript || "";
      } catch {
        return "";
      }
    };
    load(diffA).then(setDiffTextA);
    load(diffB).then(setDiffTextB);
  }, [sel, diffA, diffB, activeId]);

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

  // Pull fresh workspace + arc into the shared store (used after edits, tool
  // runs, and find/replace applies).
  const reload = () => {
    void refreshStore();
  };

  // Map the current selection to the markdown file behind it (or null when the
  // view isn't a single editable document, e.g. the version-diff view).
  const editableDoc = (): { path: string; content: string } | null => {
    if (!story) return null;
    if (sel.type === "manuscript")
      return story.manuscriptPath
        ? { path: story.manuscriptPath, content: story.manuscript || "" }
        : null;
    if (sel.type === "scene") {
      const d = (story.drafts || []).find((x: any) => x.id === sel.id);
      return d?.path ? { path: d.path, content: d.content || "" } : null;
    }
    if (sel.type === "character") {
      const c = (story.characters || []).find((x: any) => x.name === sel.id);
      return c?.path ? { path: c.path, content: c.description || "" } : null;
    }
    if (sel.type === "doc") {
      if (sel.id === "architecture") {
        const raw = story.architectureBrief || "";
        // The API substitutes a placeholder when no brief exists yet; start the
        // editor empty in that case rather than editing the placeholder text.
        const content = /^No architecture brief/i.test(raw) ? "" : raw;
        return story.architecturePath
          ? { path: story.architecturePath, content }
          : null;
      }
      if (sel.id === "worldbible")
        return story.worldBiblePath
          ? { path: story.worldBiblePath, content: story.worldBible || "" }
          : null;
      return story.executiveSummaryPath
        ? {
            path: story.executiveSummaryPath,
            content: story.executiveSummary || "",
          }
        : null;
    }
    if (sel.type === "aspect") {
      const r = (story.aspectReports || []).find(
        (x: any) => x.aspect === sel.id,
      );
      return r?.path ? { path: r.path, content: r.content || "" } : null;
    }
    return null;
  };

  const startEdit = () => {
    const doc = editableDoc();
    if (!doc) return;
    setEditText(doc.content);
    setSaveMsg("");
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setSaveMsg("");
  };

  const saveEdit = async () => {
    const doc = editableDoc();
    if (!doc || saving) return;
    setSaving(true);
    setSaveMsg("");
    try {
      const res = await fetch("/api/document", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ relPath: doc.path, content: editText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Save failed");
      setEditing(false);
      setSaveMsg("Saved ✓");
      reload();
    } catch (e: any) {
      setSaveMsg(`Save failed: ${e?.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  // Leave edit mode whenever the selection / version / project changes, so the
  // buffer is never left pointing at a document we've navigated away from.
  useEffect(() => {
    setEditing(false);
    setSaveMsg("");
  }, [sel, version, activeId]);

  // Run a deterministic find/replace. apply=false previews; apply=true writes.
  const runFindReplace = async (apply: boolean) => {
    if (!frFind || frBusy) return;
    setFrBusy(true);
    try {
      const doc = editableDoc();
      const scopeArgs =
        frScope === "document" && doc?.path
          ? { relPath: doc.path }
          : frScope === "story"
            ? { storyId: activeId }
            : {};
      const res = await fetch("/api/find-replace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          find: frFind,
          replace: frReplace,
          mode: frMode,
          caseSensitive: frCase,
          version,
          apply,
          ...scopeArgs,
        }),
      });
      const data = await res.json();
      setFrResult(data);
      setFrApplied(apply && !data.error);
      if (apply && !data.error) reload();
    } catch (e: any) {
      setFrResult({ error: e?.message || String(e) });
      setFrApplied(false);
    } finally {
      setFrBusy(false);
    }
  };

  // ---------- chat history ----------
  const firstUserText = (msgs: any[]): string => {
    const u = (msgs || []).find((m) => m?.role === "user");
    const t = u?.parts?.find((p: any) => p?.type === "text");
    return (t?.text || "").replace(/^\(Active project:[^)]*\)\s*/i, "").trim();
  };

  const refreshConvos = async () => {
    if (!activeId) return;
    try {
      const [a, ar] = await Promise.all([
        fetch(`/api/chats?storyId=${encodeURIComponent(activeId)}`).then((r) =>
          r.json(),
        ),
        fetch(
          `/api/chats?storyId=${encodeURIComponent(activeId)}&archived=1`,
        ).then((r) => r.json()),
      ]);
      setConvos(Array.isArray(a?.conversations) ? a.conversations : []);
      setArchivedConvos(
        Array.isArray(ar?.conversations) ? ar.conversations : [],
      );
    } catch {
      /* ignore */
    }
  };

  const saveChat = async (msgs: any[]) => {
    if (!activeId || !msgs?.length) return;
    try {
      const res = await fetch("/api/chats", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storyId: activeId,
          id: chatId,
          title: firstUserText(msgs) || undefined,
          messages: msgs,
        }),
      });
      const data = await res.json();
      if (data?.id) setChatId(data.id);
    } catch {
      /* best effort */
    }
  };

  const newChat = () => {
    // Clearing to empty is guarded by the length check in the save effect, so
    // we must NOT set the skip flag here — otherwise the first message of the
    // new conversation would be swallowed instead of saved.
    skipNextSave.current = false;
    setMessages([]);
    setChatId(null);
    savedSig.current = "";
    setHistoryOpen(false);
  };

  const loadChat = async (id: string) => {
    if (!activeId) return;
    try {
      const data = await fetch(
        `/api/chats?storyId=${encodeURIComponent(activeId)}&id=${encodeURIComponent(id)}`,
      ).then((r) => r.json());
      if (Array.isArray(data?.messages)) {
        skipNextSave.current = true;
        setMessages(data.messages);
        setChatId(data.id || id);
        savedSig.current = `${data.id || id}:${data.messages.length}`;
      }
    } catch {
      /* ignore */
    }
    setHistoryOpen(false);
  };

  const chatAction = async (action: string, id: string) => {
    if (!activeId) return;
    if (
      action === "delete" &&
      !window.confirm("Delete this conversation permanently?")
    )
      return;
    try {
      await fetch("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, storyId: activeId, id }),
      });
    } catch {
      /* ignore */
    }
    if (id === chatId && (action === "delete" || action === "archive"))
      newChat();
    refreshConvos();
  };

  // Restore the most-recent conversation when the active story changes.
  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await fetch(
          `/api/chats?storyId=${encodeURIComponent(activeId)}`,
        ).then((r) => r.json());
        const list = Array.isArray(data?.conversations)
          ? data.conversations
          : [];
        if (cancelled) return;
        setConvos(list);
        if (list.length > 0) {
          await loadChat(list[0].id);
        } else {
          // No history for this story: start clean and allow the first message
          // to save (empty state is already guarded in the save effect).
          skipNextSave.current = false;
          setMessages([]);
          setChatId(null);
          savedSig.current = "";
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeId]); // eslint-disable-line

  // Auto-save the conversation once it settles, de-duplicated by signature.
  useEffect(() => {
    if (status !== "ready") return;
    if (!activeId || messages.length === 0) return;
    const last = messages[messages.length - 1] as any;
    const sig = `${chatId}:${messages.length}:${last?.id || ""}`;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      savedSig.current = sig;
      return;
    }
    if (sig === savedSig.current) return;
    savedSig.current = sig;
    saveChat(messages);
  }, [status, messages]); // eslint-disable-line

  // Deterministic tool run (server-side, version-aware), then refresh the view.
  const runTool = async (label: string, tool: string, args: any) => {
    if (running) return;
    setRunning(label);
    try {
      await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool, args }),
      });
    } catch {
      /* ignore */
    } finally {
      setRunning("");
      reload();
    }
  };

  // Context actions change with the selection and route through the copilot.
  const sceneText =
    sel.type === "scene"
      ? (story?.drafts || []).find((x: any) => x.id === sel.id)?.content || ""
      : "";
  const contextActions: { label: string; run: () => void }[] =
    sel.type === "scene"
      ? [
          { label: running === "revise" ? "…revising" : "✎ Revise scene", run: () => runTool("revise", "rewrite_scene", { story_id: activeId, scene_id: sel.id, scene_text: sceneText, target_axis: "cortisol", version }) },
          { label: running === "rescore" ? "…scoring" : "🔍 Re-score", run: () => runTool("rescore", "review_narrative", { story_id: activeId, scene_id: sel.id, text: sceneText, scope: "scene" }) },
          { label: "🎭 Character debate", run: () => send(`Run batch_revise_pathologies on this project (async, version "${version}") to convene the Character Writer's Room.`) },
        ]
      : sel.type === "character"
        ? [
            { label: "✦ Develop", run: () => send(`Develop the character "${sel.id}" further using develop_character.`) },
            { label: "+ New character", run: () => send(`Add a new character to this project with develop_character (action create) — ask me for name and archetype.`) },
          ]
        : [
            { label: "+ New story", run: () => send(`Start a brand-new story with create_narrative — ask me for the logline, genre, tone, and length.`) },
            { label: "📋 StoryScope audit", run: () => send(`Run storyscope_final_review on this project for version "${version}" (async).`) },
            { label: "✎ Apply revisions", run: () => send(`Run apply_storyscope_revisions on this project (async), reading the review for source version "${version}".`) },
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
    if (sel.type === "aspect") {
      const r = (story.aspectReports || []).find((x: any) => x.aspect === sel.id);
      return r ? <Markdown text={r.content} /> : <Empty msg="Report not found." />;
    }
    if (sel.type === "diff") {
      const vers: string[] = story.availableVersions || ["v1"];
      const diff = lineDiff(diffTextA, diffTextB);
      return (
        <div>
          <div style={{ display: "flex", gap: 10, marginBottom: 14, alignItems: "center" }}>
            <span style={{ color: C.dim, fontSize: "0.8rem" }}>Compare manuscript</span>
            <select value={diffA} onChange={(e) => setDiffA(e.target.value)} style={selectStyle}>
              {vers.map((v) => (
                <option key={v} value={v} style={{ background: C.panel }}>{v}</option>
              ))}
            </select>
            <span style={{ color: C.dim }}>→</span>
            <select value={diffB} onChange={(e) => setDiffB(e.target.value)} style={selectStyle}>
              {vers.map((v) => (
                <option key={v} value={v} style={{ background: C.panel }}>{v}</option>
              ))}
            </select>
            <span style={{ marginLeft: "auto", fontSize: "0.72rem", color: C.dim }}>
              <span style={{ color: "#e06c75" }}>− removed</span> ·{" "}
              <span style={{ color: "#7cd992" }}>+ added</span>
            </span>
          </div>
          <div style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.78rem", lineHeight: 1.5 }}>
            {diff.map((d, idx) => (
              <div
                key={idx}
                style={{
                  background:
                    d.t === "add"
                      ? "rgba(124,217,146,0.12)"
                      : d.t === "del"
                        ? "rgba(224,108,117,0.12)"
                        : "transparent",
                  color:
                    d.t === "same"
                      ? "rgba(255,255,255,0.5)"
                      : d.t === "add"
                        ? "#cdeccd"
                        : "#f0c5c9",
                  whiteSpace: "pre-wrap",
                  padding: "0 6px",
                  borderLeft:
                    d.t === "add"
                      ? "2px solid #7cd992"
                      : d.t === "del"
                        ? "2px solid #e06c75"
                        : "2px solid transparent",
                }}
              >
                {d.t === "add" ? "+ " : d.t === "del" ? "− " : "  "}
                {d.x || " "}
              </div>
            ))}
          </div>
        </div>
      );
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
        <a href="/classic" style={{ marginLeft: "auto", color: C.dim, fontSize: "0.78rem" }}>
          ← classic dashboard
        </a>
      </div>

      {/* explorer */}
      <div style={{ ...col, borderRight: `1px solid ${C.border}`, overflowY: "auto" }}>
        <NavItem label="📖 Full Manuscript" active={sel.type === "manuscript"} onClick={() => setSel({ type: "manuscript" })} />
        <NavItem
          label="⇄ Compare Versions"
          active={sel.type === "diff"}
          onClick={() => {
            const vers = story?.availableVersions || ["v1"];
            setDiffA(vers[0]);
            setDiffB(vers[vers.length - 1]);
            setSel({ type: "diff" });
          }}
        />
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
        {(story?.aspectReports || []).length > 0 && <Group title="Critique Lenses" />}
        {(story?.aspectReports || []).map((r: any) => (
          <NavItem
            key={r.aspect}
            label={`◔ ${r.aspect.replace(/_/g, " ")}`}
            active={sel.type === "aspect" && sel.id === r.aspect}
            onClick={() => setSel({ type: "aspect", id: r.aspect })}
            indent
          />
        ))}
      </div>

      {/* center: action bar + manuscript + copilot rail */}
      <div style={{ ...col, padding: 0, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={actionBar}>
          {contextActions.map((a, i) => (
            <button key={i} style={actionBtn} onClick={a.run} disabled={busy}>
              {a.label}
            </button>
          ))}
          <div
            style={{
              marginLeft: "auto",
              display: "flex",
              gap: 8,
              alignItems: "center",
            }}
          >
            {!editing && (
              <button
                style={actionBtn}
                onClick={() => {
                  setFrResult(null);
                  setFrApplied(false);
                  setFrScope(editableDoc() ? "document" : "story");
                  setFrOpen(true);
                }}
                title="Deterministic find & replace"
              >
                ⇎ Find/Replace
              </button>
            )}
            {editableDoc() && !editing && (
              <button style={actionBtn} onClick={startEdit} disabled={busy}>
                ✏ Edit
              </button>
            )}
            {editing && (
              <>
                <button style={sendBtn} onClick={saveEdit} disabled={saving}>
                  {saving ? "…saving" : "💾 Save"}
                </button>
                <button style={actionBtn} onClick={cancelEdit} disabled={saving}>
                  Cancel
                </button>
              </>
            )}
            {saveMsg && (
              <span
                style={{
                  color: saveMsg.startsWith("Saved") ? "#7cd992" : "#e06c75",
                  fontSize: "0.72rem",
                }}
              >
                {saveMsg}
              </span>
            )}
            <span style={{ color: C.dim, fontSize: "0.72rem" }}>
              {sel.type === "scene"
                ? `scene · ${sel.id}`
                : sel.type === "character"
                  ? `character · ${sel.id}`
                  : "project"}
            </span>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "32px 48px", fontSize: "1.02rem", color: C.text }}>
          {editing ? (
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              spellCheck
              style={{
                width: "100%",
                height: "100%",
                minHeight: "60vh",
                resize: "none",
                background: C.panel2,
                color: C.text,
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                padding: "16px 18px",
                fontFamily: "ui-monospace, monospace",
                fontSize: "0.92rem",
                lineHeight: 1.6,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          ) : (
            <>
              {(sel.type === "doc" ||
                sel.type === "aspect" ||
                sel.type === "diff") && (
                <button
                  onClick={() => setSel({ type: "manuscript" })}
                  style={{
                    background: "transparent",
                    color: C.accent,
                    border: `1px solid ${C.border}`,
                    borderRadius: 6,
                    padding: "4px 10px",
                    fontSize: "0.78rem",
                    cursor: "pointer",
                    marginBottom: 18,
                  }}
                >
                  ← Back to manuscript
                </button>
              )}
              {center()}
            </>
          )}
        </div>
        {/* copilot rail */}
        <div style={rail}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 12px",
              borderBottom: `1px solid ${C.border}`,
            }}
          >
            <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>
              Copilot
            </span>
            {chatId && (
              <span style={{ color: C.dim, fontSize: "0.68rem" }}>· saved</span>
            )}
            <button
              style={{ ...railBtn, marginLeft: "auto" }}
              onClick={newChat}
              title="Start a new conversation"
            >
              ＋ New
            </button>
            <button
              style={railBtn}
              onClick={() => {
                const next = !historyOpen;
                setHistoryOpen(next);
                if (next) refreshConvos();
              }}
              title="Conversation history"
            >
              🕘 History
            </button>
          </div>
          {historyOpen ? (
            <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px" }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                {(["active", "archived"] as const).map((t) => (
                  <button
                    key={t}
                    style={{
                      ...railBtn,
                      background:
                        historyTab === t ? C.accentSoft : "transparent",
                      color: historyTab === t ? "#e9d5ff" : C.dim,
                    }}
                    onClick={() => setHistoryTab(t)}
                  >
                    {t === "active"
                      ? `Active (${convos.length})`
                      : `Archived (${archivedConvos.length})`}
                  </button>
                ))}
              </div>
              {(historyTab === "active" ? convos : archivedConvos).length ===
              0 ? (
                <div style={{ color: C.dim, fontSize: "0.76rem" }}>
                  No {historyTab} conversations yet.
                </div>
              ) : (
                (historyTab === "active" ? convos : archivedConvos).map(
                  (c: any) => (
                    <div
                      key={c.id}
                      style={{
                        border: `1px solid ${C.border}`,
                        borderRadius: 8,
                        padding: "8px 10px",
                        marginBottom: 6,
                        background: c.id === chatId ? C.accentSoft : C.panel2,
                      }}
                    >
                      <div
                        style={{
                          fontSize: "0.8rem",
                          marginBottom: 4,
                          cursor: "pointer",
                        }}
                        onClick={() => loadChat(c.id)}
                        title="Open this conversation"
                      >
                        {c.title || "Untitled"}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          alignItems: "center",
                        }}
                      >
                        <span style={{ color: C.dim, fontSize: "0.66rem" }}>
                          {c.messageCount || 0} msg
                          {c.updatedAt
                            ? ` · ${new Date(c.updatedAt).toLocaleString()}`
                            : ""}
                        </span>
                        <button
                          style={{ ...railBtn, marginLeft: "auto" }}
                          onClick={() => loadChat(c.id)}
                        >
                          Open
                        </button>
                        {historyTab === "active" ? (
                          <button
                            style={railBtn}
                            onClick={() => chatAction("archive", c.id)}
                          >
                            Archive
                          </button>
                        ) : (
                          <button
                            style={railBtn}
                            onClick={() => chatAction("unarchive", c.id)}
                          >
                            Unarchive
                          </button>
                        )}
                        <button
                          style={{ ...railBtn, color: "#e06c75" }}
                          onClick={() => chatAction("delete", c.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ),
                )
              )}
            </div>
          ) : (
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
          )}
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

      {/* find / replace modal */}
      {frOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            paddingTop: "8vh",
            zIndex: 50,
          }}
          onClick={() => setFrOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 620,
              maxWidth: "92vw",
              maxHeight: "80vh",
              overflowY: "auto",
              background: C.panel,
              border: `1px solid ${C.border}`,
              borderRadius: 12,
              padding: "18px 20px",
              boxShadow: "0 18px 60px rgba(0,0,0,0.5)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                marginBottom: 14,
              }}
            >
              <span style={{ fontWeight: 700, color: C.accent }}>
                ⇎ Find &amp; Replace
              </span>
              <span
                style={{ marginLeft: 10, color: C.dim, fontSize: "0.72rem" }}
              >
                deterministic · backs up every file it changes
              </span>
              <button
                style={{
                  marginLeft: "auto",
                  background: "transparent",
                  border: "none",
                  color: C.dim,
                  cursor: "pointer",
                  fontSize: "1.1rem",
                }}
                onClick={() => setFrOpen(false)}
              >
                ✕
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <input
                value={frFind}
                onChange={(e) => setFrFind(e.target.value)}
                placeholder={frMode === "regex" ? "Find (regex)…" : "Find…"}
                style={frInput}
              />
              <input
                value={frReplace}
                onChange={(e) => setFrReplace(e.target.value)}
                placeholder="Replace with… (empty = delete the matches)"
                style={frInput}
              />

              <div
                style={{
                  display: "flex",
                  gap: 14,
                  flexWrap: "wrap",
                  alignItems: "center",
                  fontSize: "0.8rem",
                }}
              >
                <select
                  value={frMode}
                  onChange={(e) => setFrMode(e.target.value as any)}
                  style={selectStyle}
                >
                  <option value="whole-word" style={{ background: C.panel }}>
                    Whole word (safe for names)
                  </option>
                  <option value="literal" style={{ background: C.panel }}>
                    Literal substring
                  </option>
                  <option value="regex" style={{ background: C.panel }}>
                    Regex
                  </option>
                </select>

                <select
                  value={frScope}
                  onChange={(e) => setFrScope(e.target.value as any)}
                  style={selectStyle}
                >
                  <option
                    value="document"
                    disabled={!editableDoc()}
                    style={{ background: C.panel }}
                  >
                    This document
                  </option>
                  <option value="story" style={{ background: C.panel }}>
                    This story
                  </option>
                  <option value="all" style={{ background: C.panel }}>
                    All stories
                  </option>
                </select>

                <label
                  style={{
                    display: "flex",
                    gap: 6,
                    alignItems: "center",
                    color: C.dim,
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={frCase}
                    onChange={(e) => setFrCase(e.target.checked)}
                  />
                  Match case
                </label>
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button
                  style={actionBtn}
                  onClick={() => runFindReplace(false)}
                  disabled={frBusy || !frFind}
                >
                  {frBusy ? "…working" : "🔍 Preview"}
                </button>
                <button
                  style={sendBtn}
                  onClick={() => runFindReplace(true)}
                  disabled={frBusy || !frFind || !frResult || frResult.error}
                  title={
                    !frResult
                      ? "Preview first to see what will change"
                      : "Apply the changes"
                  }
                >
                  ✓ Apply
                </button>
              </div>

              {/* results */}
              {frResult && (
                <div
                  style={{
                    marginTop: 8,
                    borderTop: `1px solid ${C.border}`,
                    paddingTop: 10,
                    fontSize: "0.8rem",
                  }}
                >
                  {frResult.error ? (
                    <div style={{ color: "#e06c75" }}>⚠ {frResult.error}</div>
                  ) : (
                    <>
                      <div
                        style={{
                          color: frApplied ? "#7cd992" : C.text,
                          marginBottom: 8,
                        }}
                      >
                        {frApplied
                          ? `✓ Applied ${frResult.totalReplacements} replacement(s) across ${frResult.filesAffected} file(s). Backups kept.`
                          : `${frResult.totalMatches} match(es) in ${frResult.filesAffected} file(s) — nothing changed yet.`}
                      </div>
                      {(frResult.files || []).length === 0 ? (
                        <div style={{ color: C.dim }}>No matches.</div>
                      ) : (
                        (frResult.files || [])
                          .slice(0, 40)
                          .map((f: any, i: number) => (
                            <div key={i} style={{ marginBottom: 8 }}>
                              <div
                                style={{
                                  color: "rgba(255,255,255,0.7)",
                                  fontFamily: "ui-monospace, monospace",
                                  fontSize: "0.72rem",
                                }}
                              >
                                {f.path} — {f.replacements}/{f.matches}
                                {f.backup ? " · backed up" : ""}
                              </div>
                              {(f.samples || [])
                                .slice(0, 2)
                                .map((s: any, j: number) => (
                                  <div
                                    key={j}
                                    style={{
                                      fontSize: "0.72rem",
                                      lineHeight: 1.4,
                                      marginLeft: 8,
                                    }}
                                  >
                                    <span style={{ color: C.dim }}>
                                      L{s.line}:{" "}
                                    </span>
                                    <span style={{ color: "#f0c5c9" }}>
                                      {s.before.trim().slice(0, 90)}
                                    </span>
                                    <span style={{ color: C.dim }}> → </span>
                                    <span style={{ color: "#cdeccd" }}>
                                      {s.after.trim().slice(0, 90)}
                                    </span>
                                  </div>
                                ))}
                            </div>
                          ))
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
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
const frInput: any = {
  width: "100%",
  background: C.bg,
  color: C.text,
  border: `1px solid ${C.border}`,
  borderRadius: 6,
  padding: "9px 11px",
  fontSize: "0.88rem",
  outline: "none",
  boxSizing: "border-box",
};
const railBtn: any = {
  background: "transparent",
  color: C.dim,
  border: `1px solid ${C.border}`,
  borderRadius: 6,
  padding: "3px 8px",
  fontSize: "0.7rem",
  cursor: "pointer",
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
