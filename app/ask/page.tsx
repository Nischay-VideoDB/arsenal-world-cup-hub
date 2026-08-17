"use client";

import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { SiteNav } from "@/components/SiteNav";
import { gunnersSnapshot, deriveHeroStats } from "@/lib/gunners";

const stats = deriveHeroStats(gunnersSnapshot);

const SUGGESTIONS = [
  "Which Gunners are in the prepared roster?",
  "Who's representing Spain at the World Cup?",
  "Who is marked live in the prepared snapshot?",
  "Show Arsenal's goalkeepers and defenders.",
];

/* eslint-disable @typescript-eslint/no-explicit-any */
function ToolTrace({ part }: { part: any }) {
  const name = String(part.type).replace(/^tool-/, "");
  const running = part.state === "input-streaming" || part.state === "input-available";
  const query = part.input?.query ?? part.input?.nation ?? JSON.stringify(part.input ?? {});
  let output = part.output;
  const prepared = output?.prepared === true;
  if (output && typeof output !== "string") output = output.results ?? JSON.stringify(output);

  return (
    <div
      style={{
        borderLeft: "2px solid #BEAC88",
        background: "#F7F8FA",
        borderRadius: 6,
        padding: "10px 12px",
        margin: "8px 0",
      }}
    >
      <div className="flex items-center gap-2" style={{ marginBottom: query ? 4 : 0 }}>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", color: "#10182E" }}>
          TOOL
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#E30613" }}>{name}</span>
        {prepared && (
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", color: "#146B4A" }}>
            PREPARED SNAPSHOT
          </span>
        )}
        <span style={{ fontSize: 10, color: running ? "#B58900" : "#7A7A7A" }}>
          {running ? "· running…" : "· done"}
        </span>
      </div>
      {query && (
        <div style={{ fontSize: 12, color: "#4F4F4F", fontFamily: "var(--font-mono, monospace)" }}>
          {String(query)}
        </div>
      )}
      {typeof output === "string" && output && (
        <pre
          style={{
            marginTop: 6,
            fontSize: 11,
            lineHeight: "16px",
            color: "#7A7A7A",
            whiteSpace: "pre-wrap",
            maxHeight: 132,
            overflow: "auto",
          }}
        >
          {output.length > 600 ? output.slice(0, 600) + "…" : output}
        </pre>
      )}
    </div>
  );
}

export default function AskPage() {
  const { messages, sendMessage, status, stop, error, regenerate } = useChat({
    transport: new DefaultChatTransport({ api: "/api/ask" }),
  });
  const [input, setInput] = useState("");
  const busy = status === "submitted" || status === "streaming";

  const send = (text: string) => {
    if (!text.trim() || busy) return;
    sendMessage({ text });
    setInput("");
  };

  return (
    <div className="flex min-h-screen flex-col">
      <SiteNav active="ASK" liveNow={stats.liveNow} asOf={stats.asOf} />

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 pb-6">
        <div className="pt-10 pb-6">
          <h1 className="font-display" style={{ fontSize: 40, lineHeight: "94%", color: "#10182E" }}>
            ASK THE GUNNERS DESK
          </h1>
          <p style={{ fontSize: 14, color: "#7A7A7A", marginTop: 8 }}>
            The public showcase answers roster questions from a prepared Arsenal snapshot and shows its
            tool-trace. Live model and web answers require operator configuration.
          </p>
        </div>

        {/* Messages */}
        <div className="flex-1 space-y-5">
          {messages.length === 0 && (
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  style={{
                    border: "1px solid #E1E1E1",
                    borderRadius: 100,
                    padding: "8px 14px",
                    fontSize: 13,
                    color: "#10182E",
                    background: "#fff",
                    cursor: "pointer",
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {messages.map((m) => (
            <div key={m.id} className={m.role === "user" ? "flex justify-end" : ""}>
              <div style={{ maxWidth: m.role === "user" ? "80%" : "100%" }}>
                {m.role === "assistant" && (
                  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", color: "#E30613", marginBottom: 6 }}>
                    GUNNERS DESK
                  </div>
                )}
                {m.parts.map((part: any, i: number) => {
                  if (part.type === "text")
                    return (
                      <div
                        key={i}
                        style={
                          m.role === "user"
                            ? { background: "#10182E", color: "#fff", borderRadius: 12, padding: "10px 14px", fontSize: 14, lineHeight: "21px" }
                            : { color: "#10182E", fontSize: 15, lineHeight: "24px", whiteSpace: "pre-wrap" }
                        }
                      >
                        {part.text}
                      </div>
                    );
                  if (part.type === "reasoning" && part.text)
                    return (
                      <details key={i} style={{ margin: "4px 0" }}>
                        <summary style={{ fontSize: 11, color: "#9A9A9A", cursor: "pointer", listStyle: "none" }}>
                          ▸ reasoning
                        </summary>
                        <div style={{ fontSize: 12, color: "#9A9A9A", lineHeight: "18px", whiteSpace: "pre-wrap", marginTop: 4, paddingLeft: 12, borderLeft: "1px solid #EEE" }}>
                          {part.text}
                        </div>
                      </details>
                    );
                  if (String(part.type).startsWith("tool-")) return <ToolTrace key={i} part={part} />;
                  return null;
                })}
              </div>
            </div>
          ))}

          {status === "submitted" && (
            <div style={{ fontSize: 13, color: "#7A7A7A" }}>
              <span className="live-dot">●</span> Gunners Desk is thinking…
            </div>
          )}

          {error && (
            <div style={{ background: "#FDECEC", border: "1px solid #F5C2C2", borderRadius: 8, padding: "12px 14px" }}>
              <span style={{ fontSize: 13, color: "#B00020" }}>
                The Gunners Desk hit a snag: {error.message || "request failed"}.
              </span>
              <button
                onClick={() => regenerate()}
                style={{ marginLeft: 10, fontSize: 13, fontWeight: 700, color: "#E30613", background: "none", border: "none", cursor: "pointer" }}
              >
                Retry
              </button>
            </div>
          )}
        </div>

        {/* Composer */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="sticky bottom-4 mt-6 flex items-center gap-2"
          style={{
            background: "#fff",
            padding: 6,
            borderRadius: 100,
            border: "1px solid #E1E1E1",
            boxShadow: "0 6px 24px rgba(16,24,46,0.10)",
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about Arsenal at the World Cup…"
            style={{
              flex: 1,
              border: "none",
              borderRadius: 100,
              padding: "12px 18px",
              fontSize: 14,
              outline: "none",
              background: "transparent",
            }}
          />
          {busy ? (
            <button
              type="button"
              onClick={() => stop()}
              style={{ borderRadius: 100, padding: "12px 20px", fontSize: 14, fontWeight: 700, background: "#10182E", color: "#fff", cursor: "pointer" }}
            >
              Stop
            </button>
          ) : (
            <button
              type="submit"
              style={{ borderRadius: 100, padding: "12px 22px", fontSize: 14, fontWeight: 700, background: "#E30613", color: "#fff", cursor: "pointer" }}
            >
              Ask
            </button>
          )}
        </form>
      </main>
    </div>
  );
}
