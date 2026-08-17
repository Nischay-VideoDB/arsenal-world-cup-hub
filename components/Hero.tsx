import type { HeroStats } from "@/lib/gunners";

function Stat({ value, label, accent }: { value: string | number; label: string; accent?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span
        className="font-display"
        style={{ fontSize: 34, lineHeight: "100%", color: accent ? "#F00000" : "#FFFFFF" }}
      >
        {value}
      </span>
      <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", color: "#8893A8", marginTop: 6 }}>
        {label}
      </span>
    </div>
  );
}

export function Hero({ stats }: { stats: HeroStats }) {
  return (
    <header style={{ background: "#10182E" }} className="px-10 pt-12 pb-11">
      <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.18em", color: "#F00000" }}>
        {stats.stage}
      </p>
      <h1
        className="font-display"
        style={{ fontSize: 60, lineHeight: "94%", color: "#FFFFFF", marginTop: 18, maxWidth: 720 }}
      >
        THE GUNNERS AT
        <br />
        THE WORLD CUP
      </h1>
      <div className="mt-9 grid grid-cols-2 gap-x-6 gap-y-6 sm:flex sm:items-stretch sm:gap-7">
        <Stat value={stats.players} label="PLAYERS" />
        <div className="hidden sm:block" style={{ width: 1, background: "rgba(255,255,255,0.18)" }} />
        <Stat value={stats.nations} label="NATIONS" />
        <div className="hidden sm:block" style={{ width: 1, background: "rgba(255,255,255,0.18)" }} />
        <Stat value={stats.liveNow} label="LIVE NOW" accent />
        <div className="hidden sm:block" style={{ width: 1, background: "rgba(255,255,255,0.18)" }} />
        <Stat value={stats.goals} label="GOALS SO FAR" />
      </div>
    </header>
  );
}
