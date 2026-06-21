"use client";

import { useChat } from "@ai-sdk/react";
import { useState, useEffect, useRef } from "react";

// Types matching the workspace API
interface Character {
  name: string;
  archetype: string;
  description: string;
  panksepp: Record<string, number>;
}

interface Diagnostic {
  sceneId: string;
  cortisol: number;
  oxytocin: number;
  dopamine: number;
  pathologies: string[];
}

interface Story {
  id: string;
  name: string;
  characters: Character[];
  diagnostics: Diagnostic[];
  architectureBrief: string;
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
  },
  {
    id: "a_lonely_server_cooling",
    name: "A Lonely Server Cooling",
    characters: [
      {
        name: "HAL-90",
        archetype: "Deprecated Sentinel",
        description:
          "A backup cooling node in an abandoned data center that has outlived its creators. Core flaw: fear of absolute silence.",
        panksepp: { SEEKING: 4, FEAR: 8, RAGE: 3, PANIC: 7, PLAY: 1, CARE: 5 },
      },
    ],
    diagnostics: [
      {
        sceneId: "Scene 1",
        cortisol: 3,
        oxytocin: 6,
        dopamine: 4,
        pathologies: ["Flatlining Cortisol", "Moralizing Ending"],
      },
      {
        sceneId: "Scene 2",
        cortisol: 8,
        oxytocin: 3,
        dopamine: 7,
        pathologies: [],
      },
    ],
    architectureBrief:
      "A minimalist, atmospheric character study exploring Fichtean Curve peaks. The main conflict is Hal's decaying hardware vs. the rising temperature of the server room.",
  },
];

