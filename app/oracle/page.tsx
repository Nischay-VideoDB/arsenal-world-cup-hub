"use client";

import { useState } from "react";
import { SiteNav } from "@/components/SiteNav";
import { gunnersSnapshot, deriveHeroStats } from "@/lib/gunners";

const stats = deriveHeroStats(gunnersSnapshot);

interface OracleResult {
  player: { name: string; nation: string; position: string; opponent: string };
  code: string;
  chart: string | null;
  parsed: { win: number; draw: number; loss: number; expGoals: number; expAssists: number } | null;
  usedFallback: boolean;
  prepared?: boolean;
  error: string | null;
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex flex-col" style={{ minWidth: 90 }}>
      <span className="font-display" style={{ fontSize: 38, lineHeight: "100%", color: accent ? "#E30613" : "#10182E" }}>
        {value}
      </span>
      <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", color: "#7A7A7A", marginTop: 6 }}>
        {label}
      </span>
    </div>
  );
}

export default function OraclePage() {
  const [key, setKey] = useState(gunnersSnapshot[0].key);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OracleResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCode, setShowCode] = useState(false);

  const run = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await fetch("/api/oracle", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playerKey: key }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setResult(await r.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <SiteNav active="ORACLE" liveNow={stats.liveNow} asOf={stats.asOf} />

      <main className="mx-auto w-full max-w-4xl px-6 pb-16">
        <div className="pt-10 pb-6">
          <h1 className="font-display" style={{ fontSize: 40, lineHeight: "94%", color: "#10182E" }}>
            PLAYER ORACLE
          </h1>
          <p style={{ fontSize: 14, color: "#7A7A7A", marginTop: 8, maxWidth: 640 }}>
            Run a fresh 20,000-match Monte Carlo projection. A live model writes the inspectable simulation
            proposal while a bounded, server-verified runner computes the displayed probabilities.
          </p>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={key}
            onChange={(e) => setKey(e.target.value)}
            disabled={loading}
            style={{ border: "1px solid #E1E1E1", borderRadius: 100, padding: "11px 18px", fontSize: 14, background: "#fff", minWidth: 280 }}
          >
            {gunnersSnapshot.map((g) => (
              <option key={g.key} value={g.key}>
                {g.name} — {g.nation} {g.opponent}
              </option>
            ))}
          </select>
          <button
            onClick={run}
            disabled={loading}
            style={{ borderRadius: 100, padding: "11px 26px", fontSize: 14, fontWeight: 700, background: loading ? "#9AA3B2" : "#E30613", color: "#fff", cursor: loading ? "default" : "pointer" }}
          >
            {loading ? "Running…" : "Run the Oracle"}
          </button>
        </div>

        {loading && (
          <div style={{ marginTop: 28, color: "#7A7A7A", fontSize: 14 }}>
            <p><span className="live-dot">●</span> The live model is writing the simulation…</p>
            <p style={{ marginTop: 6 }}><span className="live-dot">●</span> The verified runner is simulating 20,000 matches…</p>
          </div>
        )}

        {error && (
          <p style={{ marginTop: 24, color: "#E30613", fontSize: 14 }}>Oracle error: {error}</p>
        )}

        {result && (
          <div style={{ marginTop: 32 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", color: "#E30613" }}>
              {result.player.nation.toUpperCase()} {result.player.opponent ? `vs ${result.player.opponent.toUpperCase()}` : ""} · {result.player.name}
            </div>
            {result.prepared && (
              <p style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: "#146B4A" }}>
                PREPARED FALLBACK - deterministic projection; no model or sandbox call was made.
              </p>
            )}

            {!result.chart && !result.parsed && (
              <p style={{ marginTop: 14, fontSize: 14, color: "#E30613" }}>
                The Oracle couldn&apos;t complete a simulation
                {result.error ? ` (${result.error})` : ""}. Please run it again.
              </p>
            )}

            <div className="mt-5 flex flex-wrap gap-8" style={{ alignItems: "flex-start" }}>
              {result.chart && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={`data:image/png;base64,${result.chart}`}
                  alt="Monte Carlo win probability chart"
                  style={{ width: 460, maxWidth: "100%", border: "1px solid #E6E6E6", borderRadius: 8 }}
                />
              )}
              {result.parsed && (
                <div className="flex flex-col gap-6">
                  <div className="flex gap-6">
                    <Metric label="WIN" value={`${result.parsed.win}%`} accent />
                    <Metric label="DRAW" value={`${result.parsed.draw}%`} />
                    <Metric label="LOSS" value={`${result.parsed.loss}%`} />
                  </div>
                  <div className="flex gap-6">
                    <Metric label={`${result.player.name.split(" ").slice(-1)[0]} xG`} value={`${result.parsed.expGoals}`} accent />
                    <Metric label="xA" value={`${result.parsed.expAssists}`} />
                  </div>
                </div>
              )}
            </div>

            <div style={{ marginTop: 24 }}>
              <button
                onClick={() => setShowCode((v) => !v)}
                style={{ fontSize: 12, fontWeight: 700, color: "#10182E", background: "none", cursor: "pointer", border: "none", padding: 0 }}
              >
                {showCode ? "▾" : "▸"} {result.usedFallback ? "Simulation code (demo-safety template)" : "Kimi-generated simulation code"}
              </button>
              {showCode && (
                <pre
                  style={{
                    marginTop: 10,
                    background: "#10182E",
                    color: "#E6E9F0",
                    borderRadius: 8,
                    padding: 16,
                    fontSize: 12,
                    lineHeight: "18px",
                    overflow: "auto",
                    maxHeight: 420,
                  }}
                >
                  {result.code}
                </pre>
              )}
            </div>

            <p style={{ marginTop: 16, fontSize: 11, color: "#9A9A9A" }}>
              {result.prepared
                ? "Prepared deterministic projection from the tracked roster context."
                : "Live model proposal via OpenRouter · server-verified Monte Carlo runner · N=20,000"}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
