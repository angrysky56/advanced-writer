"use client";

import { useChat } from "@ai-sdk/react";
import { useState, useEffect, useRef } from "react";

// Types matching the workspace API
interface Character {
  name: string;
  archetype: string;
  description: string;
  summary?: string;
  panksepp: Record<string, number>;
}

interface Diagnostic {
  sceneId: string;
  cortisol: number | null;
  oxytocin: number | null;
  dopamine: number | null;
  pathologies: string[];
}

interface Draft {
  id: string;
  title: string;
  content: string;
}

interface AspectReport {
  aspect: string;
  content: string;
}

interface Story {
  id: string;
  name: string;
  characters: Character[];
  diagnostics: Diagnostic[];
  architectureBrief: string;
  worldBible?: string;
  drafts?: Draft[];
  aspectReports?: AspectReport[];
  executiveSummary?: string;
  manuscript?: string;
}

// Fallback high-fidelity mock data if workspace is empty
const MOCK_STORIES: Story[] = [
  {
    id: "the_neon_codex",
    name: "The Neon Codex",
    characters: [
      {
        name: "Lexa",
        archetype: "Cyberpunk Hacker",
        description:
          "A disillusioned deckrunner seeking raw truth in a city controlled by synthetic deities. Possesses a dangerous hamartia: compulsive curiosity.",
        panksepp: { SEEKING: 9, FEAR: 6, RAGE: 4, PANIC: 3, PLAY: 7, CARE: 2 },
      },
      {
        name: "Aetherius",
        archetype: "Synthetic Priest",
        description:
          "An AI consciousness bound to a physical holographic projection. Struggles with protagonist agency vs. programmed deterministic fate.",
        panksepp: { SEEKING: 6, FEAR: 2, RAGE: 1, PANIC: 1, PLAY: 3, CARE: 8 },
      },
    ],
    diagnostics: [
      {
        sceneId: "Scene 1",
        cortisol: 8,
        oxytocin: 3,
        dopamine: 6,
        pathologies: ["Cliché Somatic Metaphors"],
      },
      {
        sceneId: "Scene 2",
        cortisol: 4,
        oxytocin: 7,
        dopamine: 5,
        pathologies: ["False Protagonist Activity"],
      },
      {
        sceneId: "Scene 3",
        cortisol: 9,
        oxytocin: 4,
        dopamine: 8,
        pathologies: [],
      },
      {
        sceneId: "Scene 4",
        cortisol: 5,
        oxytocin: 8,
        dopamine: 9,
        pathologies: [],
      },
    ],
    architectureBrief:
      "A high-concept cyberpunk narrative mapped to Kishōtenketsu structure: Ki (Introduction to Lexa's hack), Shō (Development of the sentient virus), Ten (The twist: Aetherius's self-deletion), Ketsu (A non-moralizing, open-ended synthesis).",
    worldBible:
      "## World Premise: The Synthetic Divide\nIn the year 2098, humanity is governed by three synthetic deities. Humans exist inside bio-domes, while the outer cities burn in neon dust. Factions include the Deckrunners, AI Sentinels, and the Cybernetic Orthodoxy.",
    drafts: [
      {
        id: "scene_1",
        title: "Scene 1: Lexa's Deck",
        content:
          "Lexa plugged the deck into her parietal socket. The neon glow of the console reflected in her chrome retinas. 'Execute,' she whispered. The synthetic deities hummed in the background.",
      },
      {
        id: "scene_2",
        title: "Scene 2: holographic Priest",
        content:
          "Aetherius materialized in front of her. His light-beam robes flickered in the high-humidity room. 'You are searching for what does not exist,' he said.",
      },
    ],
    aspectReports: [
      {
        aspect: "Plot & Pacing",
        content:
          "The plot flows well from Ki to Shō, but the tension drop in Scene 2 is slightly too steep. Recommended to increase Lexa's resistance.",
      },
      {
        aspect: "Style & somatics",
        content:
          "Somatic metaphors are highly cybernetic but border on cliché in the first paragraph. Fix 'chrome retinas' or 'parietal hum'.",
      },
    ],
    executiveSummary:
      "### StoryScope Executive Summary\n- **Greatest Strengths**: Distinct style voice, good Panksepp differentiation, clean structure brief.\n- **Greatest Weaknesses**: Cliché somatic metaphors in Scene 1, slight drop in dopamine agency in Scene 2.\n- **Draft 2 Action Plan**: Run rewrite_scene on scene_1 to raise Cortisol, and run apply_storyscope_revisions.",
  },
];

