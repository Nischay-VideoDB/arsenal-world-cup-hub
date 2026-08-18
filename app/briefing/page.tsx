"use client";

import { useCallback, useEffect, useState } from "react";
import { SiteNav } from "@/components/SiteNav";
import { gunnersSnapshot, deriveHeroStats } from "@/lib/gunners";

const stats = deriveHeroStats(gunnersSnapshot);
const SECTION_LABELS = ["LIVE NOW:", "TODAY'S RESULTS:", "COMING UP:"];

function renderBriefing(text: string) {
  const blocks = text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  if (blocks.length === 0) return null;
  const [headline, ...rest] = blocks;
  return (
    <>
      <h2 className="font-display" style={{ fontSize: 30, lineHeight: "104%", color: "#10182E", maxWidth: 680 }}>
        {headline.replace(/\*\*/g, "")}
      </h2>
      <div className="mt-6 flex flex-col gap-4">
        {rest.map((block, i) => {
          const clean = block.replace(/\*\*/g, "").replace(/^[-*]\s+/, "").trim();
          const label = SECTION_LABELS.find((l) => clean.toUpperCase().startsWith(l));
          if (label) {
            const body = clean.slice(label.length).trim();
            return (
              <p key={i} style={{ fontSize: 15, lineHeight: "24px", color: "#10182E" }}>
                <span style={{ fontWeight: 800, letterSpacing: "0.04em", color: "#E30613", marginRight: 8 }}>
                  {label}
                </span>
                {body}
              </p>
            );
          }
          return (
            <p key={i} style={{ fontSize: 15, lineHeight: "24px", color: "#10182E" }}>
              {clean}
            </p>
          );
        })}
      </div>
    </>
  );
}

export default function BriefingPage() {
  const [text, setText] = useState("");
  const [prepared, setPrepared] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBriefing = useCallback(async () => {
    const r = await fetch("/api/briefing");
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json() as { text?: string; prepared?: boolean };
    return { text: j.text ?? "", prepared: j.prepared === true };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const briefing = await fetchBriefing();
      setText(briefing.text);
      setPrepared(briefing.prepared);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load briefing.");
    } finally {
      setLoading(false);
    }
  }, [fetchBriefing]);

  useEffect(() => {
    let active = true;
    void fetchBriefing()
      .then((briefing) => {
        if (active) {
          setText(briefing.text);
          setPrepared(briefing.prepared);
        }
      })
      .catch((e: unknown) => {
        if (active) setError(e instanceof Error ? e.message : "Failed to load briefing.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [fetchBriefing]);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteNav active="BRIEFING" liveNow={stats.liveNow} asOf={stats.asOf} />

      <main className="mx-auto w-full max-w-3xl px-6 pb-16">
        <div className="flex items-end justify-between pt-10 pb-6">
          <div>
            <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.18em", color: "#E30613" }}>
              DAILY GUNNERS BRIEFING · 13 JUN 2026
            </p>
            <h1 className="font-display" style={{ fontSize: 40, lineHeight: "94%", color: "#10182E", marginTop: 10 }}>
              THE GUNNERS&apos; WORLD CUP, TODAY
            </h1>
          </div>
          <button
            onClick={load}
            disabled={loading}
            style={{ borderRadius: 100, padding: "9px 18px", fontSize: 13, fontWeight: 700, background: loading ? "#9AA3B2" : "#10182E", color: "#fff", cursor: loading ? "default" : "pointer", flexShrink: 0 }}
          >
            {loading ? "Writing…" : "Regenerate"}
          </button>
        </div>

        <div style={{ borderTop: "2px solid #E30613", paddingTop: 24 }}>
          {loading && (
            <p style={{ color: "#7A7A7A", fontSize: 14 }}>
              <span className="live-dot">●</span> Kimi is writing today&apos;s briefing from the live Gunners tracker…
            </p>
          )}
          {error && <p style={{ color: "#E30613", fontSize: 14 }}>Briefing error: {error}</p>}
          {!loading && !error && renderBriefing(text)}
        </div>

        {!loading && prepared && (
          <p style={{ marginTop: 16, fontSize: 12, fontWeight: 700, color: "#146B4A" }}>
            PREPARED FALLBACK - deterministic briefing from the recorded Gunners snapshot; no model call was made.
          </p>
        )}

        <p style={{ marginTop: 28, fontSize: 11, color: "#9A9A9A" }}>
          {prepared
            ? "Prepared from the recorded Gunners snapshot."
            : "Freshly written via OpenRouter from the tracked Gunners snapshot; the generation run is durably audited."}
        </p>
      </main>
    </div>
  );
}
