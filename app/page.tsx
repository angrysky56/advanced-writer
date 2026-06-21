"use client";

import { useChat } from "@ai-sdk/react";
import { useState } from "react";

export default function ChatPage() {
  const { messages, sendMessage, status } = useChat();
  const [input, setInput] = useState("");

  const isLoading = status === "submitted" || status === "streaming";

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage({ text: input });
    setInput("");
  };

  return (
    <div className="chat-container">
      <div className="messages">
        {messages.length === 0 && (
          <div className="message assistant">
            Hello! I am your AI Writer Copilot. Ask me to brainstorm, review
            drafts, or generate the manuscript.
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`message ${m.role}`}>
            {m.parts.map((part, idx) => {
              if (part.type === "text") {
                return <div key={idx}>{part.text}</div>;
              }
              if (part.type === "reasoning") {
                return (
                  <div key={idx} className="reasoning" style={{ fontStyle: "italic", opacity: 0.7 }}>
                    {part.text}
                  </div>
                );
              }
              if (part.type.startsWith("tool-") || part.type === "dynamic-tool") {
                const toolPart = part as any;
                const toolName = toolPart.toolName || (part.type.startsWith("tool-") ? part.type.slice(5) : "tool");
                return (
                  <div key={toolPart.toolCallId || idx} className="tool-invocation">
                    {toolPart.state === "output-available" || toolPart.state === "output-error" ? (
                      <span>
                        ✅ Completed <strong>{toolName}</strong>
                      </span>
                    ) : (
                      <span>
                        ⏳ Executing <strong>{toolName}</strong>...
                      </span>
                    )}
                  </div>
                );
              }
              return null;
            })}
          </div>
        ))}
        {isLoading && (
          <div className="message assistant" style={{ opacity: 0.5 }}>
            Thinking...
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="input-area">
        <input
          value={input}
          onChange={handleInputChange}
          placeholder="Ask the copilot to write, research, or edit..."
          disabled={isLoading}
        />
        <button type="submit" disabled={isLoading || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