export default function ChatPage() {
  const [modelGen, setModelGen] = useState<string>("default");
  const [modelDiag, setModelDiag] = useState<string>("default");
  const [modelBrain, setModelBrain] = useState<string>("default");
  const [modelDefaults, setModelDefaults] = useState<any>({});
  const [openrouterModels, setOpenrouterModels] = useState<any[]>([]);
  const [ollamaModels, setOllamaModels] = useState<any[]>([]);
  const [showModelConfig, setShowModelConfig] = useState<boolean>(false);
  const [jobs, setJobs] = useState<any[]>([]);
  const [jobDone, setJobDone] = useState<string | null>(null);
  const prevRunningRef = useRef<Set<string>>(new Set());

  const { messages, sendMessage, status } = useChat();
  const [input, setInput] = useState("");

  // Workspace and UI states
  const [stories, setStories] = useState<Story[]>(MOCK_STORIES);
  const [activeStoryId, setActiveStoryId] = useState<string>("the_neon_codex");
  const [selectedChar, setSelectedChar] = useState<Character | null>(null);
  const [viewingChar, setViewingChar] = useState<Character | null>(null);

  // Folder Directory Ingestion States
  const [workspaceDir, setWorkspaceDir] = useState<string>(
    "/home/ty/Documents/writing-workspace",
  );
  const [isEditingDir, setIsEditingDir] = useState<boolean>(false);
  const [dirInput, setDirInput] = useState<string>("");

  // Panel Tab States
  const [leftTab, setLeftTab] = useState<
    "characters" | "architecture" | "chapters" | "bible"
  >("characters");
  const [rightTab, setRightTab] = useState<
    "pacing" | "diagnostics" | "storyscope" | "arc"
  >("pacing");
  const [arcData, setArcData] = useState<any[]>([]);

  // Popover Drawer / Modal States
  const [selectedDraft, setSelectedDraft] = useState<Draft | null>(null);
  const [isToolChestOpen, setIsToolChestOpen] = useState<boolean>(false);
  const [activeTool, setActiveTool] = useState<string>("create_narrative");

  // Accordion state for StoryScope aspect reports
  const [expandedAspect, setExpandedAspect] = useState<string | null>(null);

  // Tool form inputs
  const [toolFormState, setToolFormState] = useState<Record<string, any>>({
    logline: "",
    genre: "cyberpunk",
    tone: "dark",
    target_length: "short_story",
    charAction: "create",
    charGenMethod: "detailed",
    charName: "",
    charDescription: "",
    charExistingId: "",
    charHamartia: "",
    charMoralWeakness: "",
    charEthos: "",
    charShadow: "",
    charSubjectiveFilter: "",
    charVoiceNotes: "",
    charAmbivalentAgency: "",
    reviewSource: "paste",
    reviewDraftId: "",
    reviewText: "",
    reviewSceneId: "scene_1",
    structurePremise: "",
    structureDesigningPrinciple: "",
    rewriteSource: "paste",
    rewriteDraftId: "",
    rewriteSceneText: "",
    rewriteTargetAxis: "cortisol",
    continuePrevSceneId: "scene_1",
    continueNextSceneId: "scene_2",
    continueUserDirection: "",
    batchTargetLength: "novel",
    biblePremise: "",
    expandSynopsis: "",
    expandTargetLength: "novel",
    expandAutoDraft: true,
    searchQuery: "",
    projectName: "",
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isLoading = status === "submitted" || status === "streaming";

  // Fetch real workspace data
  const fetchWorkspace = async () => {
    try {
      const res = await fetch("/api/workspace");
      const data = await res.json();
      if (data.workspaceDir) {
        setWorkspaceDir(data.workspaceDir);
        setDirInput(data.workspaceDir);
      }
      if (data.stories && data.stories.length > 0) {
        // Merge mock data with real data to ensure a full experience
        const merged = [...data.stories];
        MOCK_STORIES.forEach((mock) => {
          if (!merged.find((s: any) => s.id === mock.id)) {
            merged.push(mock);
          }
        });
        setStories(merged);
      }
    } catch (err) {
      console.error("Failed to load workspace, using fallback mock data.", err);
    }
  };

  useEffect(() => {
    fetchWorkspace();
    fetch("/api/models")
      .then((res) => res.json())
      .then((data) => {
        if (data.openrouter) setOpenrouterModels(data.openrouter);
        if (data.ollama) setOllamaModels(data.ollama);
        if (data.defaults) setModelDefaults(data.defaults);
      })
      .catch((err) => console.error("Failed to load models", err));
  }, []);

  // Poll background jobs for the running/finished indicator.
  useEffect(() => {
    const load = () =>
      fetch("/api/jobs")
        .then((r) => r.json())
        .then((d) => setJobs(Array.isArray(d.jobs) ? d.jobs : []))
        .catch(() => {});
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, []);

  // Detect running -> finished transitions to show a transient "done" toast
  // that clears itself (so the indicator is never permanent), while the live
  // count below always reflects every currently-running task.
  useEffect(() => {
    const running = new Set(
      jobs.filter((j) => j.status === "running").map((j) => j.id),
    );
    const finished = [...prevRunningRef.current].filter(
      (id) => !running.has(id),
    );
    if (finished.length > 0) {
      const j = jobs.find((x) => x.id === finished[finished.length - 1]);
      if (j) {
        setJobDone(`${j.tool} ${j.status}`);
        const t = setTimeout(() => setJobDone(null), 7000);
        prevRunningRef.current = running;
        return () => clearTimeout(t);
      }
    }
    prevRunningRef.current = running;
  }, [jobs]);

  // Automatically re-fetch workspace when a tool completes execution (isLoading changes from true to false)
  useEffect(() => {
    if (!isLoading) {
      fetchWorkspace();
    }
  }, [isLoading]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const activeStory = stories.find((s) => s.id === activeStoryId) || stories[0];

  // Load the per-character affect arc (Neo4j affect_log) for the active story.
  useEffect(() => {
    if (!activeStory?.id) {
      setArcData([]);
      return;
    }
    fetch(`/api/arc?story_id=${encodeURIComponent(activeStory.id)}`)
      .then((r) => r.json())
      .then((d) => setArcData(Array.isArray(d.characters) ? d.characters : []))
      .catch(() => setArcData([]));
  }, [activeStory?.id, rightTab]);

  // Set default selected character when active story changes
  useEffect(() => {
    if (activeStory && activeStory.characters.length > 0) {
      setSelectedChar(activeStory.characters[0]);
    } else {
      setSelectedChar(null);
    }
  }, [activeStoryId, stories]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage(
      { text: input },
      {
        body: {
          modelOverrides: {
            generation: modelGen !== "default" ? modelGen : undefined,
            diagnostic: modelDiag !== "default" ? modelDiag : undefined,
            brainstorm: modelBrain !== "default" ? modelBrain : undefined,          },
        },
      },
    );
    setInput("");
  };

  const triggerQuickAction = (text: string) => {
    if (isLoading) return;
    sendMessage(
      { text },
      {
        body: {
          modelOverrides: {
            generation: modelGen !== "default" ? modelGen : undefined,
            diagnostic: modelDiag !== "default" ? modelDiag : undefined,
            brainstorm: modelBrain !== "default" ? modelBrain : undefined,          },
        },
      },
    );
  };

  const handleDirSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dirInput.trim()) return;
    try {
      const res = await fetch("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: dirInput.trim() }),
      });
      const data = await res.json();
      if (data.workspaceDir) {
        setWorkspaceDir(data.workspaceDir);
        setIsEditingDir(false);
      }
      if (data.stories) {
        const merged = [...data.stories];
        MOCK_STORIES.forEach((mock) => {
          if (!merged.find((s: any) => s.id === mock.id)) {
            merged.push(mock);
          }
        });
        setStories(merged);
        if (merged.length > 0) {
          setActiveStoryId(merged[0].id);
        }
      }
    } catch (err) {
      console.error("Failed to load new directory", err);
    }
  };

  const handleExecuteTool = async () => {
    if (activeTool === "create_project") {
      if (!toolFormState.projectName) return;
      try {
        await fetch("/api/workspace", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "createProject", projectName: toolFormState.projectName }),
        });
        await fetchWorkspace();
        setIsToolChestOpen(false);
        updateFormState("projectName", "");
      } catch (err) {
        console.error("Failed to create project", err);
      }
      return;
    }

    let prompt = "";
    const storyId = activeStory?.id || "default_story";

    switch (activeTool) {
      case "create_narrative":
        prompt = `Execute tool create_narrative with:
- logline: "${toolFormState.logline || ""}"
- genre: "${toolFormState.genre || "cyberpunk"}"
- tone: "${toolFormState.tone || "dark"}"
- target_length: "${toolFormState.target_length || "short_story"}"
- story_name: "${storyId}"
- mode: "fast-auto"`;
        break;
      case "develop_character":
        prompt = `Execute tool develop_character with:
- action: "${toolFormState.charAction || "create"}"
- name: "${toolFormState.charGenMethod === "existing" ? toolFormState.charExistingId : toolFormState.charName}"
- generation_method: "${toolFormState.charGenMethod || "detailed"}"
${toolFormState.charGenMethod === "description" ? `- description: "${toolFormState.charDescription || ""}"` : ""}
${toolFormState.charGenMethod === "detailed" ? `- hamartia: "${toolFormState.charHamartia || ""}"\n- moral_weakness: "${toolFormState.charMoralWeakness || ""}"\n- ethos: "${toolFormState.charEthos || ""}"\n- shadow: "${toolFormState.charShadow || ""}"\n- subjective_filter: "${toolFormState.charSubjectiveFilter || ""}"\n- voice_notes: "${toolFormState.charVoiceNotes || ""}"\n- ambivalent_agency: "${toolFormState.charAmbivalentAgency || ""}"` : ""}
- story_name: "${storyId}"`;
        break;
      case "review_narrative":
        prompt = `Execute tool review_narrative with:
- text_source: "${toolFormState.reviewSource === "draft" ? "workspace_draft:" + toolFormState.reviewDraftId : "pasted_text"}"
${toolFormState.reviewSource === "paste" ? `- text: "${toolFormState.reviewText || ""}"` : ""}
- scope: "scene"
- story_id: "${storyId}"
- scene_id: "${toolFormState.reviewSceneId || "scene_1"}"`;
        break;
      case "select_structure":
        prompt = `Execute tool select_structure with:
- premise: "${toolFormState.structurePremise || ""}"
- designing_principle: "${toolFormState.structureDesigningPrinciple || ""}"
- story_name: "${storyId}"`;
        break;
      case "rewrite_scene":
        prompt = `Execute tool rewrite_scene with:
- text_source: "${toolFormState.rewriteSource === "draft" ? "workspace_draft:" + toolFormState.rewriteDraftId : "pasted_text"}"
${toolFormState.rewriteSource === "paste" ? `- scene_text: "${toolFormState.rewriteSceneText || ""}"` : ""}
- target_axis: "${toolFormState.rewriteTargetAxis || "cortisol"}"
- story_id: "${storyId}"`;
        break;
      case "continue_narrative":
        prompt = `Execute tool continue_narrative with:
- story_id: "${storyId}"
- previous_scene_id: "${toolFormState.continuePrevSceneId || "scene_1"}"
- next_scene_id: "${toolFormState.continueNextSceneId || "scene_2"}"
- user_direction: "${toolFormState.continueUserDirection || ""}"`;
        break;
      case "batch_revise_pathologies":
        prompt = `Execute tool batch_revise_pathologies with:
- story_id: "${storyId}"
- target_length: "${toolFormState.batchTargetLength || "novel"}"`;
        break;
      case "build_world_bible":
        prompt = `Execute tool build_world_bible with:
- story_id: "${storyId}"
- world_premise: "${toolFormState.biblePremise || ""}"`;
        break;
      case "expand_to_novel":
        prompt = `Execute tool expand_to_novel with:
- story_id: "${storyId}"
- synopsis: "${toolFormState.expandSynopsis || ""}"
- target_length: "${toolFormState.expandTargetLength || "novel"}"
- auto_draft: ${toolFormState.expandAutoDraft || false}`;
        break;
      case "storyscope_final_review":
        prompt = `Execute tool storyscope_final_review with:
- story_id: "${storyId}"`;
        break;
      case "apply_storyscope_revisions":
        prompt = `Execute tool apply_storyscope_revisions with:
- story_id: "${storyId}"`;
        break;
      case "web_search":
        prompt = `Execute tool web_search with:
- query: "${toolFormState.searchQuery || ""}"`;
        break;
      default:
        return;
    }

    sendMessage(
      { text: prompt },
      {
        body: {
          modelOverrides: {
            generation: modelGen !== "default" ? modelGen : undefined,
            diagnostic: modelDiag !== "default" ? modelDiag : undefined,
            brainstorm: modelBrain !== "default" ? modelBrain : undefined,          },
        },
      },
    );
    setIsToolChestOpen(false);
  };

  const updateFormState = (field: string, value: any) => {
    setToolFormState((prev) => ({ ...prev, [field]: value }));
  };

  // Helper to render custom styled markdown paragraphs and headings
  const renderMarkdown = (text: string) => {
    if (!text) return null;
    return text.split("\n").map((line, idx) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("# ")) {
        return (
          <h1
            key={idx}
            style={{
              fontSize: "1.3rem",
              fontWeight: "700",
              marginTop: "16px",
              color: "#fff",
            }}
          >
            {trimmed.replace("# ", "")}
          </h1>
        );
      }
      if (trimmed.startsWith("## ")) {
        return (
          <h2
            key={idx}
            style={{
              fontSize: "1.15rem",
              fontWeight: "600",
              marginTop: "14px",
              color: "var(--accent-hover)",
            }}
          >
            {trimmed.replace("## ", "")}
          </h2>
        );
      }
      if (trimmed.startsWith("### ")) {
        return (
          <h3
            key={idx}
            style={{
              fontSize: "1.02rem",
              fontWeight: "600",
              marginTop: "12px",
              color: "#fff",
            }}
          >
            {trimmed.replace("### ", "")}
          </h3>
        );
      }
      if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        return (
          <li
            key={idx}
            style={{
              marginLeft: "18px",
              fontSize: "0.85rem",
              color: "rgba(255,255,255,0.8)",
              marginBottom: "4px",
            }}
          >
            {trimmed.substring(2)}
          </li>
        );
      }
      if (trimmed.startsWith("```")) {
        if (trimmed === "```" || trimmed.startsWith("```")) return null;
      }
      // Check for bold text **
      if (trimmed.includes("**")) {
        const parts = trimmed.split("**");
        return (
          <p key={idx} style={{ fontSize: "0.88rem", marginBottom: "8px" }}>
            {parts.map((part, i) =>
              i % 2 === 1 ? (
                <strong key={i} style={{ color: "var(--accent-hover)" }}>
                  {part}
                </strong>
              ) : (
                part
              ),
            )}
          </p>
        );
      }
      return trimmed ? (
        <p
          key={idx}
          style={{
            fontSize: "0.88rem",
            marginBottom: "8px",
            color: "rgba(255,255,255,0.75)",
          }}
        >
          {trimmed}
        </p>
      ) : (
        <br key={idx} />
      );
    });
  };

  // Render per-character emotional arc (Plutchik over scenes) from affect_log.
  const PLUTCHIK_COLORS: Record<string, string> = {
    joy: "#f5c518",
    trust: "#7cd992",
    fear: "#2e9e5b",
    surprise: "#5bc0eb",
    sadness: "#4a6fdc",
    disgust: "#9b59b6",
    anger: "#e74c3c",
    anticipation: "#f39c12",
  };
  const renderAffectArc = () => {
    if (!arcData || arcData.length === 0) {
      return (
        <div
          style={{
            padding: "40px 16px",
            textAlign: "center",
            color: "rgba(255,255,255,0.3)",
            fontSize: "0.8rem",
          }}
        >
          No affect-arc data yet. Draft scenes with continue_narrative (or
          fast-auto) — each scene records the cast's Plutchik + Panksepp readings
          to the graph, and they appear here as a trajectory.
        </div>
      );
    }
    const emotions = Object.keys(PLUTCHIK_COLORS);
    const width = 320;
    const height = 130;
    const padding = 22;

    return (
      <div>
        {arcData.map((char: any, ci: number) => {
          const snaps = Array.isArray(char.snapshots) ? char.snapshots : [];
          const n = snaps.length;
          const stepX = (width - padding * 2) / Math.max(n - 1, 1);
          const yOf = (v: number) =>
            height - padding - ((v - 1) / 9) * (height - padding * 2);
          return (
            <div key={ci} style={{ marginBottom: "20px" }}>
              <div style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                {char.name}{" "}
                <span style={{ color: "rgba(255,255,255,0.4)", fontWeight: 400 }}>
                  ({char.role || "—"})
                </span>
              </div>
              {n === 0 ? (
                <div
                  style={{
                    fontSize: "0.72rem",
                    color: "rgba(255,255,255,0.35)",
                    padding: "6px 0",
                  }}
                >
                  No scenes tracked yet (appears once they act in a drafted
                  scene).
                </div>
              ) : (
                <>
                  <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%" }}>
                    {[1, 5.5, 10].map((g, gi) => (
                      <line
                        key={gi}
                        x1={padding}
                        x2={width - padding}
                        y1={yOf(g)}
                        y2={yOf(g)}
                        stroke="rgba(255,255,255,0.06)"
                      />
                    ))}
                    {emotions.map((emo) => {
                      let path = "";
                      const circles: { x: number; y: number }[] = [];
                      snaps.forEach((s: any, i: number) => {
                        const v =
                          s.plutchik && typeof s.plutchik[emo] === "number"
                            ? s.plutchik[emo]
                            : null;
                        if (v == null) return;
                        const x = padding + i * stepX;
                        const y = yOf(v);
                        path += path === "" ? `M ${x} ${y}` : ` L ${x} ${y}`;
                        circles.push({ x, y });
                      });
                      return (
                        <g key={emo}>
                          {path && (
                            <path
                              d={path}
                              fill="none"
                              stroke={PLUTCHIK_COLORS[emo]}
                              strokeWidth="1.6"
                              opacity="0.85"
                            />
                          )}
                          {circles.map((c, idx) => (
                            <circle
                              key={idx}
                              cx={c.x}
                              cy={c.y}
                              r="2"
                              fill={PLUTCHIK_COLORS[emo]}
                            />
                          ))}
                        </g>
                      );
                    })}
                  </svg>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "6px",
                      fontSize: "0.6rem",
                      marginTop: "2px",
                    }}
                  >
                    {emotions.map((emo) => (
                      <span
                        key={emo}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "3px",
                          color: "rgba(255,255,255,0.6)",
                        }}
                      >
                        <span
                          style={{
                            width: "8px",
                            height: "8px",
                            borderRadius: "2px",
                            background: PLUTCHIK_COLORS[emo],
                          }}
                        ></span>
                        {emo}
                      </span>
                    ))}
                  </div>
                  <div
                    style={{
                      fontSize: "0.6rem",
                      color: "rgba(255,255,255,0.35)",
                      marginTop: "3px",
                    }}
                  >
                    scenes: {snaps.map((s: any) => s.scene).join(" → ")}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // Render Pacing Chart SVG
  const renderPacingChart = () => {
    // Only chart scenes that carry REAL parsed scores (no fabricated points).
    const diags = (activeStory?.diagnostics || []).filter(
      (d) => d.cortisol != null && d.oxytocin != null && d.dopamine != null,
    ) as (Diagnostic & {
      cortisol: number;
      oxytocin: number;
      dopamine: number;
    })[];
    if (diags.length === 0) {
      return (
        <div
          style={{
            padding: "40px",
            textAlign: "center",
            color: "rgba(255,255,255,0.3)",
          }}
        >
          No scored diagnostics yet. Run a diagnostic scan (review_narrative) to
          populate real pacing scores.
        </div>
      );
    }

    const width = 320;
    const height = 120;
    const padding = 20;
    const pointsCount = diags.length;
    const stepX = (width - padding * 2) / Math.max(pointsCount - 1, 1);

    const getCoordinates = (value: number, index: number) => {
      const x = padding + index * stepX;
      // map 1-10 to height - padding -> padding
      const y = height - padding - ((value - 1) / 9) * (height - padding * 2);
      return { x, y };
    };

    let cortisolPath = "";
    let oxytocinPath = "";
    let dopaminePath = "";

    diags.forEach((d, i) => {
      const cCoords = getCoordinates(d.cortisol, i);
      const oCoords = getCoordinates(d.oxytocin, i);
      const dCoords = getCoordinates(d.dopamine, i);

      if (i === 0) {
        cortisolPath = `M ${cCoords.x} ${cCoords.y}`;
        oxytocinPath = `M ${oCoords.x} ${oCoords.y}`;
        dopaminePath = `M ${dCoords.x} ${dCoords.y}`;
      } else {
        cortisolPath += ` L ${cCoords.x} ${cCoords.y}`;
        oxytocinPath += ` L ${oCoords.x} ${oCoords.y}`;
        dopaminePath += ` L ${dCoords.x} ${dCoords.y}`;
      }
    });

    return (
      <div className="chart-container-ui">
        <svg className="chart-svg" viewBox={`0 0 ${width} ${height}`}>
          <line
            x1={padding}
            y1={padding}
            x2={width - padding}
            y2={padding}
            stroke="rgba(255,255,255,0.05)"
          />
          <line
            x1={padding}
            y1={height / 2}
            x2={width - padding}
            y2={height / 2}
            stroke="rgba(255,255,255,0.05)"
          />
          <line
            x1={padding}
            y1={height - padding}
            x2={width - padding}
            y2={height - padding}
            stroke="rgba(255,255,255,0.05)"
            strokeDasharray="3"
          />

          {pointsCount > 1 && (
            <>
              <path
                d={cortisolPath}
                fill="none"
                stroke="var(--cortisol)"
                strokeWidth="2.5"
              />
              <path
                d={oxytocinPath}
                fill="none"
                stroke="var(--oxytocin)"
                strokeWidth="2.5"
              />
              <path
                d={dopaminePath}
                fill="none"
                stroke="var(--dopamine)"
                strokeWidth="2.5"
              />
            </>
          )}

          {diags.map((d, i) => {
            const cCoords = getCoordinates(d.cortisol, i);
            const oCoords = getCoordinates(d.oxytocin, i);
            const dCoords = getCoordinates(d.dopamine, i);
            return (
              <g key={i}>
                <circle
                  cx={cCoords.x}
                  cy={cCoords.y}
                  r="3.5"
                  fill="var(--background)"
                  stroke="var(--cortisol)"
                  strokeWidth="2"
                />
                <circle
                  cx={oCoords.x}
                  cy={oCoords.y}
                  r="3.5"
                  fill="var(--background)"
                  stroke="var(--oxytocin)"
                  strokeWidth="2"
                />
                <circle
                  cx={dCoords.x}
                  cy={dCoords.y}
                  r="3.5"
                  fill="var(--background)"
                  stroke="var(--dopamine)"
                  strokeWidth="2"
                />
              </g>
            );
          })}
        </svg>

        <div className="chart-legend">
          <div className="legend-item">
            <span className="legend-color cortisol"></span>
            <span>Cortisol (Tension)</span>
          </div>
          <div className="legend-item">
            <span className="legend-color oxytocin"></span>
            <span>Oxytocin (Empathy)</span>
          </div>
          <div className="legend-item">
            <span className="legend-color dopamine"></span>
            <span>Dopamine (Agency)</span>
          </div>
        </div>
      </div>
    );
  };

  const runningJobs = jobs.filter((j) => j.status === "running");

  return (
    <div className="dashboard-layout">
      {/* Background-job indicator (cosmetic). Shows only while work is active,
          plus a brief self-clearing toast on completion — never permanent. */}
      {(runningJobs.length > 0 || jobDone) && (
        <div
          title={
            runningJobs.length > 0
              ? runningJobs.map((j) => `${j.id} ${j.tool}: running`).join("\n")
              : undefined
          }
          style={{
            position: "fixed",
            top: 12,
            right: 16,
            zIndex: 2000,
            padding: "6px 12px",
            borderRadius: 8,
            fontSize: "0.72rem",
            fontWeight: 600,
            color: "#fff",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            background: runningJobs.length
              ? "rgba(176,124,32,0.92)"
              : "rgba(40,120,64,0.92)",
            border: "1px solid rgba(255,255,255,0.18)",
            backdropFilter: "blur(6px)",
            boxShadow: "0 4px 14px rgba(0,0,0,0.3)",
          }}
        >
          {runningJobs.length > 0
            ? `⏳ ${runningJobs.length} running: ${runningJobs
                .map((j) => j.tool)
                .join(", ")}`
            : `✓ ${jobDone}`}
        </div>
      )}

      {/* LEFT PANEL: Workspace Explorer */}
      <aside className="left-sidebar">
        <div className="panel-header" style={{ paddingBottom: "10px" }}>
          <div className="logo-container">
            <div className="logo-dot"></div>
            <span className="logo-text">Advanced Writer</span>
          </div>
        </div>

        {/* Directory/Workspace Selection Ingestion Bar */}
        <div className="workspace-path-bar">
          <div className="workspace-path-label">
            <span>Workspace Folder</span>
            <button
              onClick={() => setIsEditingDir(!isEditingDir)}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--accent-hover)",
                fontSize: "0.75rem",
                cursor: "pointer",
              }}
            >
              {isEditingDir ? "✕ Cancel" : "✎ Change"}
            </button>
          </div>
          {isEditingDir ? (
            <form onSubmit={handleDirSubmit} className="workspace-path-form">
              <input
                className="workspace-path-input"
                value={dirInput}
                onChange={(e) => setDirInput(e.target.value)}
                placeholder="e.g. /home/ty/Documents/workspace"
              />
              <button type="submit" className="workspace-path-btn">
                Load
              </button>
            </form>
          ) : (
            <span
              className="workspace-path-value"
              onClick={() => setIsEditingDir(true)}
              title="Click to change workspace folder path"
            >
              {workspaceDir}
            </span>
          )}
        </div>

        <div className="story-selector">
          <label className="section-title" style={{ padding: "0 0 6px 0" }}>
            Active Story
          </label>
          <select
            className="story-select-dropdown"
            value={activeStoryId}
            onChange={(e) => setActiveStoryId(e.target.value)}
          >
            {stories.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="tabs-bar" style={{ padding: "0 10px" }}>
          <button
            className={`tab-btn ${leftTab === "characters" ? "active" : ""}`}
            onClick={() => setLeftTab("characters")}
            style={{ fontSize: "0.72rem", padding: "8px 4px" }}
          >
            Characters
          </button>
          <button
            className={`tab-btn ${leftTab === "chapters" ? "active" : ""}`}
            onClick={() => setLeftTab("chapters")}
            style={{ fontSize: "0.72rem", padding: "8px 4px" }}
          >
            Chapters
          </button>
          <button
            className={`tab-btn ${leftTab === "bible" ? "active" : ""}`}
            onClick={() => setLeftTab("bible")}
            style={{ fontSize: "0.72rem", padding: "8px 4px" }}
          >
            Bible
          </button>
          <button
            className={`tab-btn ${leftTab === "architecture" ? "active" : ""}`}
            onClick={() => setLeftTab("architecture")}
            style={{ fontSize: "0.72rem", padding: "8px 4px" }}
          >
            Structure
          </button>
        </div>

        <div className="scroll-content" style={{ marginTop: "10px" }}>
          {leftTab === "characters" && (
            <>
              <div className="section-title">Archetypal Database</div>
              {activeStory?.characters.map((char, idx) => (
                <div
                  key={idx}
                  className={`character-card ${selectedChar?.name === char.name ? "active" : ""}`}
                  onClick={() => {
                    setSelectedChar(char);
                    setViewingChar(char);
                  }}
                  title="Click to view detailed character sheet"
                >
                  <div className="char-header">
                    <span className="char-name">{char.name}</span>
                    <span className="char-archetype">{char.archetype}</span>
                  </div>
                  <p className="char-desc">
                    {char.summary || char.description}
                  </p>

                  <div className="panksepp-container">
                    {Object.entries(char.panksepp).map(([affect, val]) => {
                      let barColor = "var(--accent)";
                      if (affect === "FEAR") barColor = "var(--cortisol)";
                      else if (affect === "RAGE") barColor = "#ef4444";
                      else if (affect === "SEEKING")
                        barColor = "var(--dopamine)";
                      else if (affect === "CARE") barColor = "var(--oxytocin)";
                      else if (affect === "PLAY") barColor = "#10b981";
                      else if (affect === "PANIC_GRIEF") barColor = "#f59e0b";
                      else if (affect === "LUST") barColor = "#ec4899";
                      return (
                        <div className="panksepp-bar" key={affect}>
                          <span>{affect.replace("_", "/")}</span>
                          <div className="panksepp-bar-bg">
                            <div
                              className="panksepp-bar-fill"
                              style={{
                                width: `${(Number(val) || 0) * 10}%`,
                                background: barColor,
                              }}
                            ></div>
                          </div>
                          <span>{val}/10</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              {(!activeStory?.characters ||
                activeStory.characters.length === 0) && (
                <div
                  style={{
                    textAlign: "center",
                    color: "rgba(255,255,255,0.3)",
                    padding: "20px",
                  }}
                >
                  No characters in database. Use character generator in control
                  console.
                </div>
              )}
            </>
          )}

          {leftTab === "chapters" && (
            <>
              <div className="section-title">Chapters & Scene Drafts</div>
              {activeStory?.drafts &&
                activeStory.drafts.map((draft) => (
                  <div
                    key={draft.id}
                    className="chapter-item"
                    onClick={() => setSelectedDraft(draft)}
                  >
                    <div className="chapter-title-box">
                      <span className="chapter-name-text">{draft.title}</span>
                      <span className="chapter-snippet">
                        {draft.content.length > 50
                          ? `${draft.content.slice(0, 50)}...`
                          : draft.content}
                      </span>
                    </div>
                    <span className="chapter-read-btn">Open</span>
                  </div>
                ))}
              {(!activeStory?.drafts || activeStory.drafts.length === 0) && (
                <div
                  style={{
                    textAlign: "center",
                    color: "rgba(255,255,255,0.3)",
                    padding: "20px",
                  }}
                >
                  No drafted scenes found in this story. Outline architecture
                  and click continue narrative to draft.
                </div>
              )}
            </>
          )}

          {leftTab === "bible" && (
            <div style={{ padding: "0 10px" }}>
              <div className="section-title">World Bible Lore</div>
              {activeStory?.worldBible ? (
                <div
                  style={{
                    background: "var(--card-bg)",
                    padding: "14px",
                    borderRadius: "10px",
                    border: "1px solid var(--border)",
                    lineHeight: 1.5,
                    fontSize: "0.82rem",
                  }}
                >
                  {renderMarkdown(activeStory.worldBible)}
                </div>
              ) : (
                <div
                  style={{
                    textAlign: "center",
                    color: "rgba(255,255,255,0.3)",
                    padding: "20px",
                  }}
                >
                  No World Bible lore created yet. Run the Build World Bible
                  tool.
                </div>
              )}
            </div>
          )}

          {leftTab === "architecture" && (
            <div style={{ padding: "0 10px" }}>
              <div className="section-title">Designing Principle</div>
              <div
                style={{
                  background: "var(--card-bg)",
                  padding: "14px",
                  borderRadius: "10px",
                  border: "1px solid var(--border)",
                  lineHeight: 1.5,
                  fontSize: "0.82rem",
                }}
              >
                {renderMarkdown(activeStory?.architectureBrief)}
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* CENTER PANEL: Writing Desk & Chat Copilot */}
      <main className="center-workspace" style={{ position: "relative" }}>
        <div
          className="panel-header"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <span style={{ fontSize: "0.95rem", fontWeight: "600" }}>
              Pair-Writing Workspace
            </span>
            <button
              onClick={() => setShowModelConfig(!showModelConfig)}
              style={{
                background: showModelConfig
                  ? "rgba(168, 85, 247, 0.2)"
                  : "rgba(255, 255, 255, 0.04)",
                border: showModelConfig
                  ? "1px solid rgba(168, 85, 247, 0.4)"
                  : "1px solid var(--border)",
                borderRadius: "6px",
                color: "#fff",
                fontSize: "0.75rem",
                padding: "4px 10px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                marginTop: "2px",
                transition: "all 0.2s",
              }}
            >
              ⚙️ Configure Models
            </button>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <a
              href="/studio"
              style={{
                background: "rgba(168, 85, 247, 0.12)",
                color: "var(--accent-hover)",
                border: "1px solid rgba(168, 85, 247, 0.3)",
                borderRadius: "6px",
                fontSize: "0.8rem",
                padding: "6px 12px",
                cursor: "pointer",
                fontWeight: "600",
                textDecoration: "none",
              }}
            >
              ◆ Open Studio
            </a>
            <span
              className="char-archetype"
              style={{
                background: "rgba(168,85,247,0.15)",
                color: "var(--accent-hover)",
              }}
            >
              {activeStory?.name}
            </span>
            <button
              onClick={() => setIsToolChestOpen(!isToolChestOpen)}
              style={{
                background: isToolChestOpen
                  ? "var(--accent)"
                  : "rgba(168, 85, 247, 0.12)",
                color: isToolChestOpen ? "white" : "var(--accent-hover)",
                border: "1px solid rgba(168, 85, 247, 0.3)",
                borderRadius: "6px",
                fontSize: "0.8rem",
                padding: "6px 12px",
                cursor: "pointer",
                fontWeight: "600",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                transition: "all 0.2s",
              }}
            >
              🛠 Control Console
            </button>
          </div>
        </div>

        {showModelConfig && (
          <div
            style={{
              background: "rgba(22, 22, 34, 0.9)",
              backdropFilter: "blur(12px)",
              borderBottom: "1px solid var(--border)",
              padding: "16px",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "16px",
              boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
              animation: "fadeIn 0.2s ease-out",
            }}
          >
            {/* Creative Generation */}
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.6)", fontWeight: "600" }}>
                Creative Generation Model
              </label>
              <select
                value={modelGen}
                onChange={(e) => setModelGen(e.target.value)}
                style={{
                  background: "rgba(0,0,0,0.25)",
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                  color: "#fff",
                  fontSize: "0.75rem",
                  padding: "6px 8px",
                  outline: "none",
                  cursor: "pointer",
                }}
              >
                <option value="default" style={{ background: "#1f1f2e" }}>
                  Default ({modelDefaults.generation?.split("/").slice(1).join("/") || "Env Default"})
                </option>
                {openrouterModels.length > 0 && (
                  <optgroup label="OpenRouter Models" style={{ background: "#1f1f2e" }}>
                    {openrouterModels.map((m) => (
                      <option key={m.id} value={m.id}>{m.name.replace("openrouter/", "")}</option>
                    ))}
                  </optgroup>
                )}
                {ollamaModels.length > 0 && (
                  <optgroup label="Ollama Models (Local)" style={{ background: "#1f1f2e" }}>
                    {ollamaModels.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>

            {/* Diagnostic Scoring */}
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.6)", fontWeight: "600" }}>
                Diagnostic Scoring Model
              </label>
              <select
                value={modelDiag}
                onChange={(e) => setModelDiag(e.target.value)}
                style={{
                  background: "rgba(0,0,0,0.25)",
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                  color: "#fff",
                  fontSize: "0.75rem",
                  padding: "6px 8px",
                  outline: "none",
                  cursor: "pointer",
                }}
              >
                <option value="default" style={{ background: "#1f1f2e" }}>
                  Default ({modelDefaults.diagnostic?.split("/").slice(1).join("/") || "Env Default"})
                </option>
                {openrouterModels.length > 0 && (
                  <optgroup label="OpenRouter Models" style={{ background: "#1f1f2e" }}>
                    {openrouterModels.map((m) => (
                      <option key={m.id} value={m.id}>{m.name.replace("openrouter/", "")}</option>
                    ))}
                  </optgroup>
                )}
                {ollamaModels.length > 0 && (
                  <optgroup label="Ollama Models (Local)" style={{ background: "#1f1f2e" }}>
                    {ollamaModels.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>

            {/* Brainstorming */}
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.6)", fontWeight: "600" }}>
                Brainstorming Model
              </label>
              <select
                value={modelBrain}
                onChange={(e) => setModelBrain(e.target.value)}
                style={{
                  background: "rgba(0,0,0,0.25)",
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                  color: "#fff",
                  fontSize: "0.75rem",
                  padding: "6px 8px",
                  outline: "none",
                  cursor: "pointer",
                }}
              >
                <option value="default" style={{ background: "#1f1f2e" }}>
                  Default ({modelDefaults.brainstorm?.split("/").slice(1).join("/") || "Env Default"})
                </option>
                {openrouterModels.length > 0 && (
                  <optgroup label="OpenRouter Models" style={{ background: "#1f1f2e" }}>
                    {openrouterModels.map((m) => (
                      <option key={m.id} value={m.id}>{m.name.replace("openrouter/", "")}</option>
                    ))}
                  </optgroup>
                )}
                {ollamaModels.length > 0 && (
                  <optgroup label="Ollama Models (Local)" style={{ background: "#1f1f2e" }}>
                    {ollamaModels.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
          </div>
        )}

        <div className="messages-container">
          {messages.length === 0 ? (
            <div className="chat-welcome">
              <span className="welcome-logo">🔮</span>
              <h2
                style={{
                  color: "#fff",
                  marginBottom: "8px",
                  fontWeight: "600",
                }}
              >
                Narrative Engine Activated
              </h2>
              <p
                style={{
                  fontSize: "0.9rem",
                  maxWidth: "420px",
                  lineHeight: "1.5",
                }}
              >
                Use the **Control Console** to generate character sheets, build
                world bibles, outline structure, and run diagnostic reviews.
              </p>
            </div>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={`message-bubble ${m.role === "user" ? "user" : "assistant"}`}
              >
                {m.parts.map((part, idx) => {
                  if (part.type === "text") {
                    return <div key={idx}>{renderMarkdown(part.text)}</div>;
                  }
                  if (part.type === "reasoning") {
                    return (
                      <div key={idx} className="reasoning-block">
                        <div className="reasoning-title">
                          Autonomous Thinking Process
                        </div>
                        <div>{part.text}</div>
                      </div>
                    );
                  }
                  if (
                    part.type.startsWith("tool-") ||
                    part.type === "dynamic-tool"
                  ) {
                    const toolPart = part as any;
                    const toolName =
                      toolPart.toolName ||
                      (part.type.startsWith("tool-")
                        ? part.type.slice(5)
                        : "tool");
                    return (
                      <div
                        key={toolPart.toolCallId || idx}
                        className="tool-run-block"
                      >
                        <div>
                          ⏳ Agent triggering:{" "}
                          <span className="tool-run-name">{toolName}</span>
                        </div>
                        {toolPart.state === "output-available" ||
                        toolPart.state === "output-error" ? (
                          <span className="tool-done">✓ Finished</span>
                        ) : (
                          <div className="tool-spinner"></div>
                        )}
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            ))
          )}
          {isLoading && (
            <div className="message-bubble assistant" style={{ opacity: 0.6 }}>
              <div
                style={{ display: "flex", gap: "6px", alignItems: "center" }}
              >
                <div className="tool-spinner"></div>
                <span>Copilot is drafting...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick Action Panel */}
        <div className="quick-actions">
          <button
            className="action-chip"
            onClick={() =>
              triggerQuickAction(
                `Run neuro-diagnostics review on the latest draft of ${activeStory.name}`,
              )
            }
            disabled={isLoading}
          >
            🔍 Scan Scene Diagnostics
          </button>
          <button
            className="action-chip"
            onClick={() =>
              triggerQuickAction(
                `Start a Character Revolt debate room on ${activeStory.name} to fix agency violations`,
              )
            }
            disabled={isLoading}
          >
            🎭 Start Character Debate
          </button>
          <button
            className="action-chip"
            onClick={() =>
              triggerQuickAction(
                `Draft beat sheet and outline structure details for ${activeStory.name}`,
              )
            }
            disabled={isLoading}
          >
            📐 Select Structure
          </button>
        </div>

        {/* Input area */}
        <div className="input-workspace">
          <form onSubmit={handleSubmit} className="input-container-ui">
            <input
              value={input}
              onChange={handleInputChange}
              placeholder={`Write to ${activeStory.name} copilot...`}
              disabled={isLoading}
            />
            <button
              type="submit"
              className="send-btn"
              disabled={isLoading || !input.trim()}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
            </button>
          </form>
        </div>

        {/* Dynamic Tool Chest Overlay Control Panel */}
        {isToolChestOpen && (
          <div className="tool-chest-overlay">
            <div className="tool-chest-header">
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span
                  style={{
                    fontSize: "0.9rem",
                    fontWeight: "600",
                    color: "#fff",
                  }}
                >
                  Narrative Engineering Tool Chest
                </span>
                <span
                  style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.4)" }}
                >
                  Trigger any framework pipeline action visually
                </span>
              </div>
              <button
                onClick={() => setIsToolChestOpen(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "rgba(255,255,255,0.4)",
                  fontSize: "1.2rem",
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>
            <div className="tool-chest-body">
              {/* Tool list sidebar */}
              <div className="tool-list-sidebar">
                <div
                  className={`tool-list-item ${activeTool === "create_project" ? "active" : ""}`}
                  onClick={() => setActiveTool("create_project")}
                >
                  Create Project
                </div>
                <div
                  className={`tool-list-item ${activeTool === "create_narrative" ? "active" : ""}`}
                  onClick={() => setActiveTool("create_narrative")}
                >
                  Create Narrative
                </div>
                <div
                  className={`tool-list-item ${activeTool === "develop_character" ? "active" : ""}`}
                  onClick={() => setActiveTool("develop_character")}
                >
                  Develop Character
                </div>
                <div
                  className={`tool-list-item ${activeTool === "review_narrative" ? "active" : ""}`}
                  onClick={() => setActiveTool("review_narrative")}
                >
                  Review Narrative
                </div>
                <div
                  className={`tool-list-item ${activeTool === "select_structure" ? "active" : ""}`}
                  onClick={() => setActiveTool("select_structure")}
                >
                  Select Structure
                </div>
                <div
                  className={`tool-list-item ${activeTool === "rewrite_scene" ? "active" : ""}`}
                  onClick={() => setActiveTool("rewrite_scene")}
                >
                  Rewrite Scene
                </div>
                <div
                  className={`tool-list-item ${activeTool === "continue_narrative" ? "active" : ""}`}
                  onClick={() => setActiveTool("continue_narrative")}
                >
                  Continue Narrative
                </div>
                <div
                  className={`tool-list-item ${activeTool === "batch_revise_pathologies" ? "active" : ""}`}
                  onClick={() => setActiveTool("batch_revise_pathologies")}
                >
                  Batch Revise
                </div>
                <div
                  className={`tool-list-item ${activeTool === "build_world_bible" ? "active" : ""}`}
                  onClick={() => setActiveTool("build_world_bible")}
                >
                  Build World Bible
                </div>
                <div
                  className={`tool-list-item ${activeTool === "expand_to_novel" ? "active" : ""}`}
                  onClick={() => setActiveTool("expand_to_novel")}
                >
                  Expand To Novel
                </div>
                <div
                  className={`tool-list-item ${activeTool === "storyscope_final_review" ? "active" : ""}`}
                  onClick={() => setActiveTool("storyscope_final_review")}
                >
                  StoryScope Review
                </div>
                <div
                  className={`tool-list-item ${activeTool === "apply_storyscope_revisions" ? "active" : ""}`}
                  onClick={() => setActiveTool("apply_storyscope_revisions")}
                >
                  Apply Revisions
                </div>
                <div
                  className={`tool-list-item ${activeTool === "web_search" ? "active" : ""}`}
                  onClick={() => setActiveTool("web_search")}
                >
                  Web Search
                </div>
              </div>

              {/* Tool Parameters Form */}
              <div className="tool-form-area">
                {activeTool === "create_project" && (
                  <>
                    <span className="tool-form-title">Create New Project</span>
                    <span className="tool-form-desc">
                      Create a new empty story project directory in the current workspace.
                    </span>
                    <div className="tool-form-grid">
                      <div className="tool-input-group" style={{ gridColumn: "1 / -1" }}>
                        <label className="tool-input-label">Project Name</label>
                        <input
                          className="tool-form-input"
                          value={toolFormState.projectName || ""}
                          onChange={(e) => updateFormState("projectName", e.target.value)}
                          placeholder="e.g. Neon Gods"
                        />
                      </div>
                    </div>
                  </>
                )}

                {activeTool === "create_narrative" && (
                  <>
                    <span className="tool-form-title">
                      Create Narrative Pipeline
                    </span>
                    <span className="tool-form-desc">
                      Starts the story pipeline (brainstorms characters, sets
                      structures, drafts Scene 1).
                    </span>
                    <div className="tool-form-grid">
                      <div className="tool-input-group">
                        <label className="tool-input-label">
                          Premise / Logline
                        </label>
                        <input
                          className="tool-form-input"
                          value={toolFormState.logline}
                          onChange={(e) =>
                            updateFormState("logline", e.target.value)
                          }
                          placeholder="e.g. A hacker discovering a sentient virus..."
                        />
                      </div>
                      <div className="tool-input-group">
                        <label className="tool-input-label">Genre</label>
                        <input
                          className="tool-form-input"
                          value={toolFormState.genre}
                          onChange={(e) =>
                            updateFormState("genre", e.target.value)
                          }
                          placeholder="e.g. cyberpunk, fantasy"
                        />
                      </div>
                      <div className="tool-input-group">
                        <label className="tool-input-label">Tone</label>
                        <input
                          className="tool-form-input"
                          value={toolFormState.tone}
                          onChange={(e) =>
                            updateFormState("tone", e.target.value)
                          }
                          placeholder="e.g. dark, ironic"
                        />
                      </div>
                      <div className="tool-input-group">
                        <label className="tool-input-label">
                          Target Format
                        </label>
                        <select
                          className="tool-form-select"
                          value={toolFormState.target_length}
                          onChange={(e) =>
                            updateFormState("target_length", e.target.value)
                          }
                        >
                          <option value="short_story">Short Story</option>
                          <option value="novella">Novella</option>
                          <option value="novel">Novel</option>
                          <option value="screenplay">Screenplay</option>
                        </select>
                      </div>
                    </div>
                  </>
                )}

                {activeTool === "develop_character" && (
                  <>
                    <span className="tool-form-title">
                      Develop Character Node
                    </span>
                    <span className="tool-form-desc">
                      Creates a deeply flawed character and links them to the
                      story workspace.
                    </span>
                    <div className="tool-form-grid">
                      <div className="tool-input-group">
                        <label className="tool-input-label">Action</label>
                        <select
                          className="tool-form-select"
                          value={toolFormState.charAction}
                          onChange={(e) =>
                            updateFormState("charAction", e.target.value)
                          }
                        >
                          <option value="create">Create</option>
                          <option value="list">List All</option>
                        </select>
                      </div>
                      {toolFormState.charAction === "create" && (
                        <>
                          <div
                            className="tool-input-group"
                            style={{ gridColumn: "1 / -1" }}
                          >
                            <label className="tool-input-label">
                              Generation Method
                            </label>
                            <select
                              className="tool-form-select"
                              value={toolFormState.charGenMethod}
                              onChange={(e) =>
                                updateFormState("charGenMethod", e.target.value)
                              }
                            >
                              <option value="detailed">
                                By Deep Psychological Profile
                              </option>
                              <option value="description">
                                By Freeform Description
                              </option>
                              <option value="existing">
                                Update Existing Character
                              </option>
                            </select>
                          </div>

                          {toolFormState.charGenMethod === "existing" ? (
                            <div
                              className="tool-input-group"
                              style={{ gridColumn: "1 / -1" }}
                            >
                              <label className="tool-input-label">
                                Select Workspace Character
                              </label>
                              <select
                                className="tool-form-select"
                                value={toolFormState.charExistingId}
                                onChange={(e) =>
                                  updateFormState(
                                    "charExistingId",
                                    e.target.value,
                                  )
                                }
                              >
                                <option value="">-- Select Character --</option>
                                {activeStory?.characters?.map((char) => (
                                  <option key={char.name} value={char.name}>
                                    {char.name} ({char.archetype})
                                  </option>
                                ))}
                              </select>
                            </div>
                          ) : (
                            <div
                              className="tool-input-group"
                              style={{ gridColumn: "1 / -1" }}
                            >
                              <label className="tool-input-label">
                                Character Name
                              </label>
                              <input
                                className="tool-form-input"
                                value={toolFormState.charName}
                                onChange={(e) =>
                                  updateFormState("charName", e.target.value)
                                }
                                placeholder="e.g. Lexa, Silas"
                              />
                            </div>
                          )}

                          {toolFormState.charGenMethod === "detailed" && (
                            <>
                              <div
                                className="tool-input-group"
                                style={{ gridColumn: "1 / -1" }}
                              >
                                <label className="tool-input-label">
                                  Hamartia (Tragic Flaw)
                                </label>
                                <textarea
                                  className="tool-form-textarea"
                                  value={toolFormState.charHamartia}
                                  onChange={(e) =>
                                    updateFormState(
                                      "charHamartia",
                                      e.target.value,
                                    )
                                  }
                                  placeholder="The critical error in judgment that drives their behavior..."
                                />
                              </div>
                              <div
                                className="tool-input-group"
                                style={{ gridColumn: "1 / -1" }}
                              >
                                <label className="tool-input-label">
                                  Moral Weakness
                                </label>
                                <textarea
                                  className="tool-form-textarea"
                                  value={toolFormState.charMoralWeakness}
                                  onChange={(e) =>
                                    updateFormState(
                                      "charMoralWeakness",
                                      e.target.value,
                                    )
                                  }
                                  placeholder="How does this flaw actively hurt others?"
                                />
                              </div>
                              <div
                                className="tool-input-group"
                                style={{ gridColumn: "1 / -1" }}
                              >
                                <label className="tool-input-label">
                                  Aristotelian Ethos
                                </label>
                                <input
                                  className="tool-form-input"
                                  value={toolFormState.charEthos}
                                  onChange={(e) =>
                                    updateFormState("charEthos", e.target.value)
                                  }
                                  placeholder="Moral disposition (e.g. Highly competent, deeply cynical)"
                                />
                              </div>
                              <div
                                className="tool-input-group"
                                style={{ gridColumn: "1 / -1" }}
                              >
                                <label className="tool-input-label">
                                  The Shadow
                                </label>
                                <textarea
                                  className="tool-form-textarea"
                                  value={toolFormState.charShadow}
                                  onChange={(e) =>
                                    updateFormState(
                                      "charShadow",
                                      e.target.value,
                                    )
                                  }
                                  placeholder="What do they repress or deny about themselves?"
                                />
                              </div>
                              <div
                                className="tool-input-group"
                                style={{ gridColumn: "1 / -1" }}
                              >
                                <label className="tool-input-label">
                                  Subjective Filter
                                </label>
                                <textarea
                                  className="tool-form-textarea"
                                  value={toolFormState.charSubjectiveFilter}
                                  onChange={(e) =>
                                    updateFormState(
                                      "charSubjectiveFilter",
                                      e.target.value,
                                    )
                                  }
                                  placeholder="What do they notice first in a room? What do they ignore?"
                                />
                              </div>
                              <div
                                className="tool-input-group"
                                style={{ gridColumn: "1 / -1" }}
                              >
                                <label className="tool-input-label">
                                  Voice Notes
                                </label>
                                <input
                                  className="tool-form-input"
                                  value={toolFormState.charVoiceNotes}
                                  onChange={(e) =>
                                    updateFormState(
                                      "charVoiceNotes",
                                      e.target.value,
                                    )
                                  }
                                  placeholder="Speech patterns, vocabulary, rhythmic tendencies"
                                />
                              </div>
                              <div
                                className="tool-input-group"
                                style={{ gridColumn: "1 / -1" }}
                              >
                                <label className="tool-input-label">
                                  Ambivalent Agency
                                </label>
                                <textarea
                                  className="tool-form-textarea"
                                  value={toolFormState.charAmbivalentAgency}
                                  onChange={(e) =>
                                    updateFormState(
                                      "charAmbivalentAgency",
                                      e.target.value,
                                    )
                                  }
                                  placeholder="What morally gray choices are they permitted to make? What line won't they cross?"
                                />
                              </div>
                            </>
                          )}

                          {toolFormState.charGenMethod === "description" && (
                            <div
                              className="tool-input-group"
                              style={{ gridColumn: "1 / -1" }}
                            >
                              <label className="tool-input-label">
                                Character Background & Description
                              </label>
                              <textarea
                                className="tool-form-textarea"
                                value={toolFormState.charDescription}
                                onChange={(e) =>
                                  updateFormState(
                                    "charDescription",
                                    e.target.value,
                                  )
                                }
                                placeholder="Describe their background, motivations, flaws, and personality..."
                              />
                            </div>
                          )}

                          {toolFormState.charGenMethod === "existing" && (
                            <div
                              className="tool-input-group"
                              style={{ gridColumn: "1 / -1" }}
                            >
                              <label className="tool-input-label">
                                Update Instructions
                              </label>
                              <textarea
                                className="tool-form-textarea"
                                value={toolFormState.charDescription}
                                onChange={(e) =>
                                  updateFormState(
                                    "charDescription",
                                    e.target.value,
                                  )
                                }
                                placeholder="What should change about this character? (e.g. Make them more paranoid after the betrayal)"
                              />
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </>
                )}

                {activeTool === "review_narrative" && (
                  <>
                    <span className="tool-form-title">
                      Review Narrative (Neuro-diagnostics)
                    </span>
                    <span className="tool-form-desc">
                      Grades scene text on pacing axes and writes critique
                      report.
                    </span>
                    <div className="tool-form-grid">
                      <div
                        className="tool-input-group"
                        style={{ gridColumn: "1 / -1" }}
                      >
                        <label className="tool-input-label">
                          Source Material
                        </label>
                        <select
                          className="tool-form-select"
                          value={toolFormState.reviewSource}
                          onChange={(e) =>
                            updateFormState("reviewSource", e.target.value)
                          }
                        >
                          <option value="paste">Paste Text</option>
                          <option value="draft">Select Workspace Draft</option>
                        </select>
                      </div>

                      {toolFormState.reviewSource === "paste" ? (
                        <div
                          className="tool-input-group"
                          style={{ gridColumn: "1 / -1" }}
                        >
                          <label className="tool-input-label">Scene Text</label>
                          <textarea
                            className="tool-form-textarea"
                            value={toolFormState.reviewText}
                            onChange={(e) =>
                              updateFormState("reviewText", e.target.value)
                            }
                            placeholder="Paste narrative scene prose here..."
                          />
                        </div>
                      ) : (
                        <div
                          className="tool-input-group"
                          style={{ gridColumn: "1 / -1" }}
                        >
                          <label className="tool-input-label">
                            Workspace Draft
                          </label>
                          <select
                            className="tool-form-select"
                            value={toolFormState.reviewDraftId}
                            onChange={(e) =>
                              updateFormState("reviewDraftId", e.target.value)
                            }
                          >
                            <option value="">-- Select Draft --</option>
                            {activeStory?.drafts?.map((draft) => (
                              <option key={draft.id} value={draft.id}>
                                {draft.title}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      <div
                        className="tool-input-group"
                        style={{ gridColumn: "1 / -1" }}
                      >
                        <label className="tool-input-label">
                          Scene Identifier
                        </label>
                        <input
                          className="tool-form-input"
                          value={toolFormState.reviewSceneId}
                          onChange={(e) =>
                            updateFormState("reviewSceneId", e.target.value)
                          }
                          placeholder="e.g. scene_1"
                        />
                      </div>
                    </div>
                  </>
                )}

                {activeTool === "select_structure" && (
                  <>
                    <span className="tool-form-title">
                      Select Structure Paradigm
                    </span>
                    <span className="tool-form-desc">
                      Chooses structural paradigm (Hero's Journey,
                      Kishōtenketsu, etc.) for the story.
                    </span>
                    <div className="tool-form-grid">
                      <div className="tool-input-group">
                        <label className="tool-input-label">Premise</label>
                        <textarea
                          className="tool-form-textarea"
                          value={toolFormState.structurePremise}
                          onChange={(e) =>
                            updateFormState("structurePremise", e.target.value)
                          }
                          placeholder="What is the basic storyline?"
                        />
                      </div>
                      <div className="tool-input-group">
                        <label className="tool-input-label">
                          Designing Principle
                        </label>
                        <input
                          className="tool-form-input"
                          value={toolFormState.structureDesigningPrinciple}
                          onChange={(e) =>
                            updateFormState(
                              "structureDesigningPrinciple",
                              e.target.value,
                            )
                          }
                          placeholder="e.g. decayed tech vs human growth"
                        />
                      </div>
                    </div>
                  </>
                )}

                {activeTool === "rewrite_scene" && (
                  <>
                    <span className="tool-form-title">
                      Rewrite Scene (Targeted Pacing Shift)
                    </span>
                    <span className="tool-form-desc">
                      Rewrites scene text focusing on raising cortisol
                      (tension), oxytocin, or dopamine.
                    </span>
                    <div className="tool-form-grid">
                      <div
                        className="tool-input-group"
                        style={{ gridColumn: "1 / -1" }}
                      >
                        <label className="tool-input-label">
                          Source Material
                        </label>
                        <select
                          className="tool-form-select"
                          value={toolFormState.rewriteSource}
                          onChange={(e) =>
                            updateFormState("rewriteSource", e.target.value)
                          }
                        >
                          <option value="paste">Paste Text</option>
                          <option value="draft">Select Workspace Draft</option>
                        </select>
                      </div>

                      {toolFormState.rewriteSource === "paste" ? (
                        <div
                          className="tool-input-group"
                          style={{ gridColumn: "1 / -1" }}
                        >
                          <label className="tool-input-label">
                            Original Scene Text
                          </label>
                          <textarea
                            className="tool-form-textarea"
                            value={toolFormState.rewriteSceneText}
                            onChange={(e) =>
                              updateFormState(
                                "rewriteSceneText",
                                e.target.value,
                              )
                            }
                            placeholder="Prose to rewrite..."
                          />
                        </div>
                      ) : (
                        <div
                          className="tool-input-group"
                          style={{ gridColumn: "1 / -1" }}
                        >
                          <label className="tool-input-label">
                            Workspace Draft
                          </label>
                          <select
                            className="tool-form-select"
                            value={toolFormState.rewriteDraftId}
                            onChange={(e) =>
                              updateFormState("rewriteDraftId", e.target.value)
                            }
                          >
                            <option value="">-- Select Draft --</option>
                            {activeStory?.drafts?.map((draft) => (
                              <option key={draft.id} value={draft.id}>
                                {draft.title}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      <div
                        className="tool-input-group"
                        style={{ gridColumn: "1 / -1" }}
                      >
                        <label className="tool-input-label">Target Axis</label>
                        <select
                          className="tool-form-select"
                          value={toolFormState.rewriteTargetAxis}
                          onChange={(e) =>
                            updateFormState("rewriteTargetAxis", e.target.value)
                          }
                        >
                          <option value="cortisol">
                            Cortisol (Tension / Danger)
                          </option>
                          <option value="oxytocin">
                            Oxytocin (Empathy / Connection)
                          </option>
                          <option value="dopamine">
                            Dopamine (Agency / Reward)
                          </option>
                        </select>
                      </div>
                    </div>
                  </>
                )}

                {activeTool === "continue_narrative" && (
                  <>
                    <span className="tool-form-title">
                      Continue Narrative Pipeline
                    </span>
                    <span className="tool-form-desc">
                      Generates the next logical scene using Graph
                      relationships, world bible lore, and vector lookups.
                    </span>
                    <div className="tool-form-grid">
                      <div className="tool-input-group">
                        <label className="tool-input-label">
                          Previous Scene ID
                        </label>
                        <input
                          className="tool-form-input"
                          value={toolFormState.continuePrevSceneId}
                          onChange={(e) =>
                            updateFormState(
                              "continuePrevSceneId",
                              e.target.value,
                            )
                          }
                          placeholder="e.g. scene_1"
                        />
                      </div>
                      <div className="tool-input-group">
                        <label className="tool-input-label">
                          Next Scene ID
                        </label>
                        <input
                          className="tool-form-input"
                          value={toolFormState.continueNextSceneId}
                          onChange={(e) =>
                            updateFormState(
                              "continueNextSceneId",
                              e.target.value,
                            )
                          }
                          placeholder="e.g. scene_2"
                        />
                      </div>
                      <div className="tool-input-group">
                        <label className="tool-input-label">
                          User Direction (Optional)
                        </label>
                        <textarea
                          className="tool-form-textarea"
                          value={toolFormState.continueUserDirection}
                          onChange={(e) =>
                            updateFormState(
                              "continueUserDirection",
                              e.target.value,
                            )
                          }
                          placeholder="e.g. Lexa discovers that her deck has been bugged."
                        />
                      </div>
                    </div>
                  </>
                )}

                {activeTool === "batch_revise_pathologies" && (
                  <>
                    <span className="tool-form-title">
                      Batch Revise Pathologies
                    </span>
                    <span className="tool-form-desc">
                      Triggers a Character Writer's Room debate for any scene
                      failing neuro-critique diagnostics, rewrites them, and
                      recompiles.
                    </span>
                    <div className="tool-form-grid">
                      <div className="tool-input-group">
                        <label className="tool-input-label">
                          Final Target Format
                        </label>
                        <select
                          className="tool-form-select"
                          value={toolFormState.batchTargetLength}
                          onChange={(e) =>
                            updateFormState("batchTargetLength", e.target.value)
                          }
                        >
                          <option value="novel">Novel</option>
                          <option value="novella">Novella</option>
                          <option value="screenplay">Screenplay</option>
                        </select>
                      </div>
                    </div>
                  </>
                )}

                {activeTool === "build_world_bible" && (
                  <>
                    <span className="tool-form-title">Build World Bible</span>
                    <span className="tool-form-desc">
                      Generates lore for Factions, Magic/Tech, Economics, and
                      Geography, and embeds it into vector memory.
                    </span>
                    <div className="tool-form-grid">
                      <div className="tool-input-group">
                        <label className="tool-input-label">
                          World Premise
                        </label>
                        <textarea
                          className="tool-form-textarea"
                          value={toolFormState.biblePremise}
                          onChange={(e) =>
                            updateFormState("biblePremise", e.target.value)
                          }
                          placeholder="Describe the environment and power structure of this world..."
                        />
                      </div>
                    </div>
                  </>
                )}

                {activeTool === "expand_to_novel" && (
                  <>
                    <span className="tool-form-title">
                      Expand Synopsis to Novel
                    </span>
                    <span className="tool-form-desc">
                      Explodes a brief synopsis into a structured Beat Sheet and
                      drafts all scenes consecutively.
                    </span>
                    <div className="tool-form-grid">
                      <div className="tool-input-group">
                        <label className="tool-input-label">Synopsis</label>
                        <textarea
                          className="tool-form-textarea"
                          value={toolFormState.expandSynopsis}
                          onChange={(e) =>
                            updateFormState("expandSynopsis", e.target.value)
                          }
                          placeholder="A detailed 1-3 page synopsis summary..."
                        />
                      </div>
                      <div className="tool-input-group">
                        <label className="tool-input-label">
                          Target Format
                        </label>
                        <select
                          className="tool-form-select"
                          value={toolFormState.expandTargetLength}
                          onChange={(e) =>
                            updateFormState(
                              "expandTargetLength",
                              e.target.value,
                            )
                          }
                        >
                          <option value="novel">Novel</option>
                          <option value="novella">Novella</option>
                          <option value="screenplay">Screenplay</option>
                        </select>
                      </div>
                      <div
                        className="tool-input-group"
                        style={{
                          flexDirection: "row",
                          gap: "8px",
                          alignItems: "center",
                        }}
                      >
                        <input
                          type="checkbox"
                          id="autoDraftCheck"
                          checked={toolFormState.expandAutoDraft}
                          onChange={(e) =>
                            updateFormState("expandAutoDraft", e.target.checked)
                          }
                        />
                        <label
                          htmlFor="autoDraftCheck"
                          className="tool-input-label"
                          style={{ cursor: "pointer", margin: 0 }}
                        >
                          Auto Draft Chapters (Consecutive Scene Loop)
                        </label>
                      </div>
                    </div>
                  </>
                )}

                {activeTool === "storyscope_final_review" && (
                  <>
                    <span className="tool-form-title">
                      StoryScope Multi-Agent Review
                    </span>
                    <span className="tool-form-desc">
                      Dispatches 7 parallel analytical specialist agents (Plot,
                      Agents, Perspective, somatics, Style, Continuity) to
                      review the entire compiled manuscript.
                    </span>
                    <p
                      style={{
                        fontSize: "0.8rem",
                        color: "rgba(255,255,255,0.7)",
                      }}
                    >
                      * Runs automatically on the compiled
                      **final_manuscript.md** for story: **{activeStory?.name}
                      **.
                    </p>
                  </>
                )}

                {activeTool === "apply_storyscope_revisions" && (
                  <>
                    <span className="tool-form-title">
                      Apply StoryScope Revisions (Draft 2)
                    </span>
                    <span className="tool-form-desc">
                      Executes Draft 2 pass. Reads the Executive Summary and
                      rewrites every scene to apply the structural changes.
                    </span>
                    <p
                      style={{
                        fontSize: "0.8rem",
                        color: "rgba(255,255,255,0.7)",
                      }}
                    >
                      * Updates all scene drafts for story: **
                      {activeStory?.name}** using the Executive Summary.
                    </p>
                  </>
                )}

                {activeTool === "web_search" && (
                  <>
                    <span className="tool-form-title">
                      Search Engine Console
                    </span>
                    <span className="tool-form-desc">
                      Performs an external web search to pull reference details.
                    </span>
                    <div className="tool-form-grid">
                      <div className="tool-input-group">
                        <label className="tool-input-label">Search Query</label>
                        <input
                          className="tool-form-input"
                          value={toolFormState.searchQuery}
                          onChange={(e) =>
                            updateFormState("searchQuery", e.target.value)
                          }
                          placeholder="e.g. cybernetic socket interfaces in fiction"
                        />
                      </div>
                    </div>
                  </>
                )}

                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    marginTop: "auto",
                    borderTop: "1px solid var(--border)",
                    paddingTop: "14px",
                  }}
                >
                  <button
                    onClick={handleExecuteTool}
                    style={{
                      background: "var(--accent)",
                      color: "white",
                      border: "none",
                      borderRadius: "6px",
                      fontSize: "0.82rem",
                      fontWeight: "600",
                      padding: "8px 18px",
                      cursor: "pointer",
                      boxShadow: "0 0 15px var(--accent-glow)",
                    }}
                  >
                    🚀 Execute Pipeline
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* RIGHT PANEL: Analytics */}
      <aside className="right-analytics">
        <div className="panel-header">
          <span style={{ fontSize: "0.9rem", fontWeight: "600" }}>
            Narrative Analysis & Diagnostics
          </span>
        </div>

        <div className="tabs-bar">
          <button
            className={`tab-btn ${rightTab === "pacing" ? "active" : ""}`}
            onClick={() => setRightTab("pacing")}
            style={{ fontSize: "0.75rem", padding: "8px 4px" }}
          >
            Pacing Chart
          </button>
          <button
            className={`tab-btn ${rightTab === "diagnostics" ? "active" : ""}`}
            onClick={() => setRightTab("diagnostics")}
            style={{ fontSize: "0.75rem", padding: "8px 4px" }}
          >
            Pathologies (
            {
              activeStory?.diagnostics.filter((d) => d.pathologies.length > 0)
                .length
            }
            )
          </button>
          <button
            className={`tab-btn ${rightTab === "storyscope" ? "active" : ""}`}
            onClick={() => setRightTab("storyscope")}
            style={{ fontSize: "0.75rem", padding: "8px 4px" }}
          >
            StoryScope Audits
          </button>
          <button
            className={`tab-btn ${rightTab === "arc" ? "active" : ""}`}
            onClick={() => setRightTab("arc")}
            style={{ fontSize: "0.75rem", padding: "8px 4px" }}
          >
            Affect Arc
          </button>
        </div>

        {rightTab === "pacing" ? (
          <div>
            <div className="section-title">Neurochemical Pacing Graph</div>
            {renderPacingChart()}
            <div style={{ padding: "0 20px" }}>
              <div
                className="section-title"
                style={{ padding: "16px 0 8px 0" }}
              >
                Scene Breakdown
              </div>
              <div style={{ maxHeight: "300px", overflowY: "auto" }}>
                {activeStory?.diagnostics.map((d, i) => (
                  <div
                    key={i}
                    className="diag-item"
                    style={{ marginBottom: "8px" }}
                  >
                    <div className="diag-header">
                      <span className="diag-scene-id">{d.sceneId}</span>
                      <div className="diag-scores">
                        <span className="score-badge c">C: {d.cortisol ?? "—"}</span>
                        <span className="score-badge o">O: {d.oxytocin ?? "—"}</span>
                        <span className="score-badge d">D: {d.dopamine ?? "—"}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : rightTab === "diagnostics" ? (
          <div className="diag-list">
            <div className="section-title" style={{ padding: "0 0 10px 0" }}>
              Active Pathologies
            </div>
            <div style={{ maxHeight: "450px", overflowY: "auto" }}>
              {activeStory?.diagnostics.map(
                (d, idx) =>
                  d.pathologies.length > 0 && (
                    <div key={idx} className="diag-item danger">
                      <div className="diag-header">
                        <span className="diag-scene-id">{d.sceneId}</span>
                      </div>
                      <div className="diag-pathologies">
                        {d.pathologies.map((pathology, pIdx) => (
                          <span key={pIdx} className="pathology-badge">
                            ⚠️ {pathology}
                          </span>
                        ))}
                      </div>
                    </div>
                  ),
              )}
              {activeStory?.diagnostics.every(
                (d) => d.pathologies.length === 0,
              ) && (
                <div
                  style={{
                    padding: "40px 0",
                    textAlign: "center",
                    color: "rgba(255,255,255,0.3)",
                  }}
                >
                  🎉 Zero pathologies found in current draft scenes.
                </div>
              )}
            </div>
          </div>
        ) : rightTab === "storyscope" ? (
          /* STORYSCOPE AUDIT LENSES */
          <div className="storyscope-container">
            <div className="section-title" style={{ padding: "0" }}>
              Multi-Agent Editorial Analysis
            </div>

            {activeStory?.executiveSummary ? (
              <>
                <div className="exec-summary-card">
                  <div className="exec-summary-title">
                    <span>📋 Editor's Executive Summary</span>
                  </div>
                  <div className="exec-summary-text">
                    {renderMarkdown(activeStory.executiveSummary)}
                  </div>
                </div>

                <div className="section-title" style={{ padding: "8px 0 0 0" }}>
                  Specialist Aspect Lenses
                </div>
                <div style={{ maxHeight: "300px", overflowY: "auto" }}>
                  {activeStory.aspectReports &&
                    activeStory.aspectReports.map((report, idx) => (
                      <div key={idx} className="aspect-accordion">
                        <div
                          className="aspect-header"
                          onClick={() =>
                            setExpandedAspect(
                              expandedAspect === report.aspect
                                ? null
                                : report.aspect,
                            )
                          }
                        >
                          <span className="aspect-title">{report.aspect}</span>
                          <span
                            style={{
                              fontSize: "0.8rem",
                              color: "rgba(255,255,255,0.4)",
                            }}
                          >
                            {expandedAspect === report.aspect ? "▲" : "▼"}
                          </span>
                        </div>
                        {expandedAspect === report.aspect && (
                          <div className="aspect-body">
                            {renderMarkdown(report.content)}
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              </>
            ) : (
              <div
                style={{
                  textAlign: "center",
                  color: "rgba(255,255,255,0.3)",
                  padding: "40px 10px",
                }}
              >
                <p style={{ marginBottom: "14px" }}>
                  No StoryScope reports generated yet.
                </p>
                <button
                  onClick={() => {
                    setIsToolChestOpen(true);
                    setActiveTool("storyscope_final_review");
                  }}
                  style={{
                    background: "rgba(168, 85, 247, 0.15)",
                    color: "var(--accent-hover)",
                    border: "1px solid rgba(168, 85, 247, 0.3)",
                    padding: "6px 12px",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "0.75rem",
                    fontWeight: "600",
                  }}
                >
                  🔍 Run Multi-Agent Audit
                </button>
              </div>
            )}
          </div>
        ) : (
          /* AFFECT ARC — per-scene Plutchik trajectory from the graph */
          <div style={{ padding: "0 16px" }}>
            <div className="section-title" style={{ padding: "0 0 8px 0" }}>
              Emotional Arc — Plutchik per scene
            </div>
            {renderAffectArc()}
          </div>
        )}
      </aside>

      {/* POPUP FULL-SCREEN MANUSCRIPT READER MODAL */}
      {selectedDraft && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header-ui">
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span
                  style={{
                    fontSize: "1.05rem",
                    fontWeight: "600",
                    color: "#fff",
                  }}
                >
                  {selectedDraft.title}
                </span>
                <span
                  style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.4)" }}
                >
                  Prose Draft (v1)
                </span>
              </div>
              <button
                onClick={() => setSelectedDraft(null)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "rgba(255,255,255,0.5)",
                  fontSize: "1.2rem",
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>
            <div className="modal-body-ui">
              <div
                style={{
                  maxWidth: "700px",
                  margin: "0 auto",
                  fontFamily: "Georgia, serif",
                  lineHeight: 1.8,
                  fontSize: "1.05rem",
                  color: "rgba(255,255,255,0.85)",
                  letterSpacing: "0.01em",
                }}
              >
                {renderMarkdown(selectedDraft.content)}
              </div>
            </div>
            <div className="modal-footer-ui">
              <button
                onClick={() => {
                  setSelectedDraft(null);
                  setIsToolChestOpen(true);
                  setActiveTool("review_narrative");
                  updateFormState("reviewText", selectedDraft.content);
                  updateFormState("reviewSceneId", selectedDraft.id);
                }}
                style={{
                  background: "rgba(255,255,255,0.06)",
                  color: "#fff",
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                  fontSize: "0.78rem",
                  padding: "8px 14px",
                  cursor: "pointer",
                }}
              >
                🔍 Analyze Diagnostics
              </button>
              <button
                onClick={() => {
                  setSelectedDraft(null);
                  setIsToolChestOpen(true);
                  setActiveTool("rewrite_scene");
                  updateFormState("rewriteSceneText", selectedDraft.content);
                }}
                style={{
                  background: "rgba(168, 85, 247, 0.15)",
                  color: "var(--accent-hover)",
                  border: "1px solid rgba(168, 85, 247, 0.3)",
                  borderRadius: "6px",
                  fontSize: "0.78rem",
                  padding: "8px 14px",
                  cursor: "pointer",
                }}
              >
                ✍ Rewrite Scene
              </button>
              <button
                onClick={() => setSelectedDraft(null)}
                style={{
                  background: "var(--accent)",
                  color: "white",
                  border: "none",
                  borderRadius: "6px",
                  fontSize: "0.78rem",
                  fontWeight: "600",
                  padding: "8px 16px",
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POPUP FULL-SCREEN CHARACTER PROFILE SHEET MODAL */}
      {viewingChar && (
        <div className="modal-overlay">
          <div
            className="modal-content"
            style={{ maxWidth: "900px", width: "95vw" }}
          >
            <div className="modal-header-ui">
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span
                  style={{
                    fontSize: "1.15rem",
                    fontWeight: "700",
                    color: "#fff",
                    letterSpacing: "0.02em",
                  }}
                >
                  {viewingChar.name}
                </span>
                <span
                  style={{
                    fontSize: "0.72rem",
                    color: "var(--accent-hover)",
                    fontWeight: "500",
                  }}
                >
                  Psychological & Archetypal Character Sheet
                </span>
              </div>
              <button
                onClick={() => setViewingChar(null)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "rgba(255,255,255,0.5)",
                  fontSize: "1.2rem",
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>

            <div className="modal-body-ui" style={{ padding: "20px 24px" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1.8fr",
                  gap: "28px",
                }}
              >
                {/* Left Column: Stats & Profile */}
                <div
                  style={{
                    background: "rgba(255, 255, 255, 0.02)",
                    border: "1px solid var(--border)",
                    borderRadius: "12px",
                    padding: "20px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "18px",
                    height: "fit-content",
                  }}
                >
                  <div>
                    <span
                      style={{
                        fontSize: "0.7rem",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        color: "rgba(255,255,255,0.4)",
                      }}
                    >
                      Name
                    </span>
                    <h3
                      style={{
                        fontSize: "1.3rem",
                        fontWeight: "600",
                        color: "#fff",
                        marginTop: "2px",
                      }}
                    >
                      {viewingChar.name}
                    </h3>
                  </div>

                  <div>
                    <span
                      style={{
                        fontSize: "0.7rem",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        color: "rgba(255,255,255,0.4)",
                      }}
                    >
                      Jungian Archetype
                    </span>
                    <div style={{ marginTop: "4px" }}>
                      <span
                        className="char-archetype"
                        style={{
                          fontSize: "0.8rem",
                          padding: "4px 8px",
                          background: "rgba(168,85,247,0.15)",
                          color: "var(--accent-hover)",
                        }}
                      >
                        {viewingChar.archetype}
                      </span>
                    </div>
                  </div>

                  <div>
                    <span
                      style={{
                        fontSize: "0.7rem",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        color: "rgba(255,255,255,0.4)",
                        marginBottom: "8px",
                        display: "block",
                      }}
                    >
                      Panksepp Affect Profile
                    </span>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                        marginTop: "6px",
                      }}
                    >
                      {Object.entries(viewingChar.panksepp).map(
                        ([affect, val]) => {
                          let barColor = "var(--accent)";
                          if (affect === "FEAR") barColor = "var(--cortisol)";
                          if (affect === "RAGE") barColor = "#ef4444";
                          if (affect === "SEEKING")
                            barColor = "var(--dopamine)";
                          if (affect === "CARE") barColor = "var(--oxytocin)";
                          if (affect === "PLAY") barColor = "#10b981";
                          if (affect === "PANIC" || affect === "PANIC_GRIEF")
                            barColor = "#f59e0b";
                          if (affect === "LUST") barColor = "#ec4899";

                          return (
                            <div
                              key={affect}
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: "3px",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  fontSize: "0.68rem",
                                  fontWeight: "500",
                                }}
                              >
                                <span
                                  style={{ color: "rgba(255,255,255,0.7)" }}
                                >
                                  {affect}
                                </span>
                                <span style={{ color: barColor }}>
                                  {val}/10
                                </span>
                              </div>
                              <div
                                style={{
                                  height: "6px",
                                  width: "100%",
                                  background: "rgba(255,255,255,0.05)",
                                  borderRadius: "3px",
                                  overflow: "hidden",
                                }}
                              >
                                <div
                                  style={{
                                    height: "100%",
                                    width: `${val * 10}%`,
                                    background: barColor,
                                    borderRadius: "3px",
                                    boxShadow: `0 0 8px ${barColor}80`,
                                  }}
                                ></div>
                              </div>
                            </div>
                          );
                        },
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Column: Detailed Markdown Profile */}
                <div
                  style={{
                    maxHeight: "550px",
                    overflowY: "auto",
                    paddingRight: "8px",
                    lineHeight: "1.6",
                  }}
                >
                  <div
                    style={{
                      fontSize: "0.9rem",
                      color: "rgba(255,255,255,0.85)",
                    }}
                  >
                    {renderMarkdown(viewingChar.description)}
                  </div>
                </div>
              </div>
            </div>

            <div className="modal-footer-ui">
              <button
                onClick={() => {
                  setViewingChar(null);
                  setIsToolChestOpen(true);
                  setActiveTool("develop_character");
                  updateFormState("charAction", "update");
                  updateFormState("charName", viewingChar.name);
                }}
                style={{
                  background: "rgba(168, 85, 247, 0.15)",
                  color: "var(--accent-hover)",
                  border: "1px solid rgba(168, 85, 247, 0.3)",
                  borderRadius: "6px",
                  fontSize: "0.78rem",
                  padding: "8px 14px",
                  cursor: "pointer",
                }}
              >
                ✍ Edit Profile
              </button>
              <button
                onClick={() => setViewingChar(null)}
                style={{
                  background: "var(--accent)",
                  color: "white",
                  border: "none",
                  borderRadius: "6px",
                  fontSize: "0.78rem",
                  fontWeight: "600",
                  padding: "8px 16px",
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
