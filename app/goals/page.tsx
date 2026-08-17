"use client";

import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { SiteNav } from "@/components/SiteNav";
import { gunnersSnapshot, deriveHeroStats } from "@/lib/gunners";

const stats = deriveHeroStats(gunnersSnapshot);
const SUGGESTIONS = ["Saka goal compilation"];

interface Shot {
  start: number;
  end: number;
  text: string;
}
interface GoalsResult {
  query: string;
  playerUrl: string | null;
  shots: Shot[];
  count: number;
  error: string | null;
  mode?: "prepared-source-corpus";
  available?: boolean;
  sourceUrl?: string | null;
  sourceEmbedUrl?: string | null;
  title?: string | null;
  collectionId?: string;
  videoId?: string | null;
  provenance?: string;
}

const ts = (s: number) => {
  if (s == null || isNaN(s)) return "";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

function safePreparedEmbedUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "www.youtube-nocookie.com" && url.pathname === "/embed/CjXnBXQWNb0" && !url.search
      ? value
      : null;
  } catch {
    return null;
  }
}

function safePreparedSourceUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "www.youtube.com" && url.pathname === "/watch" && url.searchParams.get("v") === "CjXnBXQWNb0"
      ? value
      : null;
  } catch {
    return null;
  }
}

export default function GoalsPage() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GoalsResult | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const search = async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const r = await fetch(`/api/goals/search?q=${encodeURIComponent(q)}`);
      setResult(await r.json());
    } catch {
      setResult({ query: q, playerUrl: null, shots: [], count: 0, error: "search failed" });
    } finally {
      setLoading(false);
    }
  };

  // Attach the HLS supercut stream when a result arrives.
  useEffect(() => {
    const url = result?.playerUrl;
    const video = videoRef.current;
    if (!url || !video) return;
    let hls: Hls | undefined;
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url; // Safari native HLS
    } else if (Hls.isSupported()) {
      hls = new Hls();
      hls.loadSource(url);
      hls.attachMedia(video);
    }
    return () => hls?.destroy();
  }, [result?.playerUrl]);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteNav active="GOALS" liveNow={stats.liveNow} asOf={stats.asOf} />

      <main className="mx-auto w-full max-w-4xl px-6 pb-16">
        <div className="pt-10 pb-6">
          <h1 className="font-display" style={{ fontSize: 40, lineHeight: "94%", color: "#10182E" }}>
            ARSENAL GOALS
          </h1>
          <p style={{ fontSize: 14, color: "#7A7A7A", marginTop: 8, maxWidth: 640 }}>
            Operator-configured <strong style={{ color: "#10182E" }}>VideoDB</strong> can search Gunner
            goal highlights and compile a supercut. This public showcase includes one prepared source-corpus
            entry instead of a fresh semantic search.
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            search(input);
          }}
          className="flex items-center gap-2"
          style={{ background: "#fff", padding: 6, borderRadius: 100, border: "1px solid #E1E1E1", boxShadow: "0 6px 24px rgba(16,24,46,0.08)" }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Try the prepared Saka source compilation…"
            style={{ flex: 1, border: "none", borderRadius: 100, padding: "12px 18px", fontSize: 14, outline: "none", background: "transparent" }}
          />
          <button type="submit" disabled={loading} style={{ borderRadius: 100, padding: "12px 24px", fontSize: 14, fontWeight: 700, background: loading ? "#9AA3B2" : "#E30613", color: "#fff", cursor: "pointer" }}>
            {loading ? "Searching…" : "Search"}
          </button>
        </form>

        <div className="mt-4 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => { setInput(s); search(s); }}
              style={{ border: "1px solid #E1E1E1", borderRadius: 100, padding: "6px 12px", fontSize: 12, color: "#10182E", background: "#fff", cursor: "pointer" }}
            >
              {s}
            </button>
          ))}
        </div>

        {loading && (
          <p style={{ marginTop: 28, color: "#7A7A7A", fontSize: 14 }}>
            <span className="live-dot">●</span> Checking the prepared source corpus…
          </p>
        )}

        {result && !loading && (
          <div style={{ marginTop: 28 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", color: "#E30613" }}>
              {result.mode === "prepared-source-corpus"
                ? result.available
                  ? "PREPARED SOURCE-CORPUS FALLBACK"
                  : "FRESH SEMANTIC SEARCH UNAVAILABLE"
                : `${result.count} MOMENT${result.count === 1 ? "" : "S"} FOR “${result.query.toUpperCase()}”`}
            </div>

            {result.playerUrl ? (
              <video
                ref={videoRef}
                controls
                autoPlay
                muted
                playsInline
                style={{ marginTop: 14, width: "100%", borderRadius: 8, background: "#000", aspectRatio: "16 / 9" }}
              />
            ) : safePreparedEmbedUrl(result.sourceEmbedUrl) ? (
              <div style={{ marginTop: 14 }}>
                <iframe
                  src={safePreparedEmbedUrl(result.sourceEmbedUrl) ?? undefined}
                  title={result.title ?? "Prepared Bukayo Saka goal compilation"}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  referrerPolicy="strict-origin-when-cross-origin"
                  style={{ width: "100%", border: 0, borderRadius: 8, background: "#000", aspectRatio: "16 / 9" }}
                />
                <p style={{ marginTop: 10, fontSize: 13, color: "#4F4F4F" }}>
                  {result.provenance}
                  {safePreparedSourceUrl(result.sourceUrl) && (
                    <>
                      {" "}
                      <a href={safePreparedSourceUrl(result.sourceUrl) ?? undefined} target="_blank" rel="noreferrer" style={{ color: "#E30613", fontWeight: 700 }}>
                        Open the source compilation
                      </a>
                      .
                    </>
                  )}
                </p>
                <p style={{ marginTop: 8, fontSize: 11, color: "#9A9A9A" }}>
                  Tracked VideoDB ingestion record - collection {result.collectionId} - video {result.videoId}
                </p>
              </div>
            ) : (
              <p style={{ marginTop: 14, fontSize: 14, color: "#7A7A7A" }}>
                {result.error
                  ? result.error
                  : "No matching moments found — try another search."}
              </p>
            )}

            {result.shots.length > 0 && (
              <div className="mt-5 flex flex-col gap-2">
                {result.shots.map((s, i) => (
                  <div key={i} className="flex gap-3" style={{ fontSize: 13, lineHeight: "19px" }}>
                    <span style={{ fontWeight: 700, color: "#E30613", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                      {ts(s.start)}
                    </span>
                    <span style={{ color: "#4F4F4F" }}>{s.text || "match"}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <p style={{ marginTop: 28, fontSize: 11, color: "#9A9A9A" }}>
          Live mode uses VideoDB spoken-word indexing and semantic search over Gunner goal highlights. The
          public source-corpus fallback is recorded provenance, not a fresh VideoDB search or compiled reel.
        </p>
      </main>
    </div>
  );
}