export default function ChatPage() {
  const { messages, sendMessage, status } = useChat();
  const [input, setInput] = useState("");

  // Workspace and UI states
  const [stories, setStories] = useState<Story[]>(MOCK_STORIES);
  const [activeStoryId, setActiveStoryId] = useState<string>("the_neon_codex");
  const [selectedChar, setSelectedChar] = useState<Character | null>(null);

  // Panel Tab States
  const [leftTab, setLeftTab] = useState<"characters" | "lore">("characters");
  const [rightTab, setRightTab] = useState<"pacing" | "diagnostics">("pacing");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isLoading = status === "submitted" || status === "streaming";

  // Fetch real workspace data
  useEffect(() => {
    async function fetchWorkspace() {
      try {
        const res = await fetch("/api/workspace");
        const data = await res.json();
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
        console.error(
          "Failed to load workspace, using fallback mock data.",
          err,
        );
      }
    }
    fetchWorkspace();
  }, []);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const activeStory = stories.find((s) => s.id === activeStoryId) || stories[0];

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
    sendMessage({ text: input });
    setInput("");
  };

  const triggerQuickAction = (text: string) => {
    if (isLoading) return;
    sendMessage({ text });
  };

  // Helper to render custom styled markdown paragraphs and headings
  const renderMarkdown = (text: string) => {
    if (!text) return null;
    return text.split("\n").map((line, idx) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("# ")) {
        return <h1 key={idx}>{trimmed.replace("# ", "")}</h1>;
      }
      if (trimmed.startsWith("## ")) {
        return <h2 key={idx}>{trimmed.replace("## ", "")}</h2>;
      }
      if (trimmed.startsWith("### ")) {
        return <h3 key={idx}>{trimmed.replace("### ", "")}</h3>;
      }
      if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        return (
          <li key={idx} style={{ marginLeft: "16px" }}>
            {trimmed.substring(2)}
          </li>
        );
      }
      if (trimmed.startsWith("```")) {
        if (trimmed === "```" || trimmed.startsWith("```")) return null; // Simple pre handler
      }
      // Check for bold text **
      if (trimmed.includes("**")) {
        const parts = trimmed.split("**");
        return (
          <p key={idx}>
            {parts.map((part, i) =>
              i % 2 === 1 ? <strong key={i}>{part}</strong> : part,
            )}
          </p>
        );
      }
      return trimmed ? <p key={idx}>{trimmed}</p> : <br key={idx} />;
    });
  };

  // Render Pacing Chart SVG
  const renderPacingChart = () => {
    const diags = activeStory?.diagnostics || [];
    if (diags.length === 0) {
      return (
        <div
          style={{
            padding: "40px",
            textAlign: "center",
            color: "rgba(255,255,255,0.3)",
          }}
        >
          No pacing diagnostics data found. Run a diagnostic scan to populate.
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

    // Build paths
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
          {/* Grid lines */}
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

          {/* Paths */}
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

          {/* Data Points Dots */}
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

  return (
    <div className="dashboard-layout">
      {/* LEFT PANEL: Workspace Explorer */}
      <aside className="left-sidebar">
        <div className="panel-header">
          <div className="logo-container">
            <div className="logo-dot"></div>
            <span className="logo-text">Advanced Writer</span>
          </div>
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

        <div className="tabs-bar">
          <button
            className={`tab-btn ${leftTab === "characters" ? "active" : ""}`}
            onClick={() => setLeftTab("characters")}
          >
            Characters
          </button>
          <button
            className={`tab-btn ${leftTab === "lore" ? "active" : ""}`}
            onClick={() => setLeftTab("lore")}
          >
            Architecture
          </button>
        </div>

        <div className="scroll-content">
          {leftTab === "characters" ? (
            <>
              <div className="section-title">Archetypal Database</div>
              {activeStory?.characters.map((char, idx) => (
                <div
                  key={idx}
                  className={`character-card ${selectedChar?.name === char.name ? "active" : ""}`}
                  onClick={() => setSelectedChar(char)}
                >
                  <div className="char-header">
                    <span className="char-name">{char.name}</span>
                    <span className="char-archetype">{char.archetype}</span>
                  </div>
                  <p className="char-desc">{char.description}</p>

                  <div className="panksepp-container">
                    <div className="panksepp-bar">
                      <span>SEEKING</span>
                      <div className="panksepp-bar-bg">
                        <div
                          className="panksepp-bar-fill"
                          style={{ width: `${char.panksepp.SEEKING * 10}%` }}
                        ></div>
                      </div>
                      <span>{char.panksepp.SEEKING}/10</span>
                    </div>
                    <div className="panksepp-bar">
                      <span>FEAR</span>
                      <div className="panksepp-bar-bg">
                        <div
                          className="panksepp-bar-fill"
                          style={{
                            width: `${char.panksepp.FEAR * 10}%`,
                            background: "var(--cortisol)",
                          }}
                        ></div>
                      </div>
                      <span>{char.panksepp.FEAR}/10</span>
                    </div>
                  </div>
                </div>
              ))}
            </>
          ) : (
            <div
              style={{
                padding: "16px",
                fontSize: "0.85rem",
                color: "rgba(255,255,255,0.7)",
              }}
            >
              <div className="section-title" style={{ padding: "0 0 10px 0" }}>
                Designing Principle
              </div>
              <div
                style={{
                  background: "var(--card-bg)",
                  padding: "14px",
                  borderRadius: "10px",
                  border: "1px solid var(--border)",
                  lineHeight: 1.5,
                }}
              >
                {activeStory?.architectureBrief}
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* CENTER PANEL: Writing Desk & Chat Copilot */}
      <main className="center-workspace">
        <div className="panel-header">
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: "0.95rem", fontWeight: "600" }}>
              Pair-Writing Workspace
            </span>
            <span
              style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.4)" }}
            >
              Copilot Model: Claude 3.7 Sonnet
            </span>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <span
              className="char-archetype"
              style={{
                background: "rgba(168,85,247,0.15)",
                color: "var(--accent-hover)",
              }}
            >
              {activeStory?.name}
            </span>
          </div>
        </div>

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
                Ask the Copilot to brainstorm character flaws, outline scene
                beats, or trigger targeted character debates to resolve
                manuscript pathologies.
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
      </main>

      {/* RIGHT PANEL: Analytics */}
      <aside className="right-analytics">
        <div className="panel-header">
          <span style={{ fontSize: "0.9rem", fontWeight: "600" }}>
            Neurochemical & Diagnostics
          </span>
        </div>

        <div className="tabs-bar">
          <button
            className={`tab-btn ${rightTab === "pacing" ? "active" : ""}`}
            onClick={() => setRightTab("pacing")}
          >
            Pacing Chart
          </button>
          <button
            className={`tab-btn ${rightTab === "diagnostics" ? "active" : ""}`}
            onClick={() => setRightTab("diagnostics")}
          >
            Pathologies (
            {
              activeStory?.diagnostics.filter((d) => d.pathologies.length > 0)
                .length
            }
            )
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
              {activeStory?.diagnostics.map((d, i) => (
                <div
                  key={i}
                  className="diag-item"
                  style={{ marginBottom: "8px" }}
                >
                  <div className="diag-header">
                    <span className="diag-scene-id">{d.sceneId}</span>
                    <div className="diag-scores">
                      <span className="score-badge c">C: {d.cortisol}</span>
                      <span className="score-badge o">O: {d.oxytocin}</span>
                      <span className="score-badge d">D: {d.dopamine}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="diag-list">
            <div className="section-title" style={{ padding: "0 0 10px 0" }}>
              Active Pathologies
            </div>
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
        )}
      </aside>
    </div>
  );
}
